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
      AND (EXISTS (SELECT 1 FROM public.visita_mensajes m WHERE m.visita_id = v.id AND m.autor_id IS NOT NULL AND m.autor_id <> u)
        OR EXISTS (SELECT 1 FROM public.visita_bloques b WHERE b.visita_id = v.id AND b.validacion = 'NO CORRECTO' AND b.revisado_por IS DISTINCT FROM u))
  ), calc AS (
    SELECT b.*,
      ((SELECT count(*) FROM public.visita_mensajes m WHERE m.visita_id = b.id AND m.autor_id IS NOT NULL AND m.autor_id <> u AND m.created_at > b.leido)
       + (SELECT count(*) FROM public.visita_bloques x WHERE x.visita_id = b.id AND x.validacion = 'NO CORRECTO' AND x.revisado_por IS DISTINCT FROM u AND coalesce(x.revisado_en, x.updated_at) > b.leido))::int AS nuevos,
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