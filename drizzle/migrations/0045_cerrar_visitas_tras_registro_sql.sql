-- 0045 (contenido real de la 0044 aprobada): visitas cerradas tras registrar; bloques solo por RPC o revisor ajeno.

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
  IF _uid IS NULL OR public.is_admin(_uid) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.origen IS DISTINCT FROM 'app' THEN
    RAISE EXCEPTION 'Solo se pueden registrar visitas desde la app.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.origen IS DISTINCT FROM 'app' THEN
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

  IF _ins IS NULL THEN
    PERFORM set_config('crm.registrar_visita', '', true);
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

  PERFORM set_config('crm.registrar_visita', '', true);

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

CREATE OR REPLACE FUNCTION public.editar_bloque_revision(_bloque_id uuid, _campos jsonb, _updated_at text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.visita_bloques%ROWTYPE;
  _permitidas text[];
  _nuevos jsonb := '{}'::jsonb;
  _meta jsonb;
  _cambiadas text[] := ARRAY[]::text[];
  _k text;
  _v jsonb;
  _final jsonb;
  _completo boolean;
  _nuevo_updated timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.puede_revisar_visitas(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO _b FROM public.visita_bloques WHERE id = _bloque_id FOR UPDATE;
  IF NOT FOUND OR NOT public.puede_editar_bloque(_b.visita_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF NOT public.is_admin(auth.uid())
     AND EXISTS (SELECT 1 FROM public.visitas v WHERE v.id = _b.visita_id AND v.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No puedes corregir bloques de tus propias visitas';
  END IF;

  IF _updated_at IS NULL OR _b.updated_at <> _updated_at::timestamptz THEN
    RAISE EXCEPTION 'Este bloque ha cambiado mientras lo editabas. Vuelve a abrirlo.';
  END IF;

  SELECT array_agg(k) INTO _permitidas FROM (
    SELECT mc.campo_key AS k FROM public.motivo_campos mc
     WHERE mc.motivo_key = _b.motivo_key AND mc.is_active
    UNION
    SELECT mc.campo_key || '_nombre' FROM public.motivo_campos mc
     WHERE mc.motivo_key = _b.motivo_key AND mc.is_active AND mc.tipo = 'adjunto'
  ) s;

  FOR _k, _v IN SELECT key, value FROM jsonb_each(COALESCE(_campos, '{}'::jsonb)) LOOP
    IF _k = ANY(COALESCE(_permitidas, ARRAY[]::text[]))
       AND (_b.campos -> _k) IS DISTINCT FROM _v
       AND NOT ((_b.campos -> _k) IS NULL AND _v = '""'::jsonb) THEN
      _nuevos := _nuevos || jsonb_build_object(_k, _v);
      _cambiadas := _cambiadas || _k;
    END IF;
  END LOOP;

  IF cardinality(_cambiadas) = 0 THEN
    RETURN jsonb_build_object('cambiados', 0, 'updated_at', _b.updated_at::text, 'validacion', _b.validacion);
  END IF;

  _final := COALESCE(_b.campos, '{}'::jsonb) || _nuevos;
  _meta := COALESCE(_b.campos_meta, '{}'::jsonb);
  FOREACH _k IN ARRAY _cambiadas LOOP
    _meta := _meta || jsonb_build_object(_k, jsonb_build_object('origen', 'revisor', 'editado_por', auth.uid(), 'editado_en', now()));
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.motivo_campos mc
     WHERE mc.motivo_key = _b.motivo_key AND mc.is_active AND mc.is_required
       AND COALESCE(NULLIF(btrim(_final ->> mc.campo_key), ''), NULLIF(_final -> mc.campo_key, '[]'::jsonb)::text) IS NULL
  ) INTO _completo;

  UPDATE public.visita_bloques
     SET campos = _final,
         campos_meta = _meta,
         completo = _completo
   WHERE id = _bloque_id
   RETURNING updated_at INTO _nuevo_updated;

  RETURN jsonb_build_object(
    'cambiados', cardinality(_cambiadas),
    'updated_at', _nuevo_updated::text,
    'validacion', _b.validacion
  );
END;
$$;

REVOKE ALL ON FUNCTION public.editar_bloque_revision(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_bloque_revision(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.puede_revisar_bloque(_visita_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid())
      OR (public.puede_revisar_visitas(auth.uid())
          AND public.puede_ver_bloque(_visita_id)
          AND EXISTS (SELECT 1 FROM public.visitas v WHERE v.id = _visita_id AND v.user_id IS DISTINCT FROM auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.puede_revisar_bloque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_revisar_bloque(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.puede_crear_bloque_propio(_visita_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.visitas v
     WHERE v.id = _visita_id
       AND v.user_id = auth.uid()
       AND COALESCE(v.validacion, 'pendiente') = 'pendiente'
  ) AND (
    COALESCE(current_setting('crm.registrar_visita', true), '') = '1'
    OR NOT COALESCE((SELECT lower(value) = 'true' FROM public.app_settings WHERE key = 'visita_alta_directa_bloqueada'), false)
  )
$$;
REVOKE ALL ON FUNCTION public.puede_crear_bloque_propio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_crear_bloque_propio(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users update own visitas" ON public.visitas;
CREATE POLICY "Users update own visitas" ON public.visitas
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (
    (SELECT public.is_admin(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'director_comercial'::app_role))
    OR ((SELECT public.has_role(auth.uid(), 'jefe_de_zona'::app_role)) AND (cod_cliente IS NULL OR cod_cliente IN (
         SELECT c.cod_cliente FROM public.clientes c WHERE c.delegacion = (SELECT public.get_user_delegacion(auth.uid())))))))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (
    (SELECT public.is_admin(auth.uid()))
    OR (SELECT public.has_role(auth.uid(), 'director_comercial'::app_role))
    OR ((SELECT public.has_role(auth.uid(), 'jefe_de_zona'::app_role)) AND (cod_cliente IS NULL OR cod_cliente IN (
         SELECT c.cod_cliente FROM public.clientes c WHERE c.delegacion = (SELECT public.get_user_delegacion(auth.uid())))))));

DROP POLICY IF EXISTS "Users delete own visitas" ON public.visitas;
CREATE POLICY "Users delete own visitas" ON public.visitas
  FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "crear bloques en visitas propias" ON public.visita_bloques;
CREATE POLICY "crear bloques en visitas propias" ON public.visita_bloques
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.puede_revisar_bloque(visita_id) OR public.puede_crear_bloque_propio(visita_id)));

DROP POLICY IF EXISTS "editar bloques propios o revisables" ON public.visita_bloques;
CREATE POLICY "editar bloques propios o revisables" ON public.visita_bloques
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.puede_revisar_bloque(visita_id))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND public.puede_revisar_bloque(visita_id));

DROP POLICY IF EXISTS "borrar bloques propios o admin" ON public.visita_bloques;
CREATE POLICY "borrar bloques propios o admin" ON public.visita_bloques
  FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.puede_revisar_bloque(visita_id));