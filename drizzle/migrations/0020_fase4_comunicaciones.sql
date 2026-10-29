CREATE OR REPLACE FUNCTION public.comunicaciones_ve(_uid uuid, _cod integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_approved(_uid) AND (
    public.puede_gestionar_ofertas(_uid)
    OR (public.puede_enviar_ofertas(_uid) AND public.can_view_cliente(_uid, _cod)));
$$;
REVOKE ALL ON FUNCTION public.comunicaciones_ve(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comunicaciones_ve(uuid, integer) TO service_role;

-- Importe de lo ofertado para un cliente entre dos fechas
CREATE OR REPLACE FUNCTION public.oferta_ventas_cliente(_oferta_id uuid, _cod integer, _desde date, _hasta date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH o AS (
    SELECT o.referencias, o.familias,
      ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT p.marca FROM public.productos p WHERE p.referencia = ANY(o.referencias)) x WHERE m <> '') marcas
    FROM public.ofertas o WHERE o.id = _oferta_id)
  SELECT COALESCE(sum(v.importe), 0) FROM public.ventas_diarias v, o
  WHERE v.cod_cliente = _cod AND v.fecha BETWEEN _desde AND _hasta
    AND (v.referencia = ANY(o.referencias) OR v.marca = ANY(o.marcas) OR v.familia = ANY(o.familias));
$$;
REVOKE ALL ON FUNCTION public.oferta_ventas_cliente(uuid, integer, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oferta_ventas_cliente(uuid, integer, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.comunicaciones_listado(
  _desde date DEFAULT NULL, _hasta date DEFAULT NULL, _oferta_id uuid DEFAULT NULL, _user_id uuid DEFAULT NULL,
  _delegacion text DEFAULT NULL, _estado text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, abierto_en timestamptz, estado text, cod_cliente integer, cliente text, delegacion text,
  oferta_id uuid, oferta_titulo text, comercial_nombre text, telefono text, mensaje text,
  ventas_antes numeric, ventas_despues numeric, pendiente_datos boolean, fecha_corte date, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_corte date := public.fecha_corte_datos();
BEGIN
  IF NOT public.is_approved(v_uid) OR NOT (public.puede_gestionar_ofertas(v_uid) OR public.puede_enviar_ofertas(v_uid)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT e.*, c.cliente AS c_cliente, c.delegacion AS c_deleg, o.titulo, count(*) OVER () AS n
    FROM public.ofertas_envios e
    JOIN public.clientes c ON c.cod_cliente = e.cod_cliente
    JOIN public.ofertas o ON o.id = e.oferta_id
    WHERE public.comunicaciones_ve(v_uid, e.cod_cliente)
      AND (_desde IS NULL OR e.abierto_en::date >= _desde)
      AND (_hasta IS NULL OR e.abierto_en::date <= _hasta)
      AND (_oferta_id IS NULL OR e.oferta_id = _oferta_id)
      AND (_user_id IS NULL OR e.user_id = _user_id)
      AND (_delegacion IS NULL OR c.delegacion = _delegacion)
      AND (_estado IS NULL OR e.estado = _estado)
    ORDER BY e.abierto_en DESC
    LIMIT LEAST(GREATEST(COALESCE(_limit,50),1),5000) OFFSET GREATEST(COALESCE(_offset,0),0))
  SELECT b.id, b.abierto_en, b.estado, b.cod_cliente, b.c_cliente, b.c_deleg, b.oferta_id, b.titulo,
    b.comercial_nombre, b.telefono, b.mensaje,
    public.oferta_ventas_cliente(b.oferta_id, b.cod_cliente, b.abierto_en::date - 30, b.abierto_en::date - 1),
    CASE WHEN b.abierto_en::date + 30 <= v_corte
      THEN public.oferta_ventas_cliente(b.oferta_id, b.cod_cliente, b.abierto_en::date + 1, b.abierto_en::date + 30) END,
    b.abierto_en::date + 30 > v_corte, v_corte, b.n
  FROM base b ORDER BY b.abierto_en DESC;
END $$;
REVOKE ALL ON FUNCTION public.comunicaciones_listado(date, date, uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicaciones_listado(date, date, uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.comunicaciones_resumen_oferta(_desde date DEFAULT NULL, _hasta date DEFAULT NULL)
RETURNS TABLE(oferta_id uuid, titulo text, enviados bigint, no_enviados bigint, pendientes bigint, clientes bigint,
  medibles bigint, compradores_despues bigint, ventas_antes numeric, ventas_despues numeric,
  control_clientes bigint, control_antes numeric, control_despues numeric, bajas_tras_envio bigint, fecha_corte date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_corte date := public.fecha_corte_datos();
BEGIN
  IF NOT public.is_approved(v_uid) OR NOT (public.puede_gestionar_ofertas(v_uid) OR public.puede_enviar_ofertas(v_uid)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH e AS (
    SELECT x.* FROM public.ofertas_envios x
    WHERE public.comunicaciones_ve(v_uid, x.cod_cliente)
      AND (_desde IS NULL OR x.abierto_en::date >= _desde) AND (_hasta IS NULL OR x.abierto_en::date <= _hasta)),
  conf AS (  -- primer envío confirmado por oferta y cliente
    SELECT DISTINCT ON (oferta_id, cod_cliente) oferta_id, cod_cliente, abierto_en::date d
    FROM e WHERE estado = 'enviado' ORDER BY oferta_id, cod_cliente, abierto_en),
  med AS (
    SELECT c.oferta_id, c.cod_cliente,
      public.oferta_ventas_cliente(c.oferta_id, c.cod_cliente, c.d - 30, c.d - 1) antes,
      public.oferta_ventas_cliente(c.oferta_id, c.cod_cliente, c.d + 1, c.d + 30) despues
    FROM conf c WHERE c.d + 30 <= v_corte),
  ref AS (  -- fecha de referencia del grupo de control: mediana de envíos medibles
    SELECT c.oferta_id, (min(c.d) + ((max(c.d) - min(c.d)) / 2))::date d
    FROM conf c WHERE c.d + 30 <= v_corte GROUP BY c.oferta_id),
  ctrl AS (
    SELECT r.oferta_id, count(DISTINCT v.cod_cliente) n,
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha BETWEEN r.d - 30 AND r.d - 1), 0) antes,
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha BETWEEN r.d + 1 AND r.d + 30), 0) despues
    FROM ref r
    JOIN public.ofertas o ON o.id = r.oferta_id
    CROSS JOIN LATERAL (SELECT ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT p.marca FROM public.productos p WHERE p.referencia = ANY(o.referencias)) z WHERE m <> '') marcas) mk
    JOIN public.ventas_diarias v ON v.fecha BETWEEN r.d - 30 AND r.d + 30
      AND (v.referencia = ANY(o.referencias) OR v.marca = ANY(mk.marcas) OR v.familia = ANY(o.familias))
    WHERE NOT EXISTS (SELECT 1 FROM public.ofertas_envios s WHERE s.oferta_id = r.oferta_id AND s.cod_cliente = v.cod_cliente)
      AND public.comunicaciones_ve(v_uid, v.cod_cliente)
    GROUP BY r.oferta_id),
  bajas AS (
    SELECT c.oferta_id, count(*) n FROM conf c
    JOIN public.cliente_preferencias_ofertas p ON p.cod_cliente = c.cod_cliente
    WHERE p.no_quiere_ofertas AND p.updated_at::date >= c.d GROUP BY c.oferta_id)
  SELECT o.id, o.titulo,
    count(*) FILTER (WHERE e.estado = 'enviado'),
    count(*) FILTER (WHERE e.estado = 'no_enviado'),
    count(*) FILTER (WHERE e.estado IN ('abierto','sin_confirmar')),
    count(DISTINCT e.cod_cliente) FILTER (WHERE e.estado = 'enviado'),
    (SELECT count(*) FROM med m WHERE m.oferta_id = o.id),
    (SELECT count(*) FROM med m WHERE m.oferta_id = o.id AND m.despues > 0),
    (SELECT COALESCE(sum(m.antes),0) FROM med m WHERE m.oferta_id = o.id),
    (SELECT COALESCE(sum(m.despues),0) FROM med m WHERE m.oferta_id = o.id),
    COALESCE((SELECT k.n FROM ctrl k WHERE k.oferta_id = o.id), 0),
    (SELECT k.antes FROM ctrl k WHERE k.oferta_id = o.id),
    (SELECT k.despues FROM ctrl k WHERE k.oferta_id = o.id),
    COALESCE((SELECT b.n FROM bajas b WHERE b.oferta_id = o.id), 0),
    v_corte
  FROM e JOIN public.ofertas o ON o.id = e.oferta_id
  GROUP BY o.id, o.titulo
  ORDER BY max(e.abierto_en) DESC;
END $$;
REVOKE ALL ON FUNCTION public.comunicaciones_resumen_oferta(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicaciones_resumen_oferta(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.comunicaciones_resumen_comercial(_desde date DEFAULT NULL, _hasta date DEFAULT NULL)
RETURNS TABLE(user_id uuid, comercial_nombre text, envios bigint, enviados bigint, no_enviados bigint, pendientes bigint, clientes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_approved(v_uid) OR NOT (public.puede_gestionar_ofertas(v_uid) OR public.puede_enviar_ofertas(v_uid)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.user_id, max(e.comercial_nombre), count(*),
    count(*) FILTER (WHERE e.estado = 'enviado'),
    count(*) FILTER (WHERE e.estado = 'no_enviado'),
    count(*) FILTER (WHERE e.estado IN ('abierto','sin_confirmar')),
    count(DISTINCT e.cod_cliente) FILTER (WHERE e.estado = 'enviado')
  FROM public.ofertas_envios e
  WHERE public.comunicaciones_ve(v_uid, e.cod_cliente)
    AND (_desde IS NULL OR e.abierto_en::date >= _desde) AND (_hasta IS NULL OR e.abierto_en::date <= _hasta)
  GROUP BY e.user_id ORDER BY 3 DESC;
END $$;
REVOKE ALL ON FUNCTION public.comunicaciones_resumen_comercial(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicaciones_resumen_comercial(date, date) TO authenticated, service_role;

INSERT INTO public.dashboards(key, name, description, icon, route, sort_order, is_active)
VALUES ('comunicaciones', 'Comunicaciones', 'Seguimiento de ofertas enviadas', 'MessagesSquare', '/comunicaciones', 51, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.user_dashboard_access(user_id, dashboard_key)
SELECT DISTINCT a.user_id, 'comunicaciones' FROM public.user_dashboard_access a
WHERE a.dashboard_key = 'ofertas'
  AND NOT EXISTS (SELECT 1 FROM public.user_dashboard_access b WHERE b.user_id = a.user_id AND b.dashboard_key = 'comunicaciones');
