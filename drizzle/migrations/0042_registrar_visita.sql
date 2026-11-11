INSERT INTO public.app_settings (key, value, description) VALUES
  ('visita_dias_atras_max', '7', 'Días hacia atrás que un comercial puede registrar una visita (el admin está exento)'),
  ('visita_alta_directa_bloqueada', 'false', 'Si es true, las visitas de la app solo se pueden crear desde la pantalla de registro')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.visitas_guard_alta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hoy date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  _n integer;
  _bloqueada boolean;
BEGIN
  IF _uid IS NULL OR NEW.origen IS DISTINCT FROM 'app' OR public.is_admin(_uid) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT lower(value) = 'true' INTO _bloqueada FROM public.app_settings WHERE key = 'visita_alta_directa_bloqueada';
    IF COALESCE(_bloqueada, false) AND COALESCE(current_setting('crm.registrar_visita', true), '') <> '1' THEN
      RAISE EXCEPTION 'Registra la visita desde la pantalla «Registrar visita».' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.fecha IS DISTINCT FROM OLD.fecha THEN
    SELECT CASE WHEN value ~ '^\d+$' THEN value::integer END INTO _n FROM public.app_settings WHERE key = 'visita_dias_atras_max';
    _n := COALESCE(_n, 7);
    IF NEW.fecha > _hoy THEN
      RAISE EXCEPTION 'La fecha de la visita no puede ser posterior a hoy.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.fecha < _hoy - _n THEN
      RAISE EXCEPTION 'La fecha de la visita no puede ser de hace más de % días.', _n USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.visitas_guard_alta() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_visitas_guard_alta
  BEFORE INSERT OR UPDATE OF fecha ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.visitas_guard_alta();

CREATE OR REPLACE FUNCTION public.registrar_visita(_id uuid, _visita jsonb, _bloques jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hoy date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  _owner uuid;
  _fecha date;
  _tipo text;
  _res text;
  _cod integer;
  _ext text;
  _lat numeric;
  _lng numeric;
  _hora time;
  _vendedor text;
  _nb integer;
  _ins uuid;
  _agenda boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador de la visita.' USING ERRCODE = 'P0001';
  END IF;

  -- Reintento: si ya existe y es del usuario, no se toca nada.
  SELECT user_id INTO _owner FROM public.visitas WHERE id = _id;
  IF FOUND THEN
    IF _owner IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.visitas_planificadas WHERE visita_id = _id AND estado = 'realizada') INTO _agenda;
    RETURN jsonb_build_object('id', _id, 'ya_existia', true, 'agenda_marcada', _agenda);
  END IF;

  _visita := COALESCE(_visita, '{}'::jsonb);
  _bloques := COALESCE(_bloques, '[]'::jsonb);
  IF jsonb_typeof(_bloques) <> 'array' THEN
    RAISE EXCEPTION 'Los bloques de la visita no son válidos.' USING ERRCODE = 'P0001';
  END IF;
  _nb := jsonb_array_length(_bloques);

  _tipo := COALESCE(NULLIF(_visita->>'tipo', ''), 'cliente');
  _res := COALESCE(NULLIF(_visita->>'resultado_visita', ''), 'efectiva');
  _cod := NULLIF(_visita->>'cod_cliente', '')::integer;
  _ext := NULLIF(btrim(COALESCE(_visita->>'cliente_externo', '')), '');
  _fecha := COALESCE(NULLIF(_visita->>'fecha', '')::date, _hoy);

  IF _cod IS NULL AND _ext IS NULL THEN
    RAISE EXCEPTION 'Indica el cliente de la visita.' USING ERRCODE = 'P0001';
  END IF;
  IF _res <> 'efectiva' AND _nb > 0 THEN
    RAISE EXCEPTION 'Una visita no efectiva no lleva bloques.' USING ERRCODE = 'P0001';
  END IF;
  IF _res = 'efectiva' AND _nb = 0 THEN
    RAISE EXCEPTION 'Añade al menos un bloque a la visita.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_bloques) b
    WHERE NOT EXISTS (SELECT 1 FROM public.motivos_visita m WHERE m.key = b->>'motivo_key' AND m.is_active)
  ) THEN
    RAISE EXCEPTION 'Uno de los bloques tiene un motivo que no existe.' USING ERRCODE = 'P0001';
  END IF;

  IF _fecha = _hoy THEN
    _hora := date_trunc('second', (now() AT TIME ZONE 'Europe/Madrid'))::time;
    IF _tipo <> 'llamada' THEN
      _lat := NULLIF(_visita->>'latitud', '')::numeric;
      _lng := NULLIF(_visita->>'longitud', '')::numeric;
      IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN
        _lat := NULL; _lng := NULL;
      END IF;
    END IF;
  END IF;

  SELECT employee_code INTO _vendedor FROM public.profiles WHERE user_id = _uid LIMIT 1;

  PERFORM set_config('crm.registrar_visita', '1', true);

  INSERT INTO public.visitas (
    id, cod_cliente, cliente_externo, motivo_key, fecha, hora, tipo, resultado_visita,
    user_id, vendedor, transcripcion, observaciones, campos, estado, origen,
    latitud, longitud, analisis_modelo, analisis_prompt_version
  ) VALUES (
    _id, _cod, CASE WHEN _cod IS NULL THEN _ext END,
    CASE WHEN _nb > 0 THEN _bloques->0->>'motivo_key' END,
    _fecha, _hora, _tipo, _res,
    _uid, _vendedor, NULLIF(_visita->>'transcripcion', ''), NULLIF(_visita->>'observaciones', ''),
    CASE WHEN jsonb_typeof(_visita->'campos') = 'object' THEN _visita->'campos' ELSE '{}'::jsonb END,
    'registrada', 'app', _lat, _lng,
    NULLIF(_visita->>'analisis_modelo', ''), NULLIF(_visita->>'analisis_prompt_version', '')
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO _ins;

  PERFORM set_config('crm.registrar_visita', '', true);

  IF _ins IS NULL THEN
    -- Carrera con otro intento simultáneo.
    SELECT user_id INTO _owner FROM public.visitas WHERE id = _id;
    IF _owner IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.visitas_planificadas WHERE visita_id = _id AND estado = 'realizada') INTO _agenda;
    RETURN jsonb_build_object('id', _id, 'ya_existia', true, 'agenda_marcada', _agenda);
  END IF;

  IF _nb > 0 THEN
    INSERT INTO public.visita_bloques (visita_id, motivo_key, campos, campos_meta, completo, orden)
    SELECT _id, b->>'motivo_key',
           CASE WHEN jsonb_typeof(b->'campos') = 'object' THEN b->'campos' ELSE '{}'::jsonb END,
           CASE WHEN jsonb_typeof(b->'campos_meta') = 'object' THEN b->'campos_meta' ELSE '{}'::jsonb END,
           COALESCE((b->>'completo')::boolean, true),
           (o - 1)::integer
    FROM jsonb_array_elements(_bloques) WITH ORDINALITY AS t(b, o);
  END IF;

  IF _cod IS NOT NULL AND _lat IS NOT NULL THEN
    PERFORM public.registrar_geo_cliente(_cod, _lat, _lng);
    SELECT EXISTS (SELECT 1 FROM public.visitas_planificadas WHERE visita_id = _id AND estado = 'realizada') INTO _agenda;
  ELSIF _cod IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.visitas_planificadas WHERE visita_id = _id AND estado = 'realizada') INTO _agenda;
  END IF;

  RETURN jsonb_build_object('id', _id, 'ya_existia', false, 'agenda_marcada', _agenda);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_visita(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_visita(uuid, jsonb, jsonb) TO authenticated;