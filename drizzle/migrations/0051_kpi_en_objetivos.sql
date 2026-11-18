INSERT INTO public.app_settings(key, value, description) VALUES
  ('kpi_visible_para', 'admin', 'KPI de visitas: quién lo ve (admin | gestores | todos)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kpi_ambito(_uid uuid)
RETURNS TABLE(todo boolean, jefe boolean, delegacion text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (SELECT coalesce((SELECT value FROM app_settings WHERE key='kpi_visible_para'), 'admin') AS vis)
  SELECT public.is_admin(_uid) OR public.has_role(_uid,'director_comercial'::app_role),
         public.has_role(_uid,'jefe_de_zona'::app_role),
         public.get_user_delegacion(_uid)
  FROM cfg
  WHERE public.is_approved(_uid) AND public.has_dashboard_access(_uid,'objetivos')
    AND (public.is_admin(_uid)
         OR (cfg.vis = 'gestores' AND public.has_role(_uid,'director_comercial'::app_role))
         OR cfg.vis = 'todos')
$$;
REVOKE ALL ON FUNCTION public.kpi_ambito(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_ambito(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.kpi_visible()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.kpi_ambito(auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.kpi_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_visible() TO authenticated, service_role;

UPDATE public.dashboards SET is_active = false WHERE key = 'kpi_visitas';
COMMENT ON FUNCTION public.kpi_detalle(uuid, int, int, text) IS 'Sin uso en pantalla; se sustituirá en el Build 2 (trazabilidad).';