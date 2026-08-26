REVOKE ALL ON FUNCTION public.actividad_interna_almacenes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actividad_interna_almacenes(integer) TO authenticated;