REVOKE EXECUTE ON FUNCTION public.refrescar_documentos_resumen() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refrescar_documentos_resumen() FROM anon;

CREATE OR REPLACE FUNCTION public.refrescar_documentos_resumen()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'director_comercial') THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores o directores comerciales pueden refrescar el resumen de documentos';
  END IF;
  SET LOCAL statement_timeout = '10min';
  REFRESH MATERIALIZED VIEW public.documentos_resumen;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refrescar_documentos_resumen() TO authenticated;