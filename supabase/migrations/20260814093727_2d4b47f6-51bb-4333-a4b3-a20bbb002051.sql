-- clientes: misma semantica, comprobaciones de rol envueltas en subconsulta escalar
DROP POLICY "Role-scoped view clientes" ON public.clientes;
CREATE POLICY "Role-scoped view clientes" ON public.clientes FOR SELECT TO authenticated
USING (
  (SELECT public.is_approved(auth.uid())) AND (
    (SELECT public.is_admin(auth.uid()))
    OR (SELECT public.has_role(auth.uid(),'director_comercial'::app_role))
    OR ((SELECT public.has_role(auth.uid(),'jefe_de_zona'::app_role)) AND delegacion = (SELECT public.get_user_delegacion(auth.uid())))
    OR ((SELECT public.has_role(auth.uid(),'comercial'::app_role)) AND vendedor = (SELECT public.get_user_employee_code(auth.uid())))
  )
);

DROP POLICY "Admins can update clientes" ON public.clientes;
CREATE POLICY "Admins can update clientes" ON public.clientes FOR UPDATE TO authenticated
USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY "Admins can delete clientes" ON public.clientes;
CREATE POLICY "Admins can delete clientes" ON public.clientes FOR DELETE TO authenticated
USING ((SELECT public.is_admin(auth.uid())));

DROP POLICY "Admins can insert clientes" ON public.clientes;
CREATE POLICY "Admins can insert clientes" ON public.clientes FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_admin(auth.uid())));

-- visitas: se mantiene el IN (SELECT ... FROM clientes); solo se envuelven las llamadas de rol
DROP POLICY "Role-scoped view visitas" ON public.visitas;
CREATE POLICY "Role-scoped view visitas" ON public.visitas FOR SELECT TO authenticated
USING (
  (SELECT public.is_approved(auth.uid())) AND (
    (SELECT public.is_admin(auth.uid()))
    OR (SELECT public.has_role(auth.uid(),'director_comercial'::app_role))
    OR ((SELECT public.has_role(auth.uid(),'jefe_de_zona'::app_role)) AND cod_cliente IN (
          SELECT c.cod_cliente FROM public.clientes c WHERE c.delegacion = (SELECT public.get_user_delegacion(auth.uid()))))
    OR (user_id = auth.uid())
    OR ((SELECT public.has_role(auth.uid(),'comercial'::app_role)) AND cod_cliente IN (
          SELECT c.cod_cliente FROM public.clientes c WHERE c.vendedor = (SELECT public.get_user_employee_code(auth.uid()))))
  )
);

DROP POLICY "Users update own visitas" ON public.visitas;
CREATE POLICY "Users update own visitas" ON public.visitas FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR (SELECT public.is_admin(auth.uid()))
  OR (SELECT public.has_role(auth.uid(),'director_comercial'::app_role))
  OR ((SELECT public.has_role(auth.uid(),'jefe_de_zona'::app_role)) AND (cod_cliente IS NULL OR cod_cliente IN (
        SELECT c.cod_cliente FROM public.clientes c WHERE c.delegacion = (SELECT public.get_user_delegacion(auth.uid())))))
)
WITH CHECK (
  user_id = auth.uid()
  OR (SELECT public.is_admin(auth.uid()))
  OR (SELECT public.has_role(auth.uid(),'director_comercial'::app_role))
  OR ((SELECT public.has_role(auth.uid(),'jefe_de_zona'::app_role)) AND (cod_cliente IS NULL OR cod_cliente IN (
        SELECT c.cod_cliente FROM public.clientes c WHERE c.delegacion = (SELECT public.get_user_delegacion(auth.uid())))))
);

DROP POLICY "Users delete own visitas" ON public.visitas;
CREATE POLICY "Users delete own visitas" ON public.visitas FOR DELETE TO authenticated
USING (user_id = auth.uid() OR (SELECT public.is_admin(auth.uid())));

DROP POLICY "Users insert own visitas" ON public.visitas;
CREATE POLICY "Users insert own visitas" ON public.visitas FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_approved(auth.uid())) AND user_id = auth.uid());

-- mediciones posteriores
DO $do$
DECLARE n bigint; j jsonb; e jsonb;
  users jsonb := '[{"tag":"comercial","id":"6b97411d-a43b-45d2-ac7b-62a495d7ec12"},{"tag":"jefe","id":"ca79a417-0f3a-42c2-851a-a67327f77bb5"},{"tag":"admin","id":"28f5caa7-bae6-4137-872e-a044a06848b0"}]'::jsonb;
BEGIN
  FOR e IN SELECT * FROM jsonb_array_elements(users) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', e->>'id','role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.clientes;
    RESET ROLE;
    INSERT INTO public._diag_result VALUES ('despues.clientes.'||(e->>'tag'), to_jsonb(n));
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.visitas;
    RESET ROLE;
    INSERT INTO public._diag_result VALUES ('despues.visitas.'||(e->>'tag'), to_jsonb(n));
  END LOOP;

  PERFORM set_config('request.jwt.claims', json_build_object('sub','28f5caa7-bae6-4137-872e-a044a06848b0','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.panel_ventas_kpis()' INTO j;
  RESET ROLE;
  INSERT INTO public._diag_result VALUES ('despues.explain.kpis.admin', j);
END
$do$;