CREATE OR REPLACE FUNCTION public.mensajes_visitas(_ids uuid[])
RETURNS TABLE (visita_id uuid, puede_escribir boolean, mensajes jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF coalesce(array_length(_ids, 1), 0) > 50 THEN
    RAISE EXCEPTION 'Demasiadas visitas a la vez (máximo 50)';
  END IF;
  RETURN QUERY
  SELECT v.id, true,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'bloque_id', m.bloque_id, 'autor_id', m.autor_id, 'autor_nombre', m.autor_nombre,
        'texto', m.texto, 'created_at', m.created_at,
        'es_dueno', (m.autor_id IS NOT NULL AND m.autor_id = v.user_id)) ORDER BY m.created_at)
      FROM public.visita_mensajes m WHERE m.visita_id = v.id), '[]'::jsonb)
  FROM public.visitas v
  WHERE v.id = ANY(coalesce(_ids, '{}'::uuid[]))
    AND public.puede_conversar_visita(v.id);
END $$;
REVOKE ALL ON FUNCTION public.mensajes_visitas(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mensajes_visitas(uuid[]) TO authenticated;