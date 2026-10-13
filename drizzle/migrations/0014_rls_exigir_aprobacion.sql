-- Exigir is_approved (estado + segundo factor) en políticas que daban acceso por rol o propiedad.
DROP POLICY IF EXISTS "Update own planificadas" ON public.visitas_planificadas;
CREATE POLICY "Update own planificadas" ON public.visitas_planificadas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((user_id = auth.uid()) OR is_admin(auth.uid()))))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (((user_id = auth.uid()) OR is_admin(auth.uid()))));

DROP POLICY IF EXISTS "Delete own planificadas" ON public.visitas_planificadas;
CREATE POLICY "Delete own planificadas" ON public.visitas_planificadas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((user_id = auth.uid()) OR is_admin(auth.uid()))));

DROP POLICY IF EXISTS "Directors can view all profiles" ON public.profiles;
CREATE POLICY "Directors can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (has_role(auth.uid(), 'director_comercial'::app_role)));

DROP POLICY IF EXISTS "Jefes can view zone profiles" ON public.profiles;
CREATE POLICY "Jefes can view zone profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND ((has_role(auth.uid(), 'jefe_de_zona'::app_role) AND (zone_id = get_user_zone_id(auth.uid())))));

DROP POLICY IF EXISTS situaciones_insert ON public.situaciones_cliente;
CREATE POLICY situaciones_insert ON public.situaciones_cliente AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND ((is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role))));

DROP POLICY IF EXISTS situaciones_update ON public.situaciones_cliente;
CREATE POLICY situaciones_update ON public.situaciones_cliente AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND ((is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role))))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND ((is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role))));

DROP POLICY IF EXISTS situaciones_delete ON public.situaciones_cliente;
CREATE POLICY situaciones_delete ON public.situaciones_cliente AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND ((is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role))));

DROP POLICY IF EXISTS "Direccion gestiona objetivos" ON public.objetivos;
CREATE POLICY "Direccion gestiona objetivos" ON public.objetivos AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND ((is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role))))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND ((is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role))));

DROP POLICY IF EXISTS "ver bloques de visitas visibles" ON public.visita_bloques;
CREATE POLICY "ver bloques de visitas visibles" ON public.visita_bloques AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (puede_ver_bloque(visita_id)));

DROP POLICY IF EXISTS "crear bloques en visitas propias" ON public.visita_bloques;
CREATE POLICY "crear bloques en visitas propias" ON public.visita_bloques AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (puede_editar_bloque(visita_id)));

DROP POLICY IF EXISTS "editar bloques propios o revisables" ON public.visita_bloques;
CREATE POLICY "editar bloques propios o revisables" ON public.visita_bloques AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (puede_editar_bloque(visita_id)))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (puede_editar_bloque(visita_id)));

DROP POLICY IF EXISTS "borrar bloques propios o admin" ON public.visita_bloques;
CREATE POLICY "borrar bloques propios o admin" ON public.visita_bloques AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (puede_editar_bloque(visita_id)));

DROP POLICY IF EXISTS "Users update own visitas" ON public.visitas;
CREATE POLICY "Users update own visitas" ON public.visitas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((user_id = auth.uid()) OR ( SELECT is_admin(auth.uid()) AS is_admin) OR ( SELECT has_role(auth.uid(), 'director_comercial'::app_role) AS has_role) OR (( SELECT has_role(auth.uid(), 'jefe_de_zona'::app_role) AS has_role) AND ((cod_cliente IS NULL) OR (cod_cliente IN ( SELECT c.cod_cliente
   FROM clientes c
  WHERE (c.delegacion = ( SELECT get_user_delegacion(auth.uid()) AS get_user_delegacion)))))))))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (((user_id = auth.uid()) OR ( SELECT is_admin(auth.uid()) AS is_admin) OR ( SELECT has_role(auth.uid(), 'director_comercial'::app_role) AS has_role) OR (( SELECT has_role(auth.uid(), 'jefe_de_zona'::app_role) AS has_role) AND ((cod_cliente IS NULL) OR (cod_cliente IN ( SELECT c.cod_cliente
   FROM clientes c
  WHERE (c.delegacion = ( SELECT get_user_delegacion(auth.uid()) AS get_user_delegacion)))))))));

DROP POLICY IF EXISTS "Users delete own visitas" ON public.visitas;
CREATE POLICY "Users delete own visitas" ON public.visitas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((user_id = auth.uid()) OR ( SELECT is_admin(auth.uid()) AS is_admin))));

DROP POLICY IF EXISTS "Adjuntos visita: actualizar propios" ON storage.objects;
CREATE POLICY "Adjuntos visita: actualizar propios" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((bucket_id = 'visitas-adjuntos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (((bucket_id = 'visitas-adjuntos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Adjuntos visita: borrar propios o admin" ON storage.objects;
CREATE POLICY "Adjuntos visita: borrar propios o admin" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((bucket_id = 'visitas-adjuntos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin(auth.uid())))));

DROP POLICY IF EXISTS "Adjuntos visita: ver propios o revisores" ON storage.objects;
CREATE POLICY "Adjuntos visita: ver propios o revisores" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (((bucket_id = 'visitas-adjuntos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin(auth.uid()) OR has_role(auth.uid(), 'director_comercial'::app_role) OR puede_revisar_visitas(auth.uid())))));

DROP POLICY IF EXISTS perfil_atributos_select_auth ON public.perfil_atributos;
CREATE POLICY perfil_atributos_select_auth ON public.perfil_atributos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())));

CREATE OR REPLACE FUNCTION public.objetivos_propuesta(_anio integer, _pct numeric DEFAULT 5)
 RETURNS TABLE(tipo text, vendedor text, cod_vendedor text, ruta text, base_anio_anterior numeric, importe_sugerido numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), 'director_comercial'))) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.vendedor AS vend, MIN(c.cod_vendedor) AS cod,
           NULLIF(c.ruta_especial, '') AS ruta_esp, SUM(v.importe) AS importe
    FROM public.ventas_diarias v
    JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    WHERE EXTRACT(YEAR FROM v.fecha)::int = _anio - 1
      AND c.vendedor IS NOT NULL AND c.vendedor <> ''
    GROUP BY 1,3
  )
  (SELECT 'cartera'::text, b.vend, MIN(b.cod), NULL::text,
          ROUND(SUM(b.importe), 2), ROUND(SUM(b.importe) * (1 + _pct / 100.0), 2)
   FROM base b WHERE b.ruta_esp IS NULL GROUP BY b.vend)
  UNION ALL
  (SELECT 'ruta'::text, b.vend, MIN(b.cod), b.ruta_esp,
          ROUND(SUM(b.importe), 2), ROUND(SUM(b.importe), 2)
   FROM base b WHERE b.ruta_esp IS NOT NULL GROUP BY b.vend, b.ruta_esp)
  ORDER BY 1, 2, 4 NULLS FIRST;
END; $function$;

CREATE OR REPLACE FUNCTION public.refrescar_documentos_resumen()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), 'director_comercial'))) THEN
    RAISE EXCEPTION 'Permiso denegado: solo administradores o directores comerciales pueden refrescar el resumen de documentos';
  END IF;
  SET LOCAL statement_timeout = '10min';
  REFRESH MATERIALIZED VIEW public.documentos_resumen;
END;
$function$;
