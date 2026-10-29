CREATE OR REPLACE FUNCTION public.ofertas_recomendados(_oferta_id uuid, _vendedor text DEFAULT NULL, _limite integer DEFAULT 200)
RETURNS TABLE(cod_cliente integer, cliente text, localidad text, ruta text, vendedor text, persona_contacto text,
  telefono_whatsapp text, telefono text, telefono2 text, grupo text, motivo text, ultima_compra date,
  importe_12m numeric, saturado_dias integer, avisos jsonb, excluidos integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o public.ofertas%ROWTYPE;
  v_marcas text[]; v_meses int; v_sat int; v_excl int := 0; v_lim int;
BEGIN
  IF NOT public.puede_enviar_ofertas(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ofertas WHERE id = _oferta_id AND estado = 'publicada';
  IF o.id IS NULL THEN RETURN; END IF;
  v_lim := LEAST(GREATEST(COALESCE(_limite,200),1),500);
  SELECT NULLIF(value,'')::int INTO v_meses FROM public.app_settings WHERE key='recomendaciones_meses_abandono';
  SELECT NULLIF(value,'')::int INTO v_sat FROM public.app_settings WHERE key='recomendaciones_dias_saturacion';
  v_meses := COALESCE(v_meses,6); v_sat := COALESCE(v_sat,7);
  v_marcas := ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT pr.marca FROM public.productos pr WHERE pr.referencia = ANY(o.referencias)) x WHERE m IS NOT NULL AND m <> '');

  DROP TABLE IF EXISTS _vis; DROP TABLE IF EXISTS _rec; DROP TABLE IF EXISTS _rec2;
  CREATE TEMP TABLE _vis ON COMMIT DROP AS
  SELECT c.cod_cliente AS cod FROM public.clientes_permitidos(auth.uid()) cp
  JOIN public.clientes c ON c.cod_cliente = cp.cod_cliente
  WHERE (_vendedor IS NULL OR COALESCE(c.vendedor,'') = _vendedor)
    AND (cardinality(o.delegaciones) = 0 OR COALESCE(c.delegacion,'') = ANY(o.delegaciones))
    AND (cardinality(o.tipos_cliente) = 0 OR COALESCE(c.cod_tipo_cliente,'') = ANY(o.tipos_cliente))
    AND NOT EXISTS (SELECT 1 FROM public.ofertas_envios e WHERE e.oferta_id = _oferta_id AND e.cod_cliente = c.cod_cliente AND e.estado IN ('abierto','enviado'))
    AND NOT EXISTS (SELECT 1 FROM public.ofertas_descartes d WHERE d.cod_cliente = c.cod_cliente
       AND (d.oferta_id = _oferta_id OR (d.alcance = 'familia' AND d.familias && o.familias AND (d.hasta IS NULL OR d.hasta >= CURRENT_DATE))));
  ALTER TABLE _vis ADD PRIMARY KEY (cod);

  CREATE TEMP TABLE _rec(cod integer PRIMARY KEY, grupo text, ultima date, imp numeric, orden numeric) ON COMMIT DROP;
  IF cardinality(o.referencias) > 0 OR cardinality(o.familias) > 0 OR cardinality(v_marcas) > 0 THEN
    INSERT INTO _rec
    SELECT v.cod_cliente,
      CASE WHEN max(v.fecha) >= CURRENT_DATE - make_interval(months => v_meses) THEN 'habitual' ELSE 'recuperar' END,
      max(v.fecha),
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha >= CURRENT_DATE - interval '12 months'),0), 0
    FROM public.ventas_diarias v JOIN _vis ON _vis.cod = v.cod_cliente
    WHERE v.fecha >= CURRENT_DATE - interval '24 months'
      AND (v.referencia = ANY(o.referencias) OR v.familia = ANY(o.familias) OR v.marca = ANY(v_marcas))
    GROUP BY v.cod_cliente;
  END IF;
  INSERT INTO _rec
  SELECT k.cod_cliente, 'potencial', k.ultima_compra, k.importe_anio_actual, k.dias_sin_comprar
  FROM public.cliente_kpis k JOIN _vis ON _vis.cod = k.cod_cliente
  WHERE k.dias_sin_comprar IS NOT NULL AND k.dias_sin_comprar <= 365
  ON CONFLICT (cod) DO NOTHING;

  CREATE TEMP TABLE _rec2 ON COMMIT DROP AS
  SELECT r.cod, r.grupo, r.ultima, r.imp, r.orden, public.oferta_evaluar_cliente(_oferta_id, r.cod) AS ev
  FROM (SELECT * FROM _rec r
        ORDER BY CASE r.grupo WHEN 'habitual' THEN 1 WHEN 'recuperar' THEN 2 ELSE 3 END,
          CASE WHEN r.grupo = 'potencial' THEN r.orden ELSE -r.imp END
        LIMIT v_lim * 2) r;
  SELECT count(*) INTO v_excl FROM _rec2 WHERE jsonb_array_length(_rec2.ev->'bloqueos') > 0;
  DELETE FROM _rec2 WHERE jsonb_array_length(_rec2.ev->'bloqueos') > 0;

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