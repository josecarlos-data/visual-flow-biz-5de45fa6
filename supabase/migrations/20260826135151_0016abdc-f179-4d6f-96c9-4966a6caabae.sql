DROP FUNCTION IF EXISTS public.panel_devoluciones(integer, integer);

CREATE FUNCTION public.panel_devoluciones(_anio integer, _limite integer DEFAULT 10)
 RETURNS TABLE(tipo text, etiqueta text, descripcion text, importe numeric, lineas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid())),
  a AS (
    SELECT v.motivo_abono, v.referencia, v.vendedor_linea, v.importe
    FROM public.ventas_diarias v JOIN p ON p.cod_cliente = v.cod_cliente
    WHERE v.operacion = 'Abono'
      AND v.fecha >= make_date(_anio,1,1) AND v.fecha < make_date(_anio+1,1,1)
  )
  (SELECT 'motivo', COALESCE(NULLIF(a.motivo_abono,''),'Sin motivo'), NULL::text, ABS(SUM(a.importe)), COUNT(*)::int
   FROM a GROUP BY 2 ORDER BY ABS(SUM(a.importe)) DESC LIMIT GREATEST(1, LEAST(_limite, 50)))
  UNION ALL
  (SELECT 'referencia', a.referencia, pr.descripcion, ABS(SUM(a.importe)), COUNT(*)::int
   FROM a LEFT JOIN public.productos pr ON pr.referencia = a.referencia
   GROUP BY a.referencia, pr.descripcion ORDER BY ABS(SUM(a.importe)) DESC LIMIT GREATEST(1, LEAST(_limite, 50)))
  UNION ALL
  (SELECT 'vendedor', COALESCE(NULLIF(a.vendedor_linea,''),'Sin asignar'), NULL::text, ABS(SUM(a.importe)), COUNT(*)::int
   FROM a GROUP BY 2 ORDER BY ABS(SUM(a.importe)) DESC LIMIT GREATEST(1, LEAST(_limite, 50)));
$function$;

GRANT EXECUTE ON FUNCTION public.panel_devoluciones(integer, integer) TO authenticated;