DROP POLICY IF EXISTS "Admins manage motivos" ON public.motivos_visita;
DROP POLICY IF EXISTS "Admins manage motivo_campos" ON public.motivo_campos;
DROP POLICY IF EXISTS "Admins manage catalogos" ON public.catalogos_opciones;

CREATE POLICY "Direccion inserta motivos" ON public.motivos_visita FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)));
CREATE POLICY "Direccion actualiza motivos" ON public.motivos_visita FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)));
CREATE POLICY "Admins borran motivos" ON public.motivos_visita FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.is_admin(auth.uid()));

CREATE POLICY "Direccion inserta motivo_campos" ON public.motivo_campos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)));
CREATE POLICY "Direccion actualiza motivo_campos" ON public.motivo_campos FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)));
CREATE POLICY "Admins borran motivo_campos" ON public.motivo_campos FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.is_admin(auth.uid()));

CREATE POLICY "Direccion inserta catalogos" ON public.catalogos_opciones FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)));
CREATE POLICY "Direccion actualiza catalogos" ON public.catalogos_opciones FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role)));
CREATE POLICY "Admins borran catalogos" ON public.catalogos_opciones FOR DELETE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS auditar_motivos_visita ON public.motivos_visita;
CREATE TRIGGER auditar_motivos_visita AFTER INSERT OR UPDATE OR DELETE ON public.motivos_visita FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
DROP TRIGGER IF EXISTS auditar_motivo_campos ON public.motivo_campos;
CREATE TRIGGER auditar_motivo_campos AFTER INSERT OR UPDATE OR DELETE ON public.motivo_campos FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
DROP TRIGGER IF EXISTS auditar_catalogos_opciones ON public.catalogos_opciones;
CREATE TRIGGER auditar_catalogos_opciones AFTER INSERT OR UPDATE OR DELETE ON public.catalogos_opciones FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();