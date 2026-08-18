DO $$
DECLARE t0 timestamptz; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','6b97411d-a43b-45d2-ac7b-62a495d7ec12','role','authenticated')::text, true);
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.cliente_top_productos(10833, 2026);
  RAISE NOTICE 'cliente_top_productos: % ms (% filas)', round(extract(epoch from clock_timestamp()-t0)*1000), n;
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.cliente_documentos(10833, 100);
  RAISE NOTICE 'cliente_documentos: % ms (% filas)', round(extract(epoch from clock_timestamp()-t0)*1000), n;
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.cliente_documento_lineas(10833, 'AL06|2026|600955');
  RAISE NOTICE 'cliente_documento_lineas: % ms (% filas)', round(extract(epoch from clock_timestamp()-t0)*1000), n;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

DROP TABLE IF EXISTS public._snap_margen;