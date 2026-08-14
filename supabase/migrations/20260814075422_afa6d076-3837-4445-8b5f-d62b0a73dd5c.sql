CREATE OR REPLACE FUNCTION public.can_view_cliente(_user_id uuid, _cod integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (SELECT public.is_approved(_user_id)) AND (
    (SELECT public.is_admin(_user_id))
    OR (SELECT public.has_role(_user_id, 'director_comercial'))
    OR ((SELECT public.has_role(_user_id, 'jefe_de_zona')) AND EXISTS (
          SELECT 1 FROM public.clientes c WHERE c.cod_cliente = _cod AND c.delegacion = (SELECT public.get_user_delegacion(_user_id))))
    OR ((SELECT public.has_role(_user_id, 'comercial')) AND EXISTS (
          SELECT 1 FROM public.clientes c WHERE c.cod_cliente = _cod AND c.vendedor = (SELECT public.get_user_employee_code(_user_id))))
  )
$function$;

CREATE OR REPLACE FUNCTION public.clientes_permitidos(_user_id uuid)
 RETURNS TABLE(cod_cliente integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.cod_cliente FROM public.clientes c
  WHERE (SELECT public.is_approved(_user_id)) AND (
    (SELECT public.is_admin(_user_id))
    OR (SELECT public.has_role(_user_id, 'director_comercial'))
    OR ((SELECT public.has_role(_user_id, 'jefe_de_zona')) AND c.delegacion = (SELECT public.get_user_delegacion(_user_id)))
    OR ((SELECT public.has_role(_user_id, 'comercial')) AND c.vendedor = (SELECT public.get_user_employee_code(_user_id)))
  )
$function$;