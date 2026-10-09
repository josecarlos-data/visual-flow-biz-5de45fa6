CREATE OR REPLACE FUNCTION public.auditar_cambio_ajustes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_campos text[] := ARRAY[]::text[];
  v_detalle jsonb;
  v_tipo text;
  k text;
  v_h jsonb;
  v_ip inet;
  v_ua text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_tipo := 'dato_alta';
  ELSIF TG_OP = 'UPDATE' THEN v_tipo := 'dato_cambio';
  ELSE v_tipo := 'dato_baja';
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR k IN
      SELECT key FROM jsonb_object_keys(v_old || v_new) AS t(key)
      WHERE key NOT IN ('updated_at', 'created_at')
    LOOP
      IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_campos := v_campos || k;
      END IF;
    END LOOP;
    IF array_length(v_campos, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_detalle := jsonb_build_object('campos', to_jsonb(v_campos),
    'origen', CASE WHEN v_uid IS NULL THEN 'sistema' ELSE 'usuario' END);
  IF v_old IS NOT NULL THEN v_detalle := v_detalle || jsonb_build_object('antes', v_old -> 'value'); END IF;
  IF v_new IS NOT NULL THEN v_detalle := v_detalle || jsonb_build_object('despues', v_new -> 'value'); END IF;

  BEGIN
    -- IP y navegador solo con usuario: sin él la petición viene del servidor.
    IF v_uid IS NOT NULL THEN
      BEGIN
        v_h := nullif(current_setting('request.headers', true), '')::jsonb;
        v_ip := coalesce(nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
                         nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''))::inet;
        v_ua := left(v_h ->> 'user-agent', 500);
      EXCEPTION WHEN OTHERS THEN
        v_ip := NULL; v_ua := NULL;
      END;
    END IF;
    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle, ip, user_agent)
    VALUES (v_uid, v_tipo, 'ok', 'app_settings', COALESCE(v_new ->> 'key', v_old ->> 'key'), v_detalle, v_ip, v_ua);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auditar_cambio_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_old jsonb;
  v_new jsonb;
  v_campos text[] := ARRAY[]::text[];
  v_seguridad jsonb := '{}'::jsonb;
  v_sensibles text[] := ARRAY['is_approved','estado','estado_motivo','ver_margen','exige_2fa','sesiones_max',
    'dispositivos_max','debe_cambiar_password','username','marcada_sospechosa','role'];
  v_k text;
  v_tipo text;
  v_afectado text;
  v_fila jsonb;
  v_h jsonb;
  v_ip inet;
  v_ua text;
BEGIN
  BEGIN
    v_actor := auth.uid();
    IF TG_OP = 'DELETE' THEN v_old := to_jsonb(OLD); v_fila := v_old; v_tipo := 'usuario_baja';
    ELSIF TG_OP = 'INSERT' THEN v_new := to_jsonb(NEW); v_fila := v_new; v_tipo := 'usuario_alta';
    ELSE v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_fila := v_new; v_tipo := 'usuario_cambio';
    END IF;
    v_afectado := v_fila->>'user_id';

    IF TG_OP = 'UPDATE' THEN
      FOR v_k IN SELECT jsonb_object_keys(v_new) LOOP
        CONTINUE WHEN v_k IN ('updated_at','created_at');
        IF (v_old->v_k) IS DISTINCT FROM (v_new->v_k) THEN
          v_campos := v_campos || v_k;
          IF v_k = ANY(v_sensibles) THEN
            v_seguridad := v_seguridad || jsonb_build_object(v_k,
              jsonb_build_object('antes', v_old->v_k, 'despues', v_new->v_k));
          END IF;
        END IF;
      END LOOP;
      IF array_length(v_campos, 1) IS NULL THEN RETURN NULL; END IF;
    ELSE
      FOR v_k IN SELECT jsonb_object_keys(v_fila) LOOP
        IF v_k = ANY(v_sensibles) THEN
          v_seguridad := v_seguridad || jsonb_build_object(v_k,
            CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_object('antes', NULL, 'despues', v_fila->v_k)
                 ELSE jsonb_build_object('antes', v_fila->v_k, 'despues', NULL) END);
        END IF;
      END LOOP;
    END IF;

    -- IP y navegador solo con usuario: sin él la petición viene del servidor.
    IF v_actor IS NOT NULL THEN
      BEGIN
        v_h := nullif(current_setting('request.headers', true), '')::jsonb;
        v_ip := coalesce(nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
                         nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''))::inet;
        v_ua := left(v_h ->> 'user-agent', 500);
      EXCEPTION WHEN OTHERS THEN
        v_ip := NULL; v_ua := NULL;
      END;
    END IF;

    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle, ip, user_agent)
    VALUES (v_actor, v_tipo, 'ok', TG_TABLE_NAME, v_afectado,
      jsonb_build_object(
        'origen', CASE WHEN v_actor IS NULL THEN 'sistema' ELSE 'usuario' END,
        'operacion', TG_OP,
        'campos', to_jsonb(v_campos),
        'seguridad', v_seguridad
      ) || CASE WHEN TG_TABLE_NAME = 'user_dashboard_access'
             THEN jsonb_build_object('dashboard_key', v_fila->>'dashboard_key') ELSE '{}'::jsonb END,
      v_ip, v_ua);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$function$;