CREATE TABLE public.ofertas_descartes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id uuid NOT NULL REFERENCES public.ofertas(id) ON DELETE CASCADE,
  cod_cliente integer NOT NULL REFERENCES public.clientes(cod_cliente) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  motivo text NOT NULL CHECK (motivo IN ('no_interesa','ya_lo_tiene','otro')),
  nota text,
  alcance text NOT NULL DEFAULT 'oferta' CHECK (alcance IN ('oferta','familia')),
  familias text[] NOT NULL DEFAULT '{}',
  hasta date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ofertas_descartes_oferta ON public.ofertas_descartes(oferta_id, cod_cliente);
CREATE INDEX idx_ofertas_descartes_cliente ON public.ofertas_descartes(cod_cliente);
GRANT SELECT, DELETE ON public.ofertas_descartes TO authenticated;
GRANT ALL ON public.ofertas_descartes TO service_role;
ALTER TABLE public.ofertas_descartes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver descartes de clientes visibles" ON public.ofertas_descartes FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.can_view_cliente(auth.uid(), cod_cliente));
CREATE POLICY "Direccion deshace descartes" ON public.ofertas_descartes FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND ((SELECT public.has_role(auth.uid(),'admin')) OR (SELECT public.has_role(auth.uid(),'director_comercial'))));

ALTER TABLE public.ofertas_envios ADD COLUMN origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','recomendacion'));

INSERT INTO public.app_settings(key, value, description) VALUES
  ('recomendaciones_meses_abandono', '6', 'Meses sin comprar lo ofertado para considerar que el cliente lo ha dejado'),
  ('recomendaciones_dias_saturacion', '7', 'Días tras otra oferta en los que el cliente se marca como saturado'),
  ('recomendaciones_dias_descarte_familia', '90', 'Días que dura un descarte aplicado a toda la familia')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ofertas_recomendados(_oferta_id uuid, _vendedor text DEFAULT NULL, _limite integer DEFAULT 200)
RETURNS TABLE(cod_cliente integer, cliente text, localidad text, ruta text, vendedor text, persona_contacto text,
  telefono_whatsapp text, telefono text, telefono2 text, grupo text, motivo text, ultima_compra date,
  importe_12m numeric, saturado_dias integer, avisos jsonb, excluidos integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o public.ofertas%ROWTYPE;
  v_marcas text[]; v_meses int; v_sat int; v_excl int := 0; v_lim int;
  v_hay_criterio boolean;
BEGIN
  IF NOT public.puede_enviar_ofertas(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ofertas WHERE id = _oferta_id AND estado = 'publicada';
  IF o.id IS NULL THEN RETURN; END IF;
  v_lim := LEAST(GREATEST(COALESCE(_limite,200),1),500);
  SELECT COALESCE(NULLIF(value,'')::int,6) INTO v_meses FROM public.app_settings WHERE key='recomendaciones_meses_abandono';
  SELECT COALESCE(NULLIF(value,'')::int,7) INTO v_sat FROM public.app_settings WHERE key='recomendaciones_dias_saturacion';
  v_meses := COALESCE(v_meses,6); v_sat := COALESCE(v_sat,7);
  v_marcas := ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT pr.marca FROM public.productos pr WHERE pr.referencia = ANY(o.referencias)) x WHERE m IS NOT NULL AND m <> '');
  v_hay_criterio := cardinality(o.referencias) > 0 OR cardinality(o.familias) > 0 OR cardinality(v_marcas) > 0;

  CREATE TEMP TABLE IF NOT EXISTS _rec(cod integer PRIMARY KEY, grupo text, ultima date, imp numeric, orden numeric) ON COMMIT DROP;
  TRUNCATE _rec;

  IF v_hay_criterio THEN
    INSERT INTO _rec
    SELECT v.cod_cliente,
      CASE WHEN max(v.fecha) >= CURRENT_DATE - make_interval(months => v_meses) THEN 'habitual' ELSE 'recuperar' END,
      max(v.fecha),
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha >= CURRENT_DATE - interval '12 months'),0),
      0
    FROM public.ventas_diarias v
    WHERE v.fecha >= CURRENT_DATE - interval '24 months'
      AND (v.referencia = ANY(o.referencias) OR v.familia = ANY(o.familias) OR v.marca = ANY(v_marcas))
    GROUP BY v.cod_cliente;
  END IF;

  -- Potenciales: clientes con compras en los últimos 12 meses que no compran lo ofertado
  INSERT INTO _rec
  SELECT k.cod_cliente, 'potencial', k.ultima_compra, k.importe_anio_actual, k.dias_sin_comprar
  FROM public.cliente_kpis k
  WHERE k.dias_sin_comprar IS NOT NULL AND k.dias_sin_comprar <= 365
  ON CONFLICT (cod) DO NOTHING;

  -- Filtros de alcance, segmentación, ya enviados y descartes
  DELETE FROM _rec r USING public.clientes c
  WHERE c.cod_cliente = r.cod AND (
    NOT public.can_view_cliente(auth.uid(), c.cod_cliente)
    OR (_vendedor IS NOT NULL AND COALESCE(c.vendedor,'') <> _vendedor)
    OR (cardinality(o.delegaciones) > 0 AND NOT (COALESCE(c.delegacion,'') = ANY(o.delegaciones)))
    OR (cardinality(o.tipos_cliente) > 0 AND NOT (COALESCE(c.cod_tipo_cliente,'') = ANY(o.tipos_cliente))));
  DELETE FROM _rec r WHERE NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.cod_cliente = r.cod);
  DELETE FROM _rec r WHERE EXISTS (SELECT 1 FROM public.ofertas_envios e WHERE e.oferta_id = _oferta_id AND e.cod_cliente = r.cod AND e.estado IN ('abierto','enviado'));
  DELETE FROM _rec r WHERE EXISTS (SELECT 1 FROM public.ofertas_descartes d WHERE d.cod_cliente = r.cod
     AND (d.oferta_id = _oferta_id OR (d.alcance = 'familia' AND d.familias && o.familias AND (d.hasta IS NULL OR d.hasta >= CURRENT_DATE))));

  -- Bloqueos: se evalúan sobre los mejores candidatos
  CREATE TEMP TABLE IF NOT EXISTS _rec2(cod integer PRIMARY KEY, grupo text, ultima date, imp numeric, orden numeric, ev jsonb) ON COMMIT DROP;
  TRUNCATE _rec2;
  INSERT INTO _rec2
  SELECT r.cod, r.grupo, r.ultima, r.imp, r.orden, public.oferta_evaluar_cliente(_oferta_id, r.cod)
  FROM _rec r
  ORDER BY CASE r.grupo WHEN 'habitual' THEN 1 WHEN 'recuperar' THEN 2 ELSE 3 END,
    CASE WHEN r.grupo = 'potencial' THEN r.orden ELSE -r.imp END
  LIMIT v_lim * 2;
  SELECT count(*) INTO v_excl FROM _rec2 WHERE jsonb_array_length(ev->'bloqueos') > 0;
  DELETE FROM _rec2 WHERE jsonb_array_length(ev->'bloqueos') > 0;

  RETURN QUERY
  SELECT c.cod_cliente, c.cliente, c.localidad, c.ruta, c.vendedor, c.persona_contacto,
    p.telefono_whatsapp, c.telefono, c.telefono2, r.grupo,
    CASE r.grupo
      WHEN 'habitual' THEN 'Compra lo ofertado; última compra ' || to_char(r.ultima,'DD/MM/YYYY')
      WHEN 'recuperar' THEN 'Lo compraba y lo ha dejado; última compra ' || to_char(r.ultima,'DD/MM/YYYY')
      ELSE 'Cliente activo que aún no compra lo ofertado' END,
    r.ultima, r.imp, s.dias, r.ev->'avisos', v_excl
  FROM _rec2 r
  JOIN public.clientes c ON c.cod_cliente = r.cod
  LEFT JOIN public.cliente_preferencias_ofertas p ON p.cod_cliente = r.cod
  LEFT JOIN LATERAL (
    SELECT (CURRENT_DATE - max(e.abierto_en)::date)::int AS dias FROM public.ofertas_envios e
    WHERE e.cod_cliente = r.cod AND e.oferta_id <> _oferta_id AND e.estado IN ('abierto','enviado')
      AND e.abierto_en >= now() - make_interval(days => v_sat)) s ON true
  ORDER BY CASE r.grupo WHEN 'habitual' THEN 1 WHEN 'recuperar' THEN 2 ELSE 3 END,
    (s.dias IS NOT NULL),
    CASE WHEN r.grupo = 'potencial' THEN r.orden ELSE -r.imp END
  LIMIT v_lim;
