CREATE OR REPLACE FUNCTION public.refrescar_documentos_resumen()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  SET LOCAL statement_timeout = '10min';
  REFRESH MATERIALIZED VIEW public.documentos_resumen;
END;
$function$;