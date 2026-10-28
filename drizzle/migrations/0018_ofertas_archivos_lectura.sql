CREATE OR REPLACE FUNCTION public.archivo_oferta_visible(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ofertas o, jsonb_array_elements(o.adjuntos) a
    WHERE a->>'path' = _path AND o.estado = 'publicada'
      AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= CURRENT_DATE)
      AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE));
$$;
REVOKE ALL ON FUNCTION public.archivo_oferta_visible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archivo_oferta_visible(text) TO anon, authenticated, service_role;

CREATE POLICY "Leer archivos de ofertas" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'ofertas-publicas' AND (
    public.archivo_oferta_visible(name)
    OR (auth.uid() IS NOT NULL AND (SELECT public.puede_gestionar_ofertas(auth.uid())))));