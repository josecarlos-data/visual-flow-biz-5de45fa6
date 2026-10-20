UPDATE public.dashboards SET sort_order = 11 WHERE key = 'clientes' AND sort_order = 10;

CREATE OR REPLACE FUNCTION public.vendedores_objetivos()
 RETURNS TABLE(vendedor text, cod_vendedor text, clientes integer, ruta_especial text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.vendedor, MIN(c.cod_vendedor), COUNT(*)::int, NULLIF(c.ruta_especial,'')
  FROM public.clientes c
  WHERE c.vendedor IS NOT NULL AND c.vendedor <> ''
    AND (SELECT public.is_approved(auth.uid()))
    AND ((SELECT public.is_admin(auth.uid())) OR (SELECT public.has_role(auth.uid(), 'director_comercial')))
  GROUP BY c.vendedor, NULLIF(c.ruta_especial,'')
  ORDER BY c.vendedor;
$function$;

CREATE OR REPLACE FUNCTION public.situaciones_activas()
 RETURNS TABLE(cod_cliente integer, etiqueta text, categoria text, nota text, efecto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (s.cod_cliente) s.cod_cliente, s.etiqueta, s.categoria, s.nota, s.efecto
  FROM public.situaciones_cliente s
  WHERE s.activo
    AND s.desde <= CURRENT_DATE
    AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE)
    AND (SELECT public.is_approved(auth.uid()))
    AND public.can_view_cliente(auth.uid(), s.cod_cliente)
  ORDER BY s.cod_cliente, s.updated_at DESC;
$function$;