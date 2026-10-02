CREATE TABLE public.intentos_acceso (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fallos int NOT NULL DEFAULT 0,
  ciclos int NOT NULL DEFAULT 0,
  ultimo_fallo_en timestamptz,
  ultima_suspension_en timestamptz
);
REVOKE ALL ON public.intentos_acceso FROM anon, authenticated;
GRANT SELECT ON public.intentos_acceso TO authenticated;
GRANT ALL ON public.intentos_acceso TO service_role;
ALTER TABLE public.intentos_acceso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen intentos_acceso" ON public.intentos_acceso
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.registrar_fallo_acceso(_user_id uuid, _origen text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.intentos_acceso%ROWTYPE;
  v_estado text;
  v_hasta timestamptz;
  v_email text;
  v_dur interval;
  v_fin timestamptz;
  v_susp boolean := false;
BEGIN
  INSERT INTO public.intentos_acceso (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO r FROM public.intentos_acceso WHERE user_id = _user_id FOR UPDATE;

  IF r.ultimo_fallo_en IS NOT NULL AND r.ultimo_fallo_en < now() - interval '15 minutes' THEN
    r.fallos := 0;
  END IF;
  IF r.ultima_suspension_en IS NOT NULL AND r.ultima_suspension_en < now() - interval '24 hours' THEN
    r.ciclos := 0;
  END IF;

  r.fallos := r.fallos + 1;
  r.ultimo_fallo_en := now();

  IF r.fallos >= 5 THEN
    r.ciclos := r.ciclos + 1;
    v_dur := CASE WHEN r.ciclos = 1 THEN interval '15 minutes'
                  WHEN r.ciclos = 2 THEN interval '30 minutes'
                  ELSE interval '60 minutes' END;
    v_fin := now() + v_dur;

    SELECT estado, bloqueado_hasta, email INTO v_estado, v_hasta, v_email
    FROM public.profiles WHERE user_id = _user_id FOR UPDATE;

    IF v_estado = 'activo' OR (v_estado = 'suspendido_temporal' AND (v_hasta IS NULL OR v_hasta <= now())) THEN
      UPDATE public.profiles SET
        estado = 'suspendido_temporal',
        bloqueado_hasta = v_fin,
        estado_motivo = 'Intentos fallidos (ciclo ' || r.ciclos || ')',
        estado_cambiado_en = now(),
        estado_cambiado_por = NULL
      WHERE user_id = _user_id;
      v_susp := true;
    END IF;

    IF r.ciclos >= 2 THEN
      UPDATE public.profiles SET marcada_sospechosa = true WHERE user_id = _user_id;
    END IF;

    r.fallos := 0;
    r.ultima_suspension_en := now();

    INSERT INTO public.auditoria_eventos (user_id, email, tipo, resultado, entidad, entidad_id, detalle)
    VALUES (_user_id, v_email, 'suspension_automatica', CASE WHEN v_susp THEN 'ok' ELSE 'denegado' END, 'profiles', _user_id::text,
      jsonb_build_object('origen', _origen, 'ciclo', r.ciclos, 'hasta', CASE WHEN v_susp THEN v_fin END,
                         'estado_previo', v_estado, 'aplicada', v_susp));
  END IF;

  UPDATE public.intentos_acceso SET
    fallos = r.fallos, ciclos = r.ciclos,
    ultimo_fallo_en = r.ultimo_fallo_en, ultima_suspension_en = r.ultima_suspension_en
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('suspendido', v_susp, 'hasta', CASE WHEN v_susp THEN v_fin END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_exito_acceso(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n int;
BEGIN
  UPDATE public.intentos_acceso SET fallos = 0 WHERE user_id = _user_id;

  UPDATE public.profiles SET
    estado = 'activo',
    bloqueado_hasta = NULL,
    estado_cambiado_en = now(),
    estado_cambiado_por = NULL
  WHERE user_id = _user_id
    AND estado = 'suspendido_temporal'
    AND bloqueado_hasta IS NOT NULL
    AND bloqueado_hasta <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 THEN
    INSERT INTO public.auditoria_eventos (user_id, email, tipo, resultado, entidad, entidad_id, detalle)
    VALUES (_user_id, (SELECT email FROM public.profiles WHERE user_id = _user_id), 'fin_suspension', 'ok', 'profiles', _user_id::text,
      jsonb_build_object('origen', 'login'));
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registrar_fallo_acceso(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_exito_acceso(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_fallo_acceso(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_exito_acceso(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_cambiar_estado(_user_id uuid, _estado text, _motivo text, _hasta timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_anterior text;
  v_email text;
BEGIN
  IF NOT public.is_admin(v_admin) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de un usuario';
  END IF;
  IF _estado NOT IN ('activo','suspendido_temporal','bloqueado_intentos','bloqueado_admin','baja') THEN
    RAISE EXCEPTION 'Estado no válido';
  END IF;
  IF _user_id = v_admin AND _estado <> 'activo' THEN
    RAISE EXCEPTION 'Un administrador no puede bloquearse a sí mismo';
  END IF;
  IF _estado <> 'activo' AND coalesce(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  IF _estado = 'suspendido_temporal' AND (_hasta IS NULL OR _hasta <= now()) THEN
    RAISE EXCEPTION 'La suspensión temporal necesita una fecha de fin futura';
  END IF;

  SELECT estado, email INTO v_anterior, v_email FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF _estado <> 'activo' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.role = 'admin' AND r.user_id <> _user_id AND public.is_admin(r.user_id)
     ) THEN
    RAISE EXCEPTION 'No se puede dejar la aplicación sin ningún administrador activo';
  END IF;

  UPDATE public.profiles SET
    estado = _estado,
    estado_motivo = CASE WHEN _estado = 'activo' THEN nullif(btrim(coalesce(_motivo, '')), '') ELSE btrim(_motivo) END,
    estado_cambiado_en = now(),
    estado_cambiado_por = v_admin,
    bloqueado_hasta = CASE WHEN _estado = 'suspendido_temporal' THEN _hasta ELSE NULL END,
    marcada_sospechosa = CASE WHEN _estado = 'activo' THEN false ELSE marcada_sospechosa END
  WHERE user_id = _user_id;

  INSERT INTO public.auditoria_eventos (user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_admin, (SELECT email FROM public.profiles WHERE user_id = v_admin), 'cambio_estado_usuario', 'ok', 'profiles', _user_id::text,
    jsonb_build_object('usuario', v_email, 'estado_anterior', v_anterior, 'estado_nuevo', _estado, 'motivo', _motivo, 'hasta', _hasta));

  IF _estado <> 'activo' THEN
    DELETE FROM public.sesiones_activas WHERE user_id = _user_id;
  END IF;

  IF _estado = 'activo' THEN
    DELETE FROM public.intentos_acceso WHERE user_id = _user_id;
  END IF;
END;
$function$;

INSERT INTO public.app_settings (key, value, description)
VALUES ('acceso_permite_correo', 'true', 'Permite iniciar sesión con el correo además del nombre de usuario')
ON CONFLICT (key) DO NOTHING;