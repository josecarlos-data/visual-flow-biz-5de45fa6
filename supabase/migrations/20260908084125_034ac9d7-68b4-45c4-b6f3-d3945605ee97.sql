CREATE OR REPLACE FUNCTION public.cerrar_sesion(_sesion_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR _sesion_id IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.sesiones_activas
    WHERE user_id = auth.uid() AND sesion_id = _sesion_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cerrar_sesion(text) TO authenticated;