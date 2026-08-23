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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_margen boolean;
BEGIN
  v_margen := public.puede_ver_margen(auth.uid());
  RETURN QUERY
  WITH docs AS (
    SELECT
      v.id_documento AS _id_documento,
      MIN(v.fecha) AS _fecha,
      MIN(v.hora) AS _hora,
      (array_agg(v.tipo_documento))[1] AS _tipo_documento,
      (array_agg(v.operacion))[1] AS _operacion,
      (array_agg(v.canal))[1] AS _canal,
      (array_agg(v.almacen))[1] AS _almacen,
      (array_agg(v.vendedor_linea))[1] AS _vendedor_linea,
      (array_agg(v.registrado_por))[1] AS _registrado_por,
      SUM(v.importe) AS _importe,
      CASE WHEN v_margen THEN SUM(v.margen) ELSE 0 END AS _margen,
      COUNT(*)::int AS _lineas,
      v.cod_cliente AS _cod_cliente,
      c.cliente AS _cliente,
      COUNT(*) OVER () AS _total_filas
    FROM public.ventas_diarias v
    JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    WHERE v.id_documento IS NOT NULL
      AND v.cod_cliente IN (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid()))
      AND v.fecha >= make_date(_anio, 1, 1)
      AND v.fecha < make_date(_anio + 1, 1, 1)
    GROUP BY v.id_documento, v.cod_cliente, c.cliente
    HAVING ABS(SUM(v.importe)) >= _importe_min
  )
  SELECT
    _id_documento,
    _fecha,
    _hora,
    _tipo_documento,
    _operacion,
    _canal,
    _almacen,
    _vendedor_linea,
    _registrado_por,
    _importe,
    _margen,
    _lineas,
    _cod_cliente,
    _cliente,
    _total_filas
  FROM docs
  ORDER BY _fecha DESC, _hora DESC
  LIMIT GREATEST(1, LEAST(_limite, 200))
  OFFSET GREATEST(0, _offset);
END; $function$;

REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.documentos_listado(integer, numeric, integer, integer) TO authenticated;