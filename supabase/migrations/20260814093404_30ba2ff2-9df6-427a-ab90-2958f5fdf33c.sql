CREATE OR REPLACE FUNCTION public._diag_as_user(_uid uuid, _sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_uid::text,'role','authenticated')::text, true);
  EXECUTE 'select coalesce(jsonb_agg(t),''[]''::jsonb) from (' || _sql || ') t' INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public._diag_explain(_uid uuid, _sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_uid::text,'role','authenticated')::text, true);
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || _sql INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public._diag_as_user(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diag_explain(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._diag_as_user(uuid,text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public._diag_explain(uuid,text) TO supabase_read_only_user;