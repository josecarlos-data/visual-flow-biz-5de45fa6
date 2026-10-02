ALTER TABLE public.profiles
  ADD COLUMN estado text NOT NULL DEFAULT 'activo',
  ADD COLUMN estado_motivo text NULL,
  ADD COLUMN estado_cambiado_en timestamptz NULL,
  ADD COLUMN estado_cambiado_por uuid NULL,
  ADD COLUMN bloqueado_hasta timestamptz NULL,
  ADD COLUMN marcada_sospechosa boolean NOT NULL DEFAULT false,
  ADD COLUMN username text NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_estado_check CHECK (estado IN ('activo','suspendido_temporal','bloqueado_intentos','bloqueado_admin','baja')),
  ADD CONSTRAINT profiles_username_formato CHECK (username IS NULL OR username ~ '^[a-z0-9._-]{3,30}$');

CREATE UNIQUE INDEX profiles_username_lower_uniq ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN RAISE EXCEPTION 'Cannot modify is_approved'; END IF;
  IF NEW.ver_margen IS DISTINCT FROM OLD.ver_margen THEN RAISE EXCEPTION 'Cannot modify ver_margen'; END IF;
  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN RAISE EXCEPTION 'Cannot modify employee_code'; END IF;
  IF NEW.delegacion IS DISTINCT FROM OLD.delegacion THEN RAISE EXCEPTION 'Cannot modify delegacion'; END IF;
  IF NEW.zone_id IS DISTINCT FROM OLD.zone_id THEN RAISE EXCEPTION 'Cannot modify zone_id'; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Cannot modify user_id'; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'Cannot modify email'; END IF;
  IF NEW.sesiones_max IS DISTINCT FROM OLD.sesiones_max THEN RAISE EXCEPTION 'Cannot modify sesiones_max'; END IF;
  IF NEW.dispositivos_max IS DISTINCT FROM OLD.dispositivos_max THEN RAISE EXCEPTION 'Cannot modify dispositivos_max'; END IF;
  IF NEW.debe_cambiar_password IS DISTINCT FROM OLD.debe_cambiar_password THEN RAISE EXCEPTION 'Cannot modify debe_cambiar_password'; END IF;
  IF NEW.password_cambiada_en IS DISTINCT FROM OLD.password_cambiada_en THEN RAISE EXCEPTION 'Cannot modify password_cambiada_en'; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN RAISE EXCEPTION 'Cannot modify estado'; END IF;
  IF NEW.estado_motivo IS DISTINCT FROM OLD.estado_motivo THEN RAISE EXCEPTION 'Cannot modify estado_motivo'; END IF;
  IF NEW.estado_cambiado_en IS DISTINCT FROM OLD.estado_cambiado_en THEN RAISE EXCEPTION 'Cannot modify estado_cambiado_en'; END IF;
  IF NEW.estado_cambiado_por IS DISTINCT FROM OLD.estado_cambiado_por THEN RAISE EXCEPTION 'Cannot modify estado_cambiado_por'; END IF;
  IF NEW.bloqueado_hasta IS DISTINCT FROM OLD.bloqueado_hasta THEN RAISE EXCEPTION 'Cannot modify bloqueado_hasta'; END IF;
  IF NEW.marcada_sospechosa IS DISTINCT FROM OLD.marcada_sospechosa THEN RAISE EXCEPTION 'Cannot modify marcada_sospechosa'; END IF;
  IF NEW.username IS DISTINCT FROM OLD.username THEN RAISE EXCEPTION 'Cannot modify username'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND is_approved = true
      AND (estado = 'activo' OR (estado = 'suspendido_temporal' AND bloqueado_hasta <= now()))
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND NOT (estado = 'activo' OR (estado = 'suspendido_temporal' AND bloqueado_hasta <= now()))
  )
$function$;

DROP FUNCTION public.verificar_sesion(text);
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
GRANT EXECUTE ON FUNCTION public.verificar_sesion(text) TO authenticated;

-- Comprueba que tras el cambio queda al menos otro admin operativo
CREATE OR REPLACE FUNCTION public.admin_cambiar_estado(_user_id uuid, _estado text, _motivo text, _hasta timestamptz DEFAULT NULL)
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dar_baja(_user_id uuid, _motivo text)
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
    RAISE EXCEPTION 'Solo un administrador puede dar de baja a un usuario';
  END IF;
  IF _user_id = v_admin THEN
    RAISE EXCEPTION 'Un administrador no puede darse de baja a sí mismo';
  END IF;
  IF coalesce(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  SELECT estado, email INTO v_anterior, v_email FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.role = 'admin' AND r.user_id <> _user_id AND public.is_admin(r.user_id)
     ) THEN
    RAISE EXCEPTION 'No se puede dejar la aplicación sin ningún administrador activo';
  END IF;

  UPDATE public.profiles SET
    estado = 'baja',
    estado_motivo = btrim(_motivo),
    estado_cambiado_en = now(),
    estado_cambiado_por = v_admin,
    bloqueado_hasta = NULL
  WHERE user_id = _user_id;

  DELETE FROM public.sesiones_activas WHERE user_id = _user_id;
  DELETE FROM public.dispositivos WHERE user_id = _user_id;
  UPDATE public.codigos_alta SET expira_en = now() WHERE user_id = _user_id AND expira_en > now();

  INSERT INTO public.auditoria_eventos (user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_admin, (SELECT email FROM public.profiles WHERE user_id = v_admin), 'baja_usuario', 'ok', 'profiles', _user_id::text,
    jsonb_build_object('usuario', v_email, 'estado_anterior', v_anterior, 'motivo', _motivo));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_asignar_username(_user_id uuid, _username text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_nuevo text := nullif(lower(btrim(coalesce(_username, ''))), '');
  v_anterior text;
  v_email text;
BEGIN
  IF NOT public.is_admin(v_admin) THEN
    RAISE EXCEPTION 'Solo un administrador puede asignar nombres de usuario';
  END IF;
  SELECT username, email INTO v_anterior, v_email FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;
  IF v_nuevo IS NOT NULL AND v_nuevo !~ '^[a-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'El nombre de usuario debe tener entre 3 y 30 caracteres: minúsculas, números, punto, guion o guion bajo';
  END IF;
  IF v_nuevo IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_nuevo AND user_id <> _user_id) THEN
    RAISE EXCEPTION 'Ese nombre de usuario ya está en uso';
  END IF;

  UPDATE public.profiles SET username = v_nuevo WHERE user_id = _user_id;

  INSERT INTO public.auditoria_eventos (user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_admin, (SELECT email FROM public.profiles WHERE user_id = v_admin), 'cambio_username', 'ok', 'profiles', _user_id::text,
    jsonb_build_object('usuario', v_email, 'anterior', v_anterior, 'nuevo', v_nuevo));
  RETURN v_nuevo;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_cambiar_estado(uuid, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_dar_baja(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_asignar_username(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_estado(uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dar_baja(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_asignar_username(uuid, text) TO authenticated;