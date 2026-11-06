CREATE TABLE public.visita_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES public.visitas(id) ON DELETE CASCADE,
  bloque_id uuid REFERENCES public.visita_bloques(id) ON DELETE SET NULL,
  autor_id uuid,
  autor_nombre text,
  texto text NOT NULL CHECK (length(btrim(texto)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visita_mensajes_visita_idx ON public.visita_mensajes (visita_id, created_at);
CREATE INDEX visita_mensajes_bloque_idx ON public.visita_mensajes (bloque_id);
GRANT SELECT, INSERT, DELETE ON public.visita_mensajes TO authenticated;
GRANT ALL ON public.visita_mensajes TO service_role;

CREATE TABLE public.visita_lecturas (
  visita_id uuid NOT NULL REFERENCES public.visitas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  leido_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visita_id, user_id)
);
CREATE INDEX visita_lecturas_user_idx ON public.visita_lecturas (user_id);
GRANT SELECT, INSERT, UPDATE ON public.visita_lecturas TO authenticated;
GRANT ALL ON public.visita_lecturas TO service_role;

CREATE OR REPLACE FUNCTION public.puede_conversar_visita(_visita_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.visitas v WHERE v.id = _visita_id AND (
      v.user_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR (public.puede_revisar_visitas(auth.uid()) AND public.puede_ver_bloque(_visita_id))
    ))
$$;
REVOKE ALL ON FUNCTION public.puede_conversar_visita(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_conversar_visita(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.visita_mensajes_autor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.autor_id := auth.uid();
    SELECT coalesce(nullif(p.full_name,''), p.email) INTO NEW.autor_nombre FROM public.profiles p WHERE p.user_id = auth.uid();
    NEW.created_at := now();
  END IF;
  IF NEW.bloque_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.visita_bloques b WHERE b.id = NEW.bloque_id AND b.visita_id = NEW.visita_id) THEN
    RAISE EXCEPTION 'El bloque no pertenece a la visita';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.visita_mensajes_autor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER visita_mensajes_autor BEFORE INSERT ON public.visita_mensajes FOR EACH ROW EXECUTE FUNCTION public.visita_mensajes_autor();

ALTER TABLE public.visita_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conversación: leer" ON public.visita_mensajes FOR SELECT TO authenticated USING (public.puede_conversar_visita(visita_id));
CREATE POLICY "Conversación: escribir" ON public.visita_mensajes FOR INSERT TO authenticated WITH CHECK (public.puede_conversar_visita(visita_id));
CREATE POLICY "Conversación: borrar admin" ON public.visita_mensajes FOR DELETE TO authenticated USING ((SELECT public.is_approved(auth.uid())) AND public.is_admin(auth.uid()));

ALTER TABLE public.visita_lecturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecturas propias: leer" ON public.visita_lecturas FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Lecturas propias: crear" ON public.visita_lecturas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Lecturas propias: actualizar" ON public.visita_lecturas FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Backfill: solo notas importadas de Gespromo (las 9 de la app quedan a la espera de confirmación)
INSERT INTO public.visita_mensajes (visita_id, bloque_id, autor_id, autor_nombre, texto, created_at)
SELECT b.visita_id, b.id, NULL, 'Gespromo (importado)', btrim(b.nota_revision), v.fecha::timestamptz
FROM public.visita_bloques b JOIN public.visitas v ON v.id = b.visita_id
WHERE v.origen = 'gespromo' AND coalesce(btrim(b.nota_revision),'') <> '';
COMMENT ON COLUMN public.visita_bloques.nota_revision IS 'DEPRECATED: histórico; los mensajes van en visita_mensajes';

CREATE OR REPLACE FUNCTION public.marcar_visita_leida(_visita_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.puede_conversar_visita(_visita_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  INSERT INTO public.visita_lecturas (visita_id, user_id, leido_en) VALUES (_visita_id, auth.uid(), now())
  ON CONFLICT (visita_id, user_id) DO UPDATE SET leido_en = now();
END $$;

CREATE OR REPLACE FUNCTION public.mensajes_visita(_visita_id uuid)
RETURNS TABLE (id uuid, bloque_id uuid, autor_id uuid, autor_nombre text, texto text, created_at timestamptz, es_dueno boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.puede_conversar_visita(_visita_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY SELECT m.id, m.bloque_id, m.autor_id, m.autor_nombre, m.texto, m.created_at,
    (m.autor_id IS NOT NULL AND m.autor_id = v.user_id)
  FROM public.visita_mensajes m JOIN public.visitas v ON v.id = m.visita_id
  WHERE m.visita_id = _visita_id ORDER BY m.created_at, m.id;
END $$;

-- Novedades del comercial (dueño)
CREATE OR REPLACE FUNCTION public.mis_revisiones(_filtro text DEFAULT 'sin_leer', _limite int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE (visita_id uuid, cliente text, fecha date, bloques jsonb, ultimo_texto text, ultimo_autor text, ultimo_en timestamptz, sin_leer int, esperando boolean, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF NOT public.is_approved(u) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT v.id, coalesce(c.cliente, v.cliente_externo, '—') AS cli, v.fecha,
      coalesce(l.leido_en, '-infinity'::timestamptz) AS leido
    FROM public.visitas v
    LEFT JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    LEFT JOIN public.visita_lecturas l ON l.visita_id = v.id AND l.user_id = u
    WHERE v.user_id = u
      AND (EXISTS (SELECT 1 FROM public.visita_mensajes m WHERE m.visita_id = v.id AND m.autor_id IS DISTINCT FROM u AND m.autor_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM public.visita_bloques b WHERE b.visita_id = v.id AND b.validacion = 'no_correcto' AND b.revisado_por IS DISTINCT FROM u))
  ), calc AS (
    SELECT b.*,
      ((SELECT count(*) FROM public.visita_mensajes m WHERE m.visita_id = b.id AND m.autor_id IS NOT NULL AND m.autor_id <> u AND m.created_at > b.leido)
       + (SELECT count(*) FROM public.visita_bloques x WHERE x.visita_id = b.id AND x.validacion = 'no_correcto' AND x.revisado_por IS DISTINCT FROM u AND coalesce(x.revisado_en, x.updated_at) > b.leido))::int AS nuevos,
      (SELECT m.texto FROM public.visita_mensajes m WHERE m.visita_id = b.id ORDER BY m.created_at DESC LIMIT 1) AS ut,
      (SELECT m.autor_nombre FROM public.visita_mensajes m WHERE m.visita_id = b.id ORDER BY m.created_at DESC LIMIT 1) AS ua,
      (SELECT max(m.created_at) FROM public.visita_mensajes m WHERE m.visita_id = b.id) AS ue,
      EXISTS (SELECT 1 FROM (
          SELECT DISTINCT ON (coalesce(m.bloque_id::text,'')) m.autor_id FROM public.visita_mensajes m
          WHERE m.visita_id = b.id ORDER BY coalesce(m.bloque_id::text,''), m.created_at DESC) t
        WHERE t.autor_id IS NOT NULL AND t.autor_id <> u) AS esp
    FROM base b
  ), f AS (
    SELECT * FROM calc WHERE CASE _filtro WHEN 'sin_leer' THEN nuevos > 0 WHEN 'esperando' THEN esp ELSE true END
  )
  SELECT f.id, f.cli, f.fecha,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'motivo', mv.nombre, 'validacion', x.validacion) ORDER BY x.orden)
      FROM public.visita_bloques x LEFT JOIN public.motivos_visita mv ON mv.key = x.motivo_key WHERE x.visita_id = f.id), '[]'::jsonb),
    f.ut, f.ua, f.ue, f.nuevos, f.esp, count(*) OVER ()
  FROM f ORDER BY (f.nuevos > 0) DESC, coalesce(f.ue, f.fecha::timestamptz) DESC
  LIMIT least(greatest(_limite,1),200) OFFSET greatest(_offset,0);
END $$;

-- Respuestas del comercial sin leer por el revisor
CREATE OR REPLACE FUNCTION public.revision_respuestas_nuevas(_limite int DEFAULT 500, _offset int DEFAULT 0)
RETURNS TABLE (visita_id uuid, nuevos int, ultimo_en timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF NOT public.puede_revisar_visitas(u) THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.visita_id, count(*)::int, max(m.created_at), count(*) OVER ()
  FROM public.visita_mensajes m
  JOIN public.visitas v ON v.id = m.visita_id
  LEFT JOIN public.visita_lecturas l ON l.visita_id = v.id AND l.user_id = u
  WHERE m.autor_id IS NOT NULL AND m.autor_id = v.user_id AND v.user_id <> u
    AND m.created_at > coalesce(l.leido_en, '-infinity'::timestamptz)
    AND public.puede_ver_bloque(v.id)
  GROUP BY m.visita_id
  ORDER BY max(m.created_at) DESC
  LIMIT least(greatest(_limite,1),1000) OFFSET greatest(_offset,0);
END $$;

CREATE OR REPLACE FUNCTION public.contadores_mensajes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); a int := 0; b int := 0;
BEGIN
  IF NOT public.is_approved(u) THEN RETURN jsonb_build_object('mis_revisiones',0,'respuestas_nuevas',0); END IF;
  SELECT count(*) INTO a FROM public.mis_revisiones('sin_leer', 200, 0);
  IF public.puede_revisar_visitas(u) THEN
    SELECT count(DISTINCT m.visita_id) INTO b
    FROM public.visita_mensajes m JOIN public.visitas v ON v.id = m.visita_id
    LEFT JOIN public.visita_lecturas l ON l.visita_id = v.id AND l.user_id = u
    WHERE m.autor_id IS NOT NULL AND m.autor_id = v.user_id AND v.user_id <> u
      AND m.created_at > coalesce(l.leido_en, '-infinity'::timestamptz)
      AND public.puede_ver_bloque(v.id);
  END IF;
  RETURN jsonb_build_object('mis_revisiones', a, 'respuestas_nuevas', b);
END $$;

REVOKE ALL ON FUNCTION public.marcar_visita_leida(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mensajes_visita(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_revisiones(text,int,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revision_respuestas_nuevas(int,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contadores_mensajes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_visita_leida(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mensajes_visita(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_revisiones(text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revision_respuestas_nuevas(int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contadores_mensajes() TO authenticated;