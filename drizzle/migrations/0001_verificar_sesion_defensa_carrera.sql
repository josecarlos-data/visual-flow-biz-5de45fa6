DROP FUNCTION IF EXISTS public.verificar_sesion(_sesion_id text);

CREATE OR REPLACE FUNCTION public.verificar_sesion(_sesion_id text)
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

REVOKE EXECUTE ON FUNCTION public.verificar_sesion(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_sesion(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verificar_sesion(text) TO authenticated;