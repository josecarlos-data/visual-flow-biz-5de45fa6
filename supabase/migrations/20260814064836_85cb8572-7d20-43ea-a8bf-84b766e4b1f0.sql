CREATE OR REPLACE FUNCTION public.medir_update_bloque(_id uuid, _uid uuid)
RETURNS TABLE(escenario text, linea text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  sql text := format('EXPLAIN (ANALYZE, BUFFERS) UPDATE public.visita_bloques SET campos = campos, campos_meta = campos_meta WHERE id = %L', _id);
BEGIN
  -- Escenario 1: propietario, trigger activo
  FOR r IN EXECUTE sql LOOP
    escenario := '1_propietario_trigger_on'; linea := r."QUERY PLAN"; RETURN NEXT;
  END LOOP;

  -- Escenario 2: rol authenticated + RLS, trigger activo
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOR r IN EXECUTE sql LOOP
    escenario := '2_authenticated_rls_trigger_on'; linea := r."QUERY PLAN"; RETURN NEXT;
  END LOOP;
  RESET ROLE;

  -- Escenario 3: rol authenticated + RLS, trigger de promocion desactivado
  ALTER TABLE public.visita_bloques DISABLE TRIGGER promover_perfil_desde_bloque;
  SET LOCAL ROLE authenticated;
  FOR r IN EXECUTE sql LOOP
    escenario := '3_authenticated_rls_trigger_off'; linea := r."QUERY PLAN"; RETURN NEXT;
  END LOOP;
  RESET ROLE;
  ALTER TABLE public.visita_bloques ENABLE TRIGGER promover_perfil_desde_bloque;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.medir_update_bloque(uuid, uuid) FROM PUBLIC, anon, authenticated;