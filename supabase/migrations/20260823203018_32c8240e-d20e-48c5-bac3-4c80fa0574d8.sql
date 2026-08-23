CREATE OR REPLACE FUNCTION public.refrescar_documentos_resumen()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.documentos_resumen;
END;
$function$;