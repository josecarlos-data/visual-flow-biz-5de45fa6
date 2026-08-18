
CREATE OR REPLACE FUNCTION public._old_panel_devoluciones(_anio integer, _limite integer DEFAULT 10)
 RETURNS TABLE(tipo text, etiqueta text, importe numeric, lineas integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid())),
  a AS (
    SELECT v.* FROM public.ventas_diarias v JOIN p ON p.cod_cliente = v.cod_cliente
    WHERE v.operacion = 'Abono' AND EXTRACT(YEAR FROM v.fecha)::int = _anio
  )
  (SELECT 'motivo', COALESCE(NULLIF(motivo_abono,''),'Sin motivo'), ABS(SUM(importe)), COUNT(*)::int
   FROM a GROUP BY 2 ORDER BY ABS(SUM(importe)) DESC LIMIT GREATEST(1, LEAST(_limite, 50)))
  UNION ALL
  (SELECT 'referencia', referencia, ABS(SUM(importe)), COUNT(*)::int
   FROM a GROUP BY 2 ORDER BY ABS(SUM(importe)) DESC LIMIT GREATEST(1, LEAST(_limite, 50)))
  UNION ALL
  (SELECT 'vendedor', COALESCE(NULLIF(vendedor_linea,''),'Sin asignar'), ABS(SUM(importe)), COUNT(*)::int
   FROM a GROUP BY 2 ORDER BY ABS(SUM(importe)) DESC LIMIT GREATEST(1, LEAST(_limite, 50)));
$function$;

CREATE OR REPLACE FUNCTION public._old_cliente_top_productos(_cod integer, _anio integer DEFAULT NULL)
 RETURNS TABLE(referencia text, descripcion text, familia text, marca text, unidades numeric, importe numeric, margen numeric, ultima_compra date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  RETURN QUERY
  SELECT v.referencia, p.descripcion,
         COALESCE(p.familia_nombre, p.familia, v.familia),
         COALESCE(p.marca_nombre, p.marca, v.marca),
         SUM(v.unidades), SUM(v.importe),
         CASE WHEN public.puede_ver_margen(auth.uid()) THEN SUM(v.margen) ELSE 0 END,
         MAX(v.fecha)
  FROM public.ventas_diarias v
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE v.cod_cliente = _cod AND (_anio IS NULL OR EXTRACT(YEAR FROM v.fecha)::int = _anio)
  GROUP BY v.referencia, p.descripcion, COALESCE(p.familia_nombre, p.familia, v.familia), COALESCE(p.marca_nombre, p.marca, v.marca)
  ORDER BY SUM(v.importe) DESC
  LIMIT 500;
END; $function$;

DELETE FROM public._diag_p1;

DO $do$
DECLARE t0 timestamptz; i int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"28f5caa7-bae6-4137-872e-a044a06848b0","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  FOR i IN 1..3 LOOP
    t0 := clock_timestamp();
    PERFORM * FROM public._old_panel_devoluciones(2026,10);
    INSERT INTO public._diag_p1 VALUES ('antes','panel_devoluciones', extract(epoch from clock_timestamp()-t0)*1000, i, '2026');
    t0 := clock_timestamp();
    PERFORM * FROM public.panel_devoluciones(2026,10);
    INSERT INTO public._diag_p1 VALUES ('despues','panel_devoluciones', extract(epoch from clock_timestamp()-t0)*1000, i, '2026');
    t0 := clock_timestamp();
    PERFORM * FROM public._old_cliente_top_productos(10090,2026);
    INSERT INTO public._diag_p1 VALUES ('antes','cliente_top_productos', extract(epoch from clock_timestamp()-t0)*1000, i, '10090/2026');
    t0 := clock_timestamp();
    PERFORM * FROM public.cliente_top_productos(10090,2026);
    INSERT INTO public._diag_p1 VALUES ('despues','cliente_top_productos', extract(epoch from clock_timestamp()-t0)*1000, i, '10090/2026');
  END LOOP;
  RESET ROLE;
END $do$;

DROP FUNCTION public._old_panel_devoluciones(integer,integer);
DROP FUNCTION public._old_cliente_top_productos(integer,integer);
