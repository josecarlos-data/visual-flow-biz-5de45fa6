INSERT INTO public.visita_lecturas (visita_id, user_id, leido_en)
SELECT v.id, v.user_id, now() FROM public.visitas v
WHERE v.origen = 'app' AND v.user_id IS NOT NULL
ON CONFLICT (visita_id, user_id) DO UPDATE SET leido_en = EXCLUDED.leido_en;
GRANT EXECUTE ON FUNCTION public.contadores_mensajes() TO authenticated;