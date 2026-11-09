CREATE TABLE public.ventas_diarias_carga (
  carga_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  cod_cliente integer NOT NULL,
  referencia text NOT NULL,
  marca text, familia text,
  fecha date NOT NULL,
  unidades numeric NOT NULL DEFAULT 0,
  importe numeric NOT NULL DEFAULT 0,
  margen numeric NOT NULL DEFAULT 0,
  id_documento text, ejercicio integer, num_documento integer, linea integer,
  tipo_documento text, operacion text, hora time, canal text,
  cod_almacen text, almacen text, cod_vendedor_linea text, vendedor_linea text,
  registrado_por text, motivo_abono text, id_doc_enlazado text, descripcion_linea text
);
CREATE INDEX idx_vd_carga_id ON public.ventas_diarias_carga (carga_id);
REVOKE ALL ON public.ventas_diarias_carga FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ventas_diarias_carga TO service_role;
ALTER TABLE public.ventas_diarias_carga ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ventas_diarias_carga IS 'Zona de carga del Maestro ISI: se rellena por tandas y solo pasa a ventas_diarias entera con aplicar_carga_ventas.';

CREATE OR REPLACE FUNCTION public.preparar_carga_ventas()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid := gen_random_uuid();
BEGIN
  IF NOT (public.is_approved(auth.uid()) AND public.is_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  DELETE FROM public.ventas_diarias_carga WHERE creado_en < now() - interval '24 hours';
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.insertar_ventas_carga(_carga uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT (public.is_approved(auth.uid()) AND public.is_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _carga IS NULL THEN RAISE EXCEPTION 'Falta el identificador de carga'; END IF;
  INSERT INTO public.ventas_diarias_carga (
    carga_id, cod_cliente, referencia, marca, familia, fecha, unidades, importe, margen,
    id_documento, ejercicio, num_documento, linea, tipo_documento, operacion, hora, canal,
    cod_almacen, almacen, cod_vendedor_linea, vendedor_linea, registrado_por,
    motivo_abono, id_doc_enlazado, descripcion_linea)
  SELECT _carga, (r->>'cod_cliente')::int, r->>'referencia', NULLIF(r->>'marca',''), NULLIF(r->>'familia',''),
         (r->>'fecha')::date, COALESCE((r->>'unidades')::numeric,0), COALESCE((r->>'importe')::numeric,0), COALESCE((r->>'margen')::numeric,0),
         NULLIF(r->>'id_documento',''), NULLIF(r->>'ejercicio','')::int, NULLIF(r->>'num_documento','')::int,
         NULLIF(r->>'linea','')::int, NULLIF(r->>'tipo_documento',''), NULLIF(r->>'operacion',''),
         NULLIF(r->>'hora','')::time, NULLIF(r->>'canal',''), NULLIF(r->>'cod_almacen',''), NULLIF(r->>'almacen',''),
         NULLIF(r->>'cod_vendedor_linea',''), NULLIF(r->>'vendedor_linea',''), NULLIF(r->>'registrado_por',''),
         NULLIF(r->>'motivo_abono',''), NULLIF(r->>'id_doc_enlazado',''), NULLIF(r->>'descripcion_linea','')
  FROM jsonb_array_elements(_rows) r
  WHERE NULLIF(r->>'cod_cliente','') IS NOT NULL
    AND NULLIF(r->>'referencia','') IS NOT NULL
    AND NULLIF(r->>'fecha','') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.aplicar_carga_ventas(_carga uuid, _forzar boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10min'
AS $$
DECLARE _nuevas bigint; _actuales bigint; _min date; _max date; _min_ant date; _max_ant date; _ins bigint;
BEGIN
  IF NOT (public.is_approved(auth.uid()) AND public.is_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('aplicar_carga_ventas')) THEN
    RAISE EXCEPTION 'Ya hay otra carga de ventas aplicándose. Espera a que termine.';
  END IF;
  SET LOCAL lock_timeout = '30s';

  SELECT count(*), min(fecha), max(fecha) INTO _nuevas, _min, _max FROM public.ventas_diarias_carga WHERE carga_id = _carga;
  IF _nuevas = 0 THEN RAISE EXCEPTION 'La carga está vacía: no se ha cambiado nada'; END IF;
  SELECT count(*), min(fecha), max(fecha) INTO _actuales, _min_ant, _max_ant FROM public.ventas_diarias;

  IF NOT _forzar AND _actuales > 0 AND _nuevas < _actuales * 0.95 THEN
    RETURN jsonb_build_object('aplicada', false, 'aviso', 'menos_95', 'filas_carga', _nuevas, 'filas_actuales', _actuales);
  END IF;

  TRUNCATE public.ventas_diarias;
  INSERT INTO public.ventas_diarias (
    cod_cliente, referencia, marca, familia, fecha, unidades, importe, margen,
    id_documento, ejercicio, num_documento, linea, tipo_documento, operacion, hora, canal,
    cod_almacen, almacen, cod_vendedor_linea, vendedor_linea, registrado_por,
    motivo_abono, id_doc_enlazado, descripcion_linea)
  SELECT cod_cliente, referencia, marca, familia, fecha, unidades, importe, margen,
    id_documento, ejercicio, num_documento, linea, tipo_documento, operacion, hora, canal,
    cod_almacen, almacen, cod_vendedor_linea, vendedor_linea, registrado_por,
    motivo_abono, id_doc_enlazado, descripcion_linea
  FROM public.ventas_diarias_carga WHERE carga_id = _carga;
  GET DIAGNOSTICS _ins = ROW_COUNT;
  DELETE FROM public.ventas_diarias_carga WHERE carga_id = _carga;

  INSERT INTO public.auditoria_eventos (user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (auth.uid(), (SELECT email FROM public.profiles WHERE user_id = auth.uid()), 'carga_maestro_isi', 'ok',
          'ventas_diarias', _carga::text,
          jsonb_build_object('filas_antes', _actuales, 'filas_despues', _ins, 'forzado', _forzar,
                             'desde', _min, 'hasta', _max, 'desde_antes', _min_ant, 'hasta_antes', _max_ant));

  RETURN jsonb_build_object('aplicada', true, 'filas', _ins, 'filas_antes', _actuales, 'desde', _min, 'hasta', _max);
END; $$;

REVOKE ALL ON FUNCTION public.preparar_carga_ventas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insertar_ventas_carga(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aplicar_carga_ventas(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_carga_ventas() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insertar_ventas_carga(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_carga_ventas(uuid, boolean) TO authenticated, service_role;

ALTER FUNCTION public.refrescar_resumenes_admin() SET statement_timeout = '10min';
ALTER FUNCTION public.refrescar_documentos_resumen() SET statement_timeout = '10min';

DROP FUNCTION public.reset_maestro_isi_data();