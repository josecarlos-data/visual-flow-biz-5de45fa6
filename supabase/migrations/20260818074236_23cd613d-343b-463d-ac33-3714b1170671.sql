CREATE OR REPLACE FUNCTION public.cliente_documentos(_cod integer, _limite integer DEFAULT 100)
RETURNS TABLE(id_documento text, fecha date, hora time without time zone, tipo_documento text, operacion text, canal text, almacen text, vendedor_linea text, registrado_por text, importe numeric, margen numeric, lineas integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_margen boolean;
BEGIN
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  v_margen := public.puede_ver_margen(auth.uid());
  RETURN QUERY
  SELECT v.id_documento, MIN(v.fecha), MIN(v.hora),
         (array_agg(v.tipo_documento))[1], (array_agg(v.operacion))[1], (array_agg(v.canal))[1],
         (array_agg(v.almacen))[1], (array_agg(v.vendedor_linea))[1], (array_agg(v.registrado_por))[1],
         SUM(v.importe),
         CASE WHEN v_margen THEN SUM(v.margen) ELSE 0 END,
         COUNT(*)::int
  FROM public.ventas_diarias v
  WHERE v.cod_cliente = _cod AND v.id_documento IS NOT NULL
  GROUP BY v.id_documento
  ORDER BY MIN(v.fecha) DESC, MIN(v.hora) DESC
  LIMIT GREATEST(1, LEAST(_limite, 500));
END; $function$;

DO $$
DECLARE u record; v_doc text := 'AL06|2026|600955';
BEGIN
  FOR u IN SELECT * FROM (VALUES
      ('admin','28f5caa7-bae6-4137-872e-a044a06848b0'),
      ('comercial','6b97411d-a43b-45d2-ac7b-62a495d7ec12'),
      ('jefe_zona','ca79a417-0f3a-42c2-851a-a67327f77bb5'),
      ('director','a7e2e7b5-78cb-4e2d-b91e-1f51c79ae020')) t(nombre,uid)
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u.uid, 'role','authenticated')::text, true);
    INSERT INTO public._snap_margen
      SELECT 'despues', u.nombre, 'cliente_top_productos', COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.referencia),'[]'::jsonb)
      FROM public.cliente_top_productos(10833, 2026) x;
    INSERT INTO public._snap_margen
      SELECT 'despues', u.nombre, 'cliente_documentos', COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id_documento),'[]'::jsonb)
      FROM public.cliente_documentos(10833, 100) x;
    INSERT INTO public._snap_margen
      SELECT 'despues', u.nombre, 'cliente_documento_lineas', COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.referencia),'[]'::jsonb)
      FROM public.cliente_documento_lineas(10833, v_doc) x;
    INSERT INTO public._snap_margen
      SELECT 'despues', u.nombre, 'panel_devoluciones', COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.tipo, x.etiqueta),'[]'::jsonb)
      FROM public.panel_devoluciones(2026, 10) x;
    INSERT INTO public._snap_margen VALUES ('despues', u.nombre, 'puede_ver_margen', to_jsonb(public.puede_ver_margen(u.uid::uuid)));
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;