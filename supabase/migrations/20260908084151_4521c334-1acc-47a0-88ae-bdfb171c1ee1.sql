REVOKE EXECUTE ON FUNCTION public.registrar_sesion(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verificar_sesion(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cerrar_sesion(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dispositivos_usuario(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_gestionar_dispositivo(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_generar_codigo(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_sesion(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_sesion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispositivos_usuario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_gestionar_dispositivo(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_generar_codigo(uuid) TO authenticated;