CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.avisos_estado (
  categoria text PRIMARY KEY,
  cursor timestamptz NOT NULL DEFAULT now(),
  ultimo_envio timestamptz
);
REVOKE ALL ON public.avisos_estado FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.avisos_estado TO service_role;
ALTER TABLE public.avisos_estado ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value, description) VALUES
  ('avisos_seguridad_activo', 'true', 'Enviar avisos de seguridad por correo'),
  ('avisos_seguridad_email', 'info3@rimosa.com', 'Destinatario de los avisos de seguridad')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.avisos_resumen_panel()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_admin(auth.uid()) THEN jsonb_build_object(
    'ultima_comprobacion', (SELECT cursor FROM public.avisos_estado WHERE categoria = '_latido'),
    'ultimo_aviso', (SELECT jsonb_build_object('en', ocurrido_en, 'resultado', resultado, 'categoria', detalle->>'categoria')
                     FROM public.auditoria_eventos WHERE tipo = 'aviso_seguridad'
                     ORDER BY ocurrido_en DESC LIMIT 1)
  ) END
$$;
REVOKE EXECUTE ON FUNCTION public.avisos_resumen_panel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avisos_resumen_panel() TO authenticated;