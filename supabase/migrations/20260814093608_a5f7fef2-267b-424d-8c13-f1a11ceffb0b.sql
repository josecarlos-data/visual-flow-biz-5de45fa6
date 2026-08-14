DROP FUNCTION IF EXISTS public._diag_as_user(uuid,text);
DROP FUNCTION IF EXISTS public._diag_explain(uuid,text);

CREATE TABLE IF NOT EXISTS public._diag_result (k text, v jsonb, at timestamptz default now());
REVOKE ALL ON TABLE public._diag_result FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  u record;
  n bigint;
  j jsonb;
  users jsonb := '[{"tag":"comercial","id":"6b97411d-a43b-45d2-ac7b-62a495d7ec12"},{"tag":"jefe","id":"ca79a417-0f3a-42c2-851a-a67327f77bb5"},{"tag":"admin","id":"28f5caa7-bae6-4137-872e-a044a06848b0"}]'::jsonb;
  e jsonb;
BEGIN
  FOR e IN SELECT * FROM jsonb_array_elements(users) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', e->>'id','role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.clientes;
    RESET ROLE;
    INSERT INTO public._diag_result VALUES ('antes.clientes.'||(e->>'tag'), to_jsonb(n));

    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.visitas;
    RESET ROLE;
    INSERT INTO public._diag_result VALUES ('antes.visitas.'||(e->>'tag'), to_jsonb(n));

    -- comparacion de conjuntos: subconsulta actual de la politica de visitas vs clientes_permitidos
    SET LOCAL ROLE authenticated;
    SELECT jsonb_build_object(
      'solo_en_politica', (SELECT count(*) FROM (
          SELECT c.cod_cliente FROM public.clientes c
          WHERE (public.has_role((e->>'id')::uuid,'jefe_de_zona') AND c.delegacion = public.get_user_delegacion((e->>'id')::uuid))
             OR (public.has_role((e->>'id')::uuid,'comercial') AND c.vendedor = public.get_user_employee_code((e->>'id')::uuid))
          EXCEPT SELECT cod_cliente FROM public.clientes_permitidos((e->>'id')::uuid)) x),
      'solo_en_permitidos', (SELECT count(*) FROM (
          SELECT cod_cliente FROM public.clientes_permitidos((e->>'id')::uuid)
          EXCEPT
          SELECT c.cod_cliente FROM public.clientes c
          WHERE (public.has_role((e->>'id')::uuid,'jefe_de_zona') AND c.delegacion = public.get_user_delegacion((e->>'id')::uuid))
             OR (public.has_role((e->>'id')::uuid,'comercial') AND c.vendedor = public.get_user_employee_code((e->>'id')::uuid))) y)
    ) INTO j;
    RESET ROLE;
    INSERT INTO public._diag_result VALUES ('conjuntos.'||(e->>'tag'), j);
  END LOOP;

  -- EXPLAIN de panel_ventas_kpis para admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub','28f5caa7-bae6-4137-872e-a044a06848b0','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.panel_ventas_kpis()' INTO j;
  RESET ROLE;
  INSERT INTO public._diag_result VALUES ('antes.explain.kpis.admin', j);
END
$do$;