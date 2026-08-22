DELETE FROM public.user_dashboard_access WHERE dashboard_key = 'compras';
DELETE FROM public.dashboards WHERE key = 'compras';
DROP TABLE IF EXISTS public.compras CASCADE;