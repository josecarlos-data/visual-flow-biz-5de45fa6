DROP FUNCTION IF EXISTS public.documentos_listado(integer, numeric, integer, integer);

CREATE FUNCTION public.documentos_listado(
  _anio integer,
  _importe_min numeric DEFAULT 300,
  _limite integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _buscar text DEFAULT NULL,
  _importe_max numeric DEFAULT NULL,
  _fecha_desde date DEFAULT NULL,
  _fecha_hasta date DEFAULT NULL,
  _canal text DEFAULT NULL,
  _almacen text DEFAULT NULL,
  _registrado_por text DEFAULT NULL,
  _operacion text DEFAULT NULL,
  _motivo_abono text DEFAULT NULL,
  _delegacion text DEFAULT NULL,
  _vendedor text DEFAULT NULL,
  _orden text DEFAULT 'fecha',
  _dir text DEFAULT 'desc'
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
  motivo_abono text,
  id_doc_enlazado text,
  importe numeric,
  margen numeric,
  lineas integer,
  cod_cliente integer,
  cliente text,
  total_filas bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT
      public.puede_ver_margen(auth.uid()) AS v_margen,
      CASE WHEN lower(coalesce(_orden,'')) IN ('fecha','importe','lineas','cliente','operacion','almacen','registrado_por')
           THEN lower(_orden) ELSE 'fecha' END AS v_orden,
      CASE WHEN lower(coalesce(_dir,'')) = 'asc' THEN 'asc' ELSE 'desc' END AS v_dir
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
      d.motivo_abono,
      d.id_doc_enlazado,
      d.importe,
      CASE WHEN (SELECT v_margen FROM params) THEN d.margen ELSE 0 END AS margen,
      d.lineas,
      d.cod_cliente,
      d.cliente,
      COUNT(*) OVER () AS total_filas
    FROM public.documentos_resumen d
    WHERE d.anio = _anio
      AND d.cod_cliente IN (SELECT cp.cod_cliente FROM public.clientes_permitidos(auth.uid()) AS cp)
      AND ABS(d.importe) >= coalesce(_importe_min, 0)
      AND (_importe_max IS NULL OR ABS(d.importe) <= _importe_max)
      AND (_fecha_desde IS NULL OR d.fecha >= _fecha_desde)
      AND (_fecha_hasta IS NULL OR d.fecha <= _fecha_hasta)
      AND (_buscar IS NULL OR _buscar = '' OR d.cliente ILIKE '%' || _buscar || '%' OR d.cod_cliente::text ILIKE '%' || _buscar || '%')
      AND (_canal IS NULL OR d.canal = _canal)
      AND (_almacen IS NULL OR d.almacen = _almacen)
      AND (_registrado_por IS NULL OR d.registrado_por = _registrado_por)
      AND (_operacion IS NULL OR d.operacion = _operacion)
      AND (_motivo_abono IS NULL OR d.motivo_abono = _motivo_abono)
      AND (_delegacion IS NULL OR d.delegacion = _delegacion)
      AND (_vendedor IS NULL OR d.vendedor = _vendedor)
  )
  SELECT
    docs.id_documento,
    docs.fecha,
    docs.hora,
    docs.tipo_documento,
    docs.operacion,
    docs.canal,
    docs.almacen,
    docs.vendedor_linea,
    docs.registrado_por,
    docs.motivo_abono,
    docs.id_doc_enlazado,
    docs.importe,
    docs.margen,
    docs.lineas,
    docs.cod_cliente,
    docs.cliente,
    docs.total_filas
  FROM docs, params p
  ORDER BY
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'fecha'          THEN docs.fecha END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'fecha'          THEN docs.fecha END DESC,
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'importe'        THEN ABS(docs.importe) END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'importe'        THEN ABS(docs.importe) END DESC,
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'lineas'         THEN docs.lineas END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'lineas'         THEN docs.lineas END DESC,
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'cliente'        THEN docs.cliente END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'cliente'        THEN docs.cliente END DESC,
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'operacion'      THEN docs.operacion END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'operacion'      THEN docs.operacion END DESC,
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'almacen'        THEN docs.almacen END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'almacen'        THEN docs.almacen END DESC,
    CASE WHEN p.v_dir = 'asc'  AND p.v_orden = 'registrado_por' THEN docs.registrado_por END ASC,
    CASE WHEN p.v_dir = 'desc' AND p.v_orden = 'registrado_por' THEN docs.registrado_por END DESC,
    docs.fecha DESC, docs.hora DESC
  LIMIT GREATEST(1, LEAST(_limite, 200)) OFFSET GREATEST(0, _offset);
$function$;

REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer, text, numeric, date, date, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documentos_listado(integer, numeric, integer, integer, text, numeric, date, date, text, text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.documentos_filtros_opciones(_anio integer)
RETURNS TABLE(
  canales text[],
  almacenes text[],
  registrados_por text[],
  operaciones text[],
  motivos_abono text[],
  delegaciones text[],
  vendedores text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT d.canal, d.almacen, d.registrado_por, d.operacion, d.motivo_abono, d.delegacion, d.vendedor
    FROM public.documentos_resumen d
    WHERE d.anio = _anio
      AND d.cod_cliente IN (SELECT cp.cod_cliente FROM public.clientes_permitidos(auth.uid()) AS cp)
  )
  SELECT
    (SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT canal AS x FROM base WHERE canal IS NOT NULL AND canal <> '') s),
    (SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT almacen AS x FROM base WHERE almacen IS NOT NULL AND almacen <> '') s),
    (SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT registrado_por AS x FROM base WHERE registrado_por IS NOT NULL AND registrado_por <> '') s),
    (SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT operacion AS x FROM base WHERE operacion IS NOT NULL AND operacion <> '') s),
    (SELECT array_agg(x ORDER BY n DESC, x) FROM (SELECT motivo_abono AS x, COUNT(*) AS n FROM base WHERE motivo_abono IS NOT NULL AND motivo_abono <> '' GROUP BY motivo_abono) s),
    (SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT delegacion AS x FROM base WHERE delegacion IS NOT NULL AND delegacion <> '') s),
    (SELECT array_agg(x ORDER BY x) FROM (SELECT DISTINCT vendedor AS x FROM base WHERE vendedor IS NOT NULL AND vendedor <> '') s);
$function$;

REVOKE ALL ON FUNCTION public.documentos_filtros_opciones(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documentos_filtros_opciones(integer) TO authenticated;