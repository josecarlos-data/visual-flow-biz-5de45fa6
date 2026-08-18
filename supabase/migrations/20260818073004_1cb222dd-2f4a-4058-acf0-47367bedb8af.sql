
CREATE TABLE IF NOT EXISTS public._diag_p1(
  paso text, fn text, ms numeric, filas int, nota text, creado timestamptz default now());

-- ============ SNAPSHOT ANTES ============
DO $do$
DECLARE t0 timestamptz; n int; v_doc text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"28f5caa7-bae6-4137-872e-a044a06848b0","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;

  CREATE TEMP TABLE _b_dev AS SELECT * FROM public.panel_devoluciones(2026, 10);
  t0 := clock_timestamp();
  PERFORM count(*) FROM public.panel_devoluciones(2026, 10);
  INSERT INTO public._diag_p1 VALUES ('antes','panel_devoluciones', extract(milliseconds from clock_timestamp()-t0) + 1000*extract(seconds from clock_timestamp()-t0), (SELECT count(*) FROM _b_dev), '2026');

  CREATE TEMP TABLE _b_top AS SELECT * FROM public.cliente_top_productos(10090, 2026);
  t0 := clock_timestamp();
  PERFORM count(*) FROM public.cliente_top_productos(10090, 2026);
  INSERT INTO public._diag_p1 VALUES ('antes','cliente_top_productos', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _b_top), 'cod 10090 / 2026');

  CREATE TEMP TABLE _b_topnull AS SELECT * FROM public.cliente_top_productos(10090, NULL);
  CREATE TEMP TABLE _b_docs AS SELECT * FROM public.cliente_documentos(10090, 100);
  t0 := clock_timestamp();
  PERFORM count(*) FROM public.cliente_documentos(10090, 100);
  INSERT INTO public._diag_p1 VALUES ('antes','cliente_documentos', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _b_docs), 'cod 10090');

  SELECT id_documento INTO v_doc FROM _b_docs ORDER BY fecha DESC LIMIT 1;
  CREATE TEMP TABLE _b_lin AS SELECT * FROM public.cliente_documento_lineas(10090, v_doc);
  t0 := clock_timestamp();
  PERFORM count(*) FROM public.cliente_documento_lineas(10090, v_doc);
  INSERT INTO public._diag_p1 VALUES ('antes','cliente_documento_lineas', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _b_lin), v_doc);

  RESET ROLE;
END $do$;

-- corrección del cálculo de ms del primer registro
UPDATE public._diag_p1 SET ms = NULL WHERE fn='panel_devoluciones' AND paso='antes';

