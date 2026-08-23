REVOKE ALL ON public.documentos_resumen FROM authenticated;
REVOKE ALL ON public.documentos_resumen FROM anon;
GRANT ALL ON public.documentos_resumen TO service_role;