END $$;
REVOKE ALL ON FUNCTION public.ofertas_recomendados(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_recomendados(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.descartar_recomendacion(_oferta_id uuid, _cod_cliente integer, _motivo text, _nota text DEFAULT NULL, _toda_familia boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_dias int; v_fam text[]; v_email text;
BEGIN
  IF NOT public.puede_enviar_ofertas(v_uid) OR NOT public.can_view_cliente(v_uid, _cod_cliente) THEN
    RAISE EXCEPTION 'Sin permiso para este cliente' USING ERRCODE = '42501';
  END IF;
  IF _motivo NOT IN ('no_interesa','ya_lo_tiene','otro') THEN
    RAISE EXCEPTION 'Motivo no válido' USING ERRCODE = '22023';
  END IF;
  SELECT familias INTO v_fam FROM public.ofertas WHERE id = _oferta_id;
  IF v_fam IS NULL THEN RAISE EXCEPTION 'Oferta no encontrada' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(NULLIF(value,'')::int,90) INTO v_dias FROM public.app_settings WHERE key='recomendaciones_dias_descarte_familia';
  INSERT INTO public.ofertas_descartes(oferta_id, cod_cliente, user_id, motivo, nota, alcance, familias, hasta)
  VALUES (_oferta_id, _cod_cliente, v_uid, _motivo, NULLIF(btrim(COALESCE(_nota,'')),''),
    CASE WHEN _toda_familia AND cardinality(v_fam) > 0 THEN 'familia' ELSE 'oferta' END,
    CASE WHEN _toda_familia THEN v_fam ELSE '{}' END,
    CASE WHEN _toda_familia AND cardinality(v_fam) > 0 THEN CURRENT_DATE + COALESCE(v_dias,90) END)
  RETURNING id INTO v_id;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.auditoria_eventos(user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_uid, v_email, 'oferta_descarte', 'ok', 'ofertas_descartes', v_id::text,
    jsonb_build_object('oferta_id', _oferta_id, 'cod_cliente', _cod_cliente, 'motivo', _motivo, 'toda_familia', _toda_familia));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.descartar_recomendacion(uuid, integer, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_recomendacion(uuid, integer, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marcar_envio_recomendado(_envio_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.ofertas_envios SET origen = 'recomendacion'
  WHERE id = _envio_id AND user_id = auth.uid() AND created_at >= now() - interval '1 hour';
$$;
REVOKE ALL ON FUNCTION public.marcar_envio_recomendado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_envio_recomendado(uuid) TO authenticated, service_role;