-- ============ NUEVAS DEFINICIONES ============
CREATE OR REPLACE FUNCTION public.panel_devoluciones(_anio integer, _limite integer DEFAULT 10)
 RETURNS TABLE(tipo text, etiqueta text, importe numeric, lineas integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid())),
  a AS (
    SELECT v.motivo_abono, v.referencia, v.vendedor_linea, v.importe
    FROM public.ventas_diarias v JOIN p ON p.cod_cliente = v.cod_cliente
    WHERE v.operacion = 'Abono'
      AND v.fecha >= make_date(_anio,1,1) AND v.fecha < make_date(_anio+1,1,1)
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

CREATE OR REPLACE FUNCTION public.cliente_top_productos(_cod integer, _anio integer DEFAULT NULL::integer)
 RETURNS TABLE(referencia text, descripcion text, familia text, marca text, unidades numeric, importe numeric, margen numeric, ultima_compra date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  RETURN QUERY
  SELECT v.referencia,
         p.descripcion,
         COALESCE(p.familia_nombre, p.familia, v.familia),
         COALESCE(p.marca_nombre, p.marca, v.marca),
         SUM(v.unidades),
         SUM(v.importe),
         CASE WHEN public.puede_ver_margen(auth.uid()) THEN SUM(v.margen) ELSE 0 END,
         MAX(v.fecha)
  FROM public.ventas_diarias v
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE v.cod_cliente = _cod
    AND (_anio IS NULL OR (v.fecha >= make_date(_anio,1,1) AND v.fecha < make_date(_anio+1,1,1)))
  GROUP BY v.referencia, p.descripcion, COALESCE(p.familia_nombre, p.familia, v.familia), COALESCE(p.marca_nombre, p.marca, v.marca)
  ORDER BY SUM(v.importe) DESC
  LIMIT 500;
END;
$function$;

-- ============ SNAPSHOT DESPUÉS + COMPARACIÓN ============
DO $do$
DECLARE t0 timestamptz; d1 int; d2 int; v_doc text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"28f5caa7-bae6-4137-872e-a044a06848b0","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;

  t0 := clock_timestamp();
  CREATE TEMP TABLE _a_dev AS SELECT * FROM public.panel_devoluciones(2026, 10);
  INSERT INTO public._diag_p1 VALUES ('despues','panel_devoluciones', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _a_dev), '2026');
  SELECT count(*) INTO d1 FROM (SELECT * FROM _b_dev EXCEPT ALL SELECT * FROM _a_dev) x;
  SELECT count(*) INTO d2 FROM (SELECT * FROM _a_dev EXCEPT ALL SELECT * FROM _b_dev) x;
  INSERT INTO public._diag_p1 VALUES ('diff','panel_devoluciones', NULL, d1+d2, 'except ambos sentidos');

  t0 := clock_timestamp();
  CREATE TEMP TABLE _a_top AS SELECT * FROM public.cliente_top_productos(10090, 2026);
  INSERT INTO public._diag_p1 VALUES ('despues','cliente_top_productos', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _a_top), 'cod 10090 / 2026');
  SELECT count(*) INTO d1 FROM (SELECT * FROM _b_top EXCEPT ALL SELECT * FROM _a_top) x;
  SELECT count(*) INTO d2 FROM (SELECT * FROM _a_top EXCEPT ALL SELECT * FROM _b_top) x;
  INSERT INTO public._diag_p1 VALUES ('diff','cliente_top_productos', NULL, d1+d2, 'except ambos sentidos');

  CREATE TEMP TABLE _a_topnull AS SELECT * FROM public.cliente_top_productos(10090, NULL);
  SELECT count(*) INTO d1 FROM (SELECT * FROM _b_topnull EXCEPT ALL SELECT * FROM _a_topnull) x;
  SELECT count(*) INTO d2 FROM (SELECT * FROM _a_topnull EXCEPT ALL SELECT * FROM _b_topnull) x;
  INSERT INTO public._diag_p1 VALUES ('diff','cliente_top_productos(NULL)', NULL, d1+d2, 'anio NULL, except ambos sentidos');

  t0 := clock_timestamp();
  CREATE TEMP TABLE _a_docs AS SELECT * FROM public.cliente_documentos(10090, 100);
  INSERT INTO public._diag_p1 VALUES ('despues','cliente_documentos', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _a_docs), 'sin cambios: no tenia filtro de anio');
  SELECT count(*) INTO d1 FROM (SELECT * FROM _b_docs EXCEPT ALL SELECT * FROM _a_docs) x;
  SELECT count(*) INTO d2 FROM (SELECT * FROM _a_docs EXCEPT ALL SELECT * FROM _b_docs) x;
  INSERT INTO public._diag_p1 VALUES ('diff','cliente_documentos', NULL, d1+d2, 'except ambos sentidos');

  SELECT id_documento INTO v_doc FROM _a_docs ORDER BY fecha DESC LIMIT 1;
  t0 := clock_timestamp();
  CREATE TEMP TABLE _a_lin AS SELECT * FROM public.cliente_documento_lineas(10090, v_doc);
  INSERT INTO public._diag_p1 VALUES ('despues','cliente_documento_lineas', extract(epoch from clock_timestamp()-t0)*1000, (SELECT count(*) FROM _a_lin), 'sin cambios: no tenia filtro de anio');
  SELECT count(*) INTO d1 FROM (SELECT * FROM _b_lin EXCEPT ALL SELECT * FROM _a_lin) x;
  SELECT count(*) INTO d2 FROM (SELECT * FROM _a_lin EXCEPT ALL SELECT * FROM _b_lin) x;
  INSERT INTO public._diag_p1 VALUES ('diff','cliente_documento_lineas', NULL, d1+d2, 'except ambos sentidos');

  RESET ROLE;
END $do$;
