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
  RETURN NEW;
END;
$function$;