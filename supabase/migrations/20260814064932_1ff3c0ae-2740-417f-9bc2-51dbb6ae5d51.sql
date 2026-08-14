DROP FUNCTION IF EXISTS public.medir_update_bloque(uuid, uuid);

CREATE OR REPLACE FUNCTION public.diag_trigger_promocion(_enable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _enable THEN
    ALTER TABLE public.visita_bloques ENABLE TRIGGER promover_perfil_desde_bloque;
  ELSE
    ALTER TABLE public.visita_bloques DISABLE TRIGGER promover_perfil_desde_bloque;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.diag_trigger_promocion(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.diag_trigger_promocion(boolean) TO sandbox_exec;
GRANT authenticated TO sandbox_exec;