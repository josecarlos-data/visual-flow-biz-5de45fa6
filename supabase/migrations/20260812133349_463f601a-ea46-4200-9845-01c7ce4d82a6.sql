DROP VIEW IF EXISTS public.v_cliente_perfil_vigente;

ALTER TABLE public.cliente_perfil_datos
  ALTER COLUMN confianza TYPE text,
  ADD COLUMN IF NOT EXISTS cita text;

ALTER TABLE public.cliente_perfil_datos
  ADD CONSTRAINT cliente_perfil_datos_confianza_check
  CHECK (confianza IS NULL OR confianza IN ('alta','media','baja'));

CREATE VIEW public.v_cliente_perfil_vigente
WITH (security_invoker = true) AS
SELECT DISTINCT ON (cod_cliente, atributo_key) *
FROM public.cliente_perfil_datos
WHERE estado <> 'descartado'
ORDER BY cod_cliente, atributo_key, observado_en DESC, created_at DESC;

GRANT SELECT ON public.v_cliente_perfil_vigente TO authenticated;
GRANT SELECT ON public.v_cliente_perfil_vigente TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cliente_perfil_datos'::regclass
      AND tgname = 'update_updated_at_column'
      AND NOT tgisinternal
  ) THEN
    DROP TRIGGER IF EXISTS update_updated_at_column ON public.cliente_perfil_datos;
    CREATE TRIGGER update_updated_at_column
      BEFORE UPDATE ON public.cliente_perfil_datos
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.perfil_atributos'::regclass
      AND tgname = 'update_updated_at_column'
      AND NOT tgisinternal
  ) THEN
    DROP TRIGGER IF EXISTS update_updated_at_column ON public.perfil_atributos;
    CREATE TRIGGER update_updated_at_column
      BEFORE UPDATE ON public.perfil_atributos
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;