-- Fase 6: seguimiento de compras tras ofertas (atribución por reglas, sin tablas nuevas)

-- ¿Encaja una línea de venta con una oferta? (marcas efectivas precalculadas)
CREATE OR REPLACE FUNCTION public.oferta_linea_encaja(_refs text[], _marcas text[], _familias text[], _ref text, _marca text, _familia text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT _ref = ANY(_refs) OR _marca = ANY(_marcas) OR _familia = ANY(_familias);
$$;
REVOKE ALL ON FUNCTION public.oferta_linea_encaja(text[], text[], text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oferta_linea_encaja(text[], text[], text[], text, text, text) TO service_role;

-- Base interna: primer envío confirmado por oferta y cliente + compras atribuidas en la ventana.
-- Una compra que encaja con varias ofertas se atribuye a la enviada más recientemente antes de la compra.
CREATE OR REPLACE FUNCTION public.ofertas_seguimiento_base(_uid uuid, _desde date, _hasta date, _dias integer, _cod integer)
RETURNS TABLE(envio_id uuid, oferta_id uuid, titulo text, cod_cliente integer, cliente text, delegacion text,
  user_id uuid, comercial_nombre text, origen text, fecha_envio date, vigente_hasta date, medible boolean,
  importe numeric, margen numeric, lineas bigint, primera_compra date, compra_en_vigencia boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH corte AS (SELECT public.fecha_corte_datos() c),
  ofs AS (
    SELECT o.id, o.titulo, o.vigente_hasta, o.referencias, o.familias,
      ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT p.marca FROM public.productos p WHERE p.referencia = ANY(o.referencias)) x WHERE m IS NOT NULL AND m <> '') marcas
    FROM public.ofertas o),
  conf_all AS (  -- todos los envíos confirmados (para resolver solapes)
    SELECT DISTINCT ON (e.oferta_id, e.cod_cliente) e.id, e.oferta_id, e.cod_cliente, e.user_id, e.comercial_nombre, e.origen, e.abierto_en
    FROM public.ofertas_envios e WHERE e.estado = 'enviado' AND (_cod IS NULL OR e.cod_cliente = _cod)
    ORDER BY e.oferta_id, e.cod_cliente, e.abierto_en),
  envs AS (
    SELECT ca.* FROM conf_all ca
    WHERE (_desde IS NULL OR ca.abierto_en::date >= _desde) AND (_hasta IS NULL OR ca.abierto_en::date <= _hasta)
      AND public.comunicaciones_ve(_uid, ca.cod_cliente)),
  lin AS (
    SELECT e.id envio_id, v.fecha, v.importe, v.margen
    FROM envs e JOIN ofs o ON o.id = e.oferta_id
    JOIN public.ventas_diarias v ON v.cod_cliente = e.cod_cliente
      AND v.fecha BETWEEN e.abierto_en::date AND e.abierto_en::date + _dias
    WHERE public.oferta_linea_encaja(o.referencias, o.marcas, o.familias, v.referencia, v.marca, v.familia)
      AND NOT EXISTS (
        SELECT 1 FROM conf_all c2 JOIN ofs o2 ON o2.id = c2.oferta_id
        WHERE c2.cod_cliente = e.cod_cliente AND c2.oferta_id <> e.oferta_id
          AND c2.abierto_en > e.abierto_en AND c2.abierto_en::date <= v.fecha
          AND public.oferta_linea_encaja(o2.referencias, o2.marcas, o2.familias, v.referencia, v.marca, v.familia)))
  SELECT e.id, e.oferta_id, o.titulo, e.cod_cliente, c.cliente, c.delegacion, e.user_id, e.comercial_nombre, e.origen,
    e.abierto_en::date, o.vigente_hasta, e.abierto_en::date + _dias <= (SELECT c FROM corte),
    COALESCE(sum(l.importe), 0), COALESCE(sum(l.margen), 0), count(l.fecha),
    min(l.fecha) FILTER (WHERE l.importe > 0),
    bool_or(l.importe > 0 AND (o.vigente_hasta IS NULL OR l.fecha <= o.vigente_hasta))
  FROM envs e JOIN ofs o ON o.id = e.oferta_id JOIN public.clientes c ON c.cod_cliente = e.cod_cliente
  LEFT JOIN lin l ON l.envio_id = e.id
  GROUP BY e.id, e.oferta_id, o.titulo, e.cod_cliente, c.cliente, c.delegacion, e.user_id, e.comercial_nombre, e.origen, e.abierto_en, o.vigente_hasta;
$$;
REVOKE ALL ON FUNCTION public.ofertas_seguimiento_base(uuid, date, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ofertas_seguimiento_base(uuid, date, date, integer, integer) TO service_role;

-- Resultados agrupados (oferta | comercial | delegacion | origen)
CREATE OR REPLACE FUNCTION public.ofertas_resultados(_desde date DEFAULT NULL, _hasta date DEFAULT NULL, _dias integer DEFAULT 30, _agrupar text DEFAULT 'oferta')
RETURNS TABLE(clave text, etiqueta text, confirmados bigint, medibles bigint, compradores bigint, compradores_vigencia bigint,
  importe numeric, margen numeric, dias_medios numeric, fecha_corte date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_dias integer := LEAST(GREATEST(COALESCE(_dias,30),1),180); v_margen boolean;
BEGIN
  IF NOT public.ofertas_activo() THEN RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.is_approved(v_uid) OR NOT (public.puede_gestionar_ofertas(v_uid) OR public.puede_enviar_ofertas(v_uid)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  IF _agrupar NOT IN ('oferta','comercial','delegacion','origen') THEN RAISE EXCEPTION 'Agrupación no válida' USING ERRCODE = '22023'; END IF;
  v_margen := public.puede_ver_margen(v_uid);
  RETURN QUERY
  WITH b AS (SELECT * FROM public.ofertas_seguimiento_base(v_uid, _desde, _hasta, v_dias, NULL)),
  g AS (
    SELECT CASE _agrupar WHEN 'oferta' THEN b.oferta_id::text WHEN 'comercial' THEN COALESCE(b.user_id::text,'-')
             WHEN 'delegacion' THEN COALESCE(b.delegacion,'-') ELSE b.origen END k,
           CASE _agrupar WHEN 'oferta' THEN b.titulo WHEN 'comercial' THEN COALESCE(b.comercial_nombre,'—')
             WHEN 'delegacion' THEN COALESCE(b.delegacion,'Sin delegación') ELSE b.origen END et,
           b.* FROM b)
  SELECT g.k, max(g.et), count(*), count(*) FILTER (WHERE g.medible),
    count(*) FILTER (WHERE g.medible AND g.importe > 0),
    count(*) FILTER (WHERE g.medible AND g.importe > 0 AND g.compra_en_vigencia),
    COALESCE(sum(g.importe) FILTER (WHERE g.medible), 0),
    CASE WHEN v_margen THEN COALESCE(sum(g.margen) FILTER (WHERE g.medible), 0) END,
    round(avg((g.primera_compra - g.fecha_envio)::numeric) FILTER (WHERE g.medible AND g.importe > 0 AND g.primera_compra IS NOT NULL), 1),
    public.fecha_corte_datos()
  FROM g GROUP BY g.k ORDER BY 7 DESC;
END $$;
REVOKE ALL ON FUNCTION public.ofertas_resultados(date, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_resultados(date, date, integer, text) TO authenticated, service_role;

-- Líneas compradas tras un envío concreto (marca las atribuidas a otra oferta más reciente)
CREATE OR REPLACE FUNCTION public.oferta_envio_compras(_envio_id uuid, _dias integer DEFAULT 30)
RETURNS TABLE(fecha date, id_documento text, referencia text, descripcion text, marca text, familia text,
  unidades numeric, importe numeric, margen numeric, atribuida_a_otra text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_e public.ofertas_envios%ROWTYPE; v_dias integer := LEAST(GREATEST(COALESCE(_dias,30),1),180); v_margen boolean;
BEGIN
  IF NOT public.ofertas_activo() THEN RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_e FROM public.ofertas_envios WHERE id = _envio_id;
  IF v_e.id IS NULL OR NOT public.comunicaciones_ve(v_uid, v_e.cod_cliente) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  v_margen := public.puede_ver_margen(v_uid);
  RETURN QUERY
  WITH ofs AS (
    SELECT o.id, o.titulo, o.referencias, o.familias,
      ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT p.marca FROM public.productos p WHERE p.referencia = ANY(o.referencias)) x WHERE m IS NOT NULL AND m <> '') marcas
    FROM public.ofertas o)
  SELECT v.fecha, v.id_documento, v.referencia, COALESCE(v.descripcion_linea, p.descripcion), v.marca, v.familia,
    v.unidades, v.importe, CASE WHEN v_margen THEN v.margen END,
    (SELECT o2.titulo FROM public.ofertas_envios c2 JOIN ofs o2 ON o2.id = c2.oferta_id
      WHERE c2.estado = 'enviado' AND c2.cod_cliente = v_e.cod_cliente AND c2.oferta_id <> v_e.oferta_id
        AND c2.abierto_en > v_e.abierto_en AND c2.abierto_en::date <= v.fecha
        AND public.oferta_linea_encaja(o2.referencias, o2.marcas, o2.familias, v.referencia, v.marca, v.familia)
      ORDER BY c2.abierto_en DESC LIMIT 1)
  FROM ofs o
  JOIN public.ventas_diarias v ON v.cod_cliente = v_e.cod_cliente
    AND v.fecha BETWEEN v_e.abierto_en::date AND v_e.abierto_en::date + v_dias
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE o.id = v_e.oferta_id
    AND public.oferta_linea_encaja(o.referencias, o.marcas, o.familias, v.referencia, v.marca, v.familia)
  ORDER BY v.fecha, v.id_documento, v.linea
  LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION public.oferta_envio_compras(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oferta_envio_compras(uuid, integer) TO authenticated, service_role;

-- Ofertas recibidas por un cliente y si generaron compra (ventana 30 días)
CREATE OR REPLACE FUNCTION public.cliente_ofertas_historial(_cod integer)
RETURNS TABLE(envio_id uuid, oferta_id uuid, titulo text, fecha_envio date, comercial_nombre text, origen text,
  medible boolean, importe numeric, primera_compra date, compra_en_vigencia boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.ofertas_activo() THEN RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.comunicaciones_ve(v_uid, _cod) THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT b.envio_id, b.oferta_id, b.titulo, b.fecha_envio, b.comercial_nombre, b.origen, b.medible, b.importe, b.primera_compra, COALESCE(b.compra_en_vigencia, false)
  FROM public.ofertas_seguimiento_base(v_uid, NULL, NULL, 30, _cod) b
  ORDER BY b.fecha_envio DESC;
END $$;
REVOKE ALL ON FUNCTION public.cliente_ofertas_historial(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_ofertas_historial(integer) TO authenticated, service_role;
