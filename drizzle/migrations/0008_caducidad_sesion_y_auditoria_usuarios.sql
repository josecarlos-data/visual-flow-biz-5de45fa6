INSERT INTO public.app_settings (key, value, description)
VALUES ('sesion_duracion_horas', '12', 'Duración máxima de sesión en horas desde el inicio de sesión. Vacío o 0 = sin límite.')
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.verificar_sesion(text);

CREATE FUNCTION public.verificar_sesion(_sesion_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ultima timestamptz;
  v_sesiones_activo text;
  v_tiene_sesiones boolean;
  v_horas_txt text;
  v_horas numeric;
  v_inicio numeric;
BEGIN
  IF v_uid IS NULL OR _sesion_id IS NULL THEN
    RETURN jsonb_build_object('vigente', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_uid
      AND NOT (estado = 'activo' OR (estado = 'suspendido_temporal' AND bloqueado_hasta <= now()))
  ) THEN
    RETURN jsonb_build_object('vigente', false, 'motivo', 'usuario_bloqueado');
  END IF;

  -- Duración máxima de sesión: desde la marca más antigua de amr (cualquier método)
  SELECT value INTO v_horas_txt FROM public.app_settings WHERE key = 'sesion_duracion_horas';
  IF v_horas_txt ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN
    v_horas := trim(v_horas_txt)::numeric;
    IF v_horas > 0 AND jsonb_typeof(auth.jwt()->'amr') = 'array' THEN
      SELECT min((e->>'timestamp')::numeric) INTO v_inicio
        FROM jsonb_array_elements(auth.jwt()->'amr') e
        WHERE (e->>'timestamp') ~ '^[0-9]+(\.[0-9]+)?$';
      IF v_inicio IS NOT NULL
         AND to_timestamp(v_inicio) < now() - make_interval(secs => (v_horas * 3600)::double precision) THEN
        RETURN jsonb_build_object('vigente', false, 'motivo', 'sesion_caducada');
      END IF;
    END IF;
  END IF;

  SELECT value INTO v_sesiones_activo FROM public.app_settings WHERE key = 'control_sesiones_activo';
  IF COALESCE(v_sesiones_activo, 'true') <> 'true' THEN
    RETURN jsonb_build_object('vigente', true);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sesiones_activas WHERE user_id = v_uid
  ) INTO v_tiene_sesiones;

  IF NOT v_tiene_sesiones THEN
    RETURN jsonb_build_object('vigente', true);
  END IF;

  SELECT ultima_actividad INTO v_ultima FROM public.sesiones_activas
    WHERE user_id = v_uid AND sesion_id = _sesion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('vigente', false);
  END IF;

  IF v_ultima < now() - interval '5 minutes' THEN
    UPDATE public.sesiones_activas SET ultima_actividad = now()
      WHERE user_id = v_uid AND sesion_id = _sesion_id;
  END IF;

  RETURN jsonb_build_object('vigente', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.verificar_sesion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_sesion(text) TO authenticated, service_role;

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

    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle)
    VALUES (v_actor, v_tipo, 'ok', TG_TABLE_NAME, v_afectado,
      jsonb_build_object(
        'origen', CASE WHEN v_actor IS NULL THEN 'sistema' ELSE 'usuario' END,
        'operacion', TG_OP,
        'campos', to_jsonb(v_campos),
        'seguridad', v_seguridad
      ) || CASE WHEN TG_TABLE_NAME = 'user_dashboard_access'
             THEN jsonb_build_object('dashboard_key', v_fila->>'dashboard_key') ELSE '{}'::jsonb END);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auditar_cambio_usuario() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auditar_usuario_profiles ON public.profiles;
CREATE TRIGGER auditar_usuario_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_usuario();
DROP TRIGGER IF EXISTS auditar_usuario_user_roles ON public.user_roles;
CREATE TRIGGER auditar_usuario_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_usuario();
DROP TRIGGER IF EXISTS auditar_usuario_dashboards ON public.user_dashboard_access;
CREATE TRIGGER auditar_usuario_dashboards AFTER INSERT OR UPDATE OR DELETE ON public.user_dashboard_access
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_usuario();