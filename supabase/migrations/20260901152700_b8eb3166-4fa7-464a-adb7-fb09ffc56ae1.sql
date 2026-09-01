DROP FUNCTION IF EXISTS public.cliente_top_productos(integer, integer);

CREATE FUNCTION public.cliente_top_productos(
  _cod integer,
  _desde date,
  _hasta date,
  _desde_prev date DEFAULT NULL,
  _hasta_prev date DEFAULT NULL
)
RETURNS TABLE(
  referencia text,
  descripcion text,
  familia text,
  marca text,
  unidades numeric,
  importe numeric,
  margen numeric,
  ultima_compra date,
  unidades_anterior numeric,
  importe_anterior numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_margen boolean;
BEGIN
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  v_margen := public.puede_ver_margen(auth.uid());
  RETURN QUERY
  SELECT v.referencia,
         p.descripcion,
         COALESCE(p.familia_nombre, p.familia, v.familia),
         COALESCE(p.marca_nombre, p.marca, v.marca),
         COALESCE(SUM(v.unidades) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0),
         COALESCE(SUM(v.importe) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0),
         CASE WHEN v_margen THEN COALESCE(SUM(v.margen) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0) ELSE 0 END,
         MAX(v.fecha) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta),
         COALESCE(SUM(v.unidades) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0),
         COALESCE(SUM(v.importe) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0)
  FROM public.ventas_diarias v
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE v.cod_cliente = _cod
    AND v.fecha >= LEAST(_desde, COALESCE(_desde_prev, _desde))
    AND v.fecha <= GREATEST(_hasta, COALESCE(_hasta_prev, _hasta))
  GROUP BY v.referencia, p.descripcion,
           COALESCE(p.familia_nombre, p.familia, v.familia),
           COALESCE(p.marca_nombre, p.marca, v.marca)
  ORDER BY GREATEST(
             COALESCE(SUM(v.importe) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0),
             COALESCE(SUM(v.importe) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0)
           ) DESC
  LIMIT 500;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cliente_top_productos(_cod integer, _anio integer DEFAULT NULL)
RETURNS TABLE(
  referencia text,
  descripcion text,
  familia text,
  marca text,
  unidades numeric,
  importe numeric,
  margen numeric,
  ultima_compra date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT t.referencia, t.descripcion, t.familia, t.marca, t.unidades,
         t.importe, t.margen, t.ultima_compra
  FROM public.cliente_top_productos(
    _cod,
    CASE WHEN _anio IS NULL THEN DATE '2000-01-01' ELSE make_date(_anio, 1, 1) END,
    CASE WHEN _anio IS NULL THEN CURRENT_DATE ELSE make_date(_anio, 12, 31) END,
    NULL, NULL
  ) t
$fn$;

GRANT EXECUTE ON FUNCTION public.cliente_top_productos(integer, date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_top_productos(integer, integer) TO authenticated;