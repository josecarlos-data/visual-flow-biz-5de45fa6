ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exige_2fa boolean NOT NULL DEFAULT false;

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
  IF NEW.exige_2fa IS DISTINCT FROM OLD.exige_2fa THEN RAISE EXCEPTION 'Cannot modify exige_2fa'; END IF;
  RETURN NEW;
END;
$function$;

INSERT INTO public.app_settings (key, value, description)
VALUES ('segundo_factor_modo', 'desactivado', 'Segundo factor TOTP: desactivado | marcados | activo')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.requiere_2fa(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE COALESCE((SELECT value FROM public.app_settings WHERE key = 'segundo_factor_modo'), 'desactivado')
    WHEN 'marcados' THEN COALESCE((SELECT exige_2fa FROM public.profiles WHERE user_id = _user_id), false)
    WHEN 'activo' THEN
      COALESCE((SELECT exige_2fa FROM public.profiles WHERE user_id = _user_id), false)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    ELSE false
  END
$function$;

CREATE OR REPLACE FUNCTION public.sesion_cumple_2fa()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT public.requiere_2fa(auth.uid()) OR COALESCE(auth.jwt()->>'aal', '') = 'aal2'
$function$;

REVOKE EXECUTE ON FUNCTION public.requiere_2fa(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sesion_cumple_2fa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requiere_2fa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sesion_cumple_2fa() TO authenticated, service_role;

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
  AND (_user_id IS DISTINCT FROM auth.uid() OR (SELECT public.sesion_cumple_2fa()))
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
  AND (_user_id IS DISTINCT FROM auth.uid() OR (SELECT public.sesion_cumple_2fa()))
$function$;