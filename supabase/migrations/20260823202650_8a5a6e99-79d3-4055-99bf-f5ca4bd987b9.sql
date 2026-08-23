CREATE MATERIALIZED VIEW IF NOT EXISTS public.documentos_resumen AS
SELECT
  v.id_documento,
  v.cod_cliente,
  c.cliente,
  v.ejercicio AS anio,
  MIN(v.fecha) AS fecha,
  MIN(v.hora) AS hora,
  (array_agg(v.tipo_documento))[1] AS tipo_documento,
  (array_agg(v.operacion))[1] AS operacion,
  (array_agg(v.canal))[1] AS canal,
  (array_agg(v.almacen))[1] AS almacen,
  (array_agg(v.vendedor_linea))[1] AS vendedor_linea,
  (array_agg(v.registrado_por))[1] AS registrado_por,
  SUM(v.importe) AS importe,
  SUM(v.margen) AS margen,
  COUNT(*)::int AS lineas
FROM public.ventas_diarias v
JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
WHERE v.id_documento IS NOT NULL
GROUP BY v.id_documento, v.cod_cliente, c.cliente, v.ejercicio;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_resumen_pk
  ON public.documentos_resumen (anio, cod_cliente, id_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_resumen_anio_importe
  ON public.documentos_resumen (anio, ABS(importe) DESC);

GRANT SELECT ON public.documentos_resumen TO authenticated;
GRANT ALL ON public.documentos_resumen TO service_role;

CREATE OR REPLACE FUNCTION public.refrescar_documentos_resumen()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW public.documentos_resumen;
END;
$function$;

REVOKE ALL ON FUNCTION public.refrescar_documentos_resumen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refrescar_documentos_resumen() FROM anon;
GRANT EXECUTE ON FUNCTION public.refrescar_documentos_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refrescar_documentos_resumen() TO service_role;

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
      d.id_documento,
      d.fecha,
      d.hora,
      d.tipo_documento,
      d.operacion,
      d.canal,
      d.almacen,
      d.vendedor_linea,
      d.registrado_por,
      d.importe,
      CASE WHEN (SELECT v_margen FROM params) THEN d.margen ELSE 0 END AS margen,
      d.lineas,
      d.cod_cliente,
      d.cliente,
      COUNT(*) OVER () AS total_filas
    FROM public.documentos_resumen d
    WHERE d.anio = _anio
      AND d.cod_cliente IN (SELECT cp.cod_cliente FROM public.clientes_permitidos(auth.uid()) AS cp)
      AND ABS(d.importe) >= _importe_min
  )
  SELECT *
  FROM docs
  ORDER BY fecha DESC, hora DESC
  LIMIT GREATEST(1, LEAST(_limite, 200)) OFFSET GREATEST(0, _offset);
$function$;

REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) TO authenticated;