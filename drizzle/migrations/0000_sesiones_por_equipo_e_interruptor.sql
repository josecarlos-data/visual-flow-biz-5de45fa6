-- Interruptor global del control de sesiones simultáneas
INSERT INTO public.app_settings (key, value, description) VALUES
  ('control_sesiones_activo', 'true', 'Activa la limitación de sesiones simultáneas: true | false')
ON CONFLICT (key) DO NOTHING;

-- Un equipo ocupa UNA plaza de sesión, tenga las pestañas que tenga
DROP FUNCTION IF EXISTS public.registrar_sesion(text, text, text, text);

CREATE FUNCTION public.registrar_sesion(
  _dispositivo_id text,
  _sesion_id text,
  _user_agent text DEFAULT NULL,
  _codigo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_modo text;
  v_activo text;
  v_alta_modo text;
  v_sesiones_activo text;
  v_disp public.dispositivos%ROWTYPE;
  v_disp_max int;
  v_ses_max int;
  v_num_disp int;
  v_motivo text := NULL;
  v_denegar boolean := false;
  v_permitido boolean := true;
  v_codigo public.codigos_alta%ROWTYPE;
  v_alta_ok boolean := false;
BEGIN
  IF v_uid IS NULL OR _dispositivo_id IS NULL OR _sesion_id IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', NULL, 'modo', 'observacion');
  END IF;

  SELECT value INTO v_modo FROM public.app_settings WHERE key = 'control_acceso_modo';
  SELECT value INTO v_activo FROM public.app_settings WHERE key = 'control_dispositivos_activo';
  SELECT value INTO v_alta_modo FROM public.app_settings WHERE key = 'alta_dispositivo_modo';
  SELECT value INTO v_sesiones_activo FROM public.app_settings WHERE key = 'control_sesiones_activo';
  v_modo := COALESCE(v_modo, 'observacion');
  v_activo := COALESCE(v_activo, 'true');
  v_alta_modo := COALESCE(v_alta_modo, 'auto');
  v_sesiones_activo := COALESCE(v_sesiones_activo, 'true');

  SELECT COALESCE(dispositivos_max, 2), COALESCE(sesiones_max, 1)
    INTO v_disp_max, v_ses_max
    FROM public.profiles WHERE user_id = v_uid;
  v_disp_max := COALESCE(v_disp_max, 2);
  v_ses_max := COALESCE(v_ses_max, 1);

  SELECT * INTO v_disp FROM public.dispositivos
    WHERE user_id = v_uid AND dispositivo_id = _dispositivo_id;

  IF FOUND THEN
    UPDATE public.dispositivos
      SET ultima_vez = now(), user_agent = COALESCE(_user_agent, user_agent)
      WHERE id = v_disp.id;
    IF v_disp.bloqueado THEN
      v_motivo := 'dispositivo_bloqueado';
      v_denegar := true;
    END IF;
  ELSE
    SELECT count(*) INTO v_num_disp FROM public.dispositivos WHERE user_id = v_uid;

    IF v_num_disp >= v_disp_max THEN
      v_motivo := 'dispositivo_no_autorizado';
      v_denegar := true;
    ELSIF v_alta_modo = 'codigo' THEN
      IF _codigo IS NULL OR btrim(_codigo) = '' THEN
        v_motivo := 'codigo_requerido';
        v_denegar := true;
      ELSE
        SELECT * INTO v_codigo FROM public.codigos_alta
          WHERE codigo = upper(btrim(_codigo))
            AND user_id = v_uid
            AND expira_en > now();
        IF FOUND THEN
          v_alta_ok := true;
          v_motivo := 'dispositivo_nuevo';
          UPDATE public.codigos_alta
            SET usos = usos + 1, ultimo_uso_en = now(), dispositivo_id = _dispositivo_id
            WHERE id = v_codigo.id;
        ELSE
          v_motivo := 'codigo_invalido';
          v_denegar := true;
        END IF;
      END IF;
    ELSE
      v_alta_ok := true;
      v_motivo := 'dispositivo_nuevo';
    END IF;

    -- En observacion o para admin, el alta se hace igualmente salvo que se supere el maximo
    IF NOT v_alta_ok
       AND v_motivo IN ('codigo_requerido', 'codigo_invalido')
       AND (v_modo <> 'bloqueo' OR v_activo <> 'true' OR public.is_admin(v_uid)) THEN
      v_alta_ok := true;
    END IF;

    IF v_alta_ok THEN
      INSERT INTO public.dispositivos (user_id, dispositivo_id, user_agent)
        VALUES (v_uid, _dispositivo_id, _user_agent)
        ON CONFLICT (user_id, dispositivo_id) DO UPDATE
          SET ultima_vez = now(), user_agent = COALESCE(EXCLUDED.user_agent, public.dispositivos.user_agent);
    END IF;
  END IF;

  v_permitido := true;
  IF v_denegar AND v_modo = 'bloqueo' AND v_activo = 'true' AND NOT public.is_admin(v_uid) THEN
    v_permitido := false;
  END IF;

  IF v_permitido THEN
    IF v_sesiones_activo = 'true' THEN
      DELETE FROM public.sesiones_activas
        WHERE user_id = v_uid AND ultima_actividad < now() - interval '12 hours';

      -- Un equipo ocupa una sola plaza: limpia sesiones antiguas de este equipo
      DELETE FROM public.sesiones_activas
        WHERE user_id = v_uid
          AND dispositivo_id = _dispositivo_id
          AND sesion_id <> _sesion_id;
    END IF;

    INSERT INTO public.sesiones_activas (user_id, sesion_id, dispositivo_id)
      VALUES (v_uid, _sesion_id, _dispositivo_id)
      ON CONFLICT (user_id, sesion_id) DO UPDATE
        SET ultima_actividad = now(), dispositivo_id = EXCLUDED.dispositivo_id;

    IF v_sesiones_activo = 'true' AND v_ses_max > 0 THEN
      DELETE FROM public.sesiones_activas s
        WHERE s.user_id = v_uid
          AND s.sesion_id IN (
            SELECT sesion_id FROM public.sesiones_activas
              WHERE user_id = v_uid
              ORDER BY ultima_actividad DESC, sesion_id DESC
              OFFSET v_ses_max
          );
    END IF;
  END IF;

  RETURN jsonb_build_object('permitido', v_permitido, 'motivo', v_motivo, 'modo', v_modo);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registrar_sesion(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_sesion(text, text, text, text) TO authenticated;

-- Con el control desactivado, toda sesión se considera vigente
DROP FUNCTION IF EXISTS public.verificar_sesion(text);

CREATE FUNCTION public.verificar_sesion(_sesion_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ultima timestamptz;
  v_sesiones_activo text;
BEGIN
  IF v_uid IS NULL OR _sesion_id IS NULL THEN
    RETURN jsonb_build_object('vigente', true);
  END IF;

  SELECT value INTO v_sesiones_activo FROM public.app_settings WHERE key = 'control_sesiones_activo';
  IF COALESCE(v_sesiones_activo, 'true') <> 'true' THEN
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
GRANT EXECUTE ON FUNCTION public.verificar_sesion(text) TO authenticated;