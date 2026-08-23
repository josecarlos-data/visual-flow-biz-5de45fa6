CREATE OR REPLACE FUNCTION public.documentos_listado(
  _anio integer,
  _importe_min numeric DEFAULT 300,
  _limite integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id_documento text,
  fecha date,
  hora time without time zone,
  tipo_documento text,
  operacion text,
  canal text,
  almacen text,
  vendedor_linea text,
  registrado_por text,
  importe numeric,
  margen numeric,
  lineas integer,
  cod_cliente integer,
  cliente text,
  total_filas bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT public.puede_ver_margen(auth.uid()) AS v_margen
  ),
  docs AS (
    SELECT
      v.id_documento,
      MIN(v.fecha) AS fecha,
      MIN(v.hora) AS hora,
      (array_agg(v.tipo_documento))[1] AS tipo_documento,
      (array_agg(v.operacion))[1] AS operacion,
      (array_agg(v.canal))[1] AS canal,
      (array_agg(v.almacen))[1] AS almacen,
      (array_agg(v.vendedor_linea))[1] AS vendedor_linea,
      (array_agg(v.registrado_por))[1] AS registrado_por,
      SUM(v.importe) AS importe,
      CASE WHEN (SELECT v_margen FROM params) THEN SUM(v.margen) ELSE 0 END AS margen,
      COUNT(*)::int AS lineas,
      v.cod_cliente,
      c.cliente,
      COUNT(*) OVER () AS total_filas
    FROM public.ventas_diarias v
    JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    WHERE v.id_documento IS NOT NULL
      AND v.cod_cliente IN (SELECT cp.cod_cliente FROM public.clientes_permitidos(auth.uid()) AS cp)
      AND v.fecha >= make_date(_anio, 1, 1)
      AND v.fecha < make_date(_anio + 1, 1, 1)
    GROUP BY v.id_documento, v.cod_cliente, c.cliente
    HAVING ABS(SUM(v.importe)) >= _importe_min
  )
  SELECT *
  FROM docs
  ORDER BY fecha DESC, hora DESC
  LIMIT GREATEST(1, LEAST(_limite, 200)) OFFSET GREATEST(0, _offset);
$function$;

REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) TO authenticated;