INSERT INTO public.dashboards (key, name, description, icon, route, sort_order)
VALUES ('actividad_interna','Actividad interna','Comparativa de actividad por usuario de registro','BarChart3','/actividad-interna', 90)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.actividad_interna_usuarios(_anio integer, _almacen text DEFAULT NULL)
RETURNS TABLE(
  registrado_por text,
  almacen_principal text,
  n_almacenes integer,
  importe_vendido numeric,
  docs_venta integer,
  n_abonos integer,
  importe_abonado numeric,
  clientes_distintos integer,
  ticket_medio numeric,
  pct_abonos numeric,
  pct_importe_abonado numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.registrado_por, d.almacen, d.operacion, d.importe, d.cod_cliente, d.id_documento
    FROM public.documentos_resumen d
    WHERE d.anio = _anio
      AND d.registrado_por IS NOT NULL
      AND btrim(d.registrado_por) <> ''
      AND (_almacen IS NULL OR d.almacen = _almacen)
  ),
  princ AS (
    SELECT b.registrado_por, b.almacen, COUNT(DISTINCT b.id_documento) AS docs,
           ROW_NUMBER() OVER (PARTITION BY b.registrado_por ORDER BY COUNT(DISTINCT b.id_documento) DESC, b.almacen) AS rn
    FROM base b
    WHERE b.almacen IS NOT NULL
    GROUP BY b.registrado_por, b.almacen
  ),
  agg AS (
    SELECT
      b.registrado_por,
      COUNT(DISTINCT b.almacen)::int AS n_almacenes,
      COALESCE(SUM(CASE WHEN COALESCE(b.operacion,'Venta') <> 'Abono' THEN b.importe ELSE 0 END), 0)::numeric AS importe_vendido,
      COUNT(DISTINCT CASE WHEN COALESCE(b.operacion,'Venta') <> 'Abono' THEN b.id_documento END)::int AS docs_venta,
      COUNT(DISTINCT CASE WHEN b.operacion = 'Abono' THEN b.id_documento END)::int AS n_abonos,
      ABS(COALESCE(SUM(CASE WHEN b.operacion = 'Abono' THEN b.importe ELSE 0 END), 0))::numeric AS importe_abonado,
      COUNT(DISTINCT b.cod_cliente)::int AS clientes_distintos
    FROM base b
    GROUP BY b.registrado_por
  )
  SELECT
    a.registrado_por,
    p.almacen,
    a.n_almacenes,
    a.importe_vendido,
    a.docs_venta,
    a.n_abonos,
    a.importe_abonado,
    a.clientes_distintos,
    ROUND(a.importe_vendido / NULLIF(a.docs_venta, 0), 2) AS ticket_medio,
    ROUND(a.n_abonos::numeric / NULLIF(a.docs_venta, 0) * 100, 2) AS pct_abonos,
    ROUND(a.importe_abonado / NULLIF(a.importe_vendido, 0) * 100, 2) AS pct_importe_abonado
  FROM agg a
  LEFT JOIN princ p ON p.registrado_por = a.registrado_por AND p.rn = 1
  ORDER BY a.importe_vendido DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.actividad_interna_almacenes(_anio integer)
RETURNS TABLE(
  almacen text,
  importe_vendido numeric,
  docs_venta integer,
  n_abonos integer,
  importe_abonado numeric,
  clientes_distintos integer,
  ticket_medio numeric,
  pct_abonos numeric,
  pct_importe_abonado numeric,
  n_usuarios integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      d.almacen,
      COALESCE(SUM(CASE WHEN COALESCE(d.operacion,'Venta') <> 'Abono' THEN d.importe ELSE 0 END), 0)::numeric AS importe_vendido,
      COUNT(DISTINCT CASE WHEN COALESCE(d.operacion,'Venta') <> 'Abono' THEN d.id_documento END)::int AS docs_venta,
      COUNT(DISTINCT CASE WHEN d.operacion = 'Abono' THEN d.id_documento END)::int AS n_abonos,
      ABS(COALESCE(SUM(CASE WHEN d.operacion = 'Abono' THEN d.importe ELSE 0 END), 0))::numeric AS importe_abonado,
      COUNT(DISTINCT d.cod_cliente)::int AS clientes_distintos,
      COUNT(DISTINCT NULLIF(btrim(COALESCE(d.registrado_por,'')), ''))::int AS n_usuarios
    FROM public.documentos_resumen d
    WHERE d.anio = _anio AND d.almacen IS NOT NULL
    GROUP BY d.almacen
  )
  SELECT
    a.almacen,
    a.importe_vendido,
    a.docs_venta,
    a.n_abonos,
    a.importe_abonado,
    a.clientes_distintos,
    ROUND(a.importe_vendido / NULLIF(a.docs_venta, 0), 2) AS ticket_medio,
    ROUND(a.n_abonos::numeric / NULLIF(a.docs_venta, 0) * 100, 2) AS pct_abonos,
    ROUND(a.importe_abonado / NULLIF(a.importe_vendido, 0) * 100, 2) AS pct_importe_abonado,
    a.n_usuarios
  FROM agg a
  ORDER BY a.importe_vendido DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.actividad_interna_filtros()
RETURNS TABLE(anios integer[], almacenes text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT ARRAY_AGG(DISTINCT d.anio ORDER BY d.anio DESC) FROM public.documentos_resumen d WHERE d.anio IS NOT NULL),
    (SELECT ARRAY_AGG(DISTINCT d.almacen ORDER BY d.almacen) FROM public.documentos_resumen d WHERE d.almacen IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.actividad_interna_usuarios(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_interna_almacenes(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actividad_interna_filtros() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actividad_interna_usuarios(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_interna_almacenes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actividad_interna_filtros() TO authenticated;