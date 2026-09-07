# Registro de auditoría de seguridad

Registro inmutable de eventos de seguridad (accesos, denegaciones, cambios sobre usuarios) escrito únicamente desde el servidor, con una pantalla de consulta solo para administradores.

## Qué verá el usuario

- Nueva entrada "Auditoría" en el menú de administración.
- Una tabla paginada con fecha, usuario, tipo de evento, resultado, ruta e información técnica (IP, navegador), con filtros por fechas, usuario, tipo y resultado. En móvil se muestra como tarjetas, sin desplazamiento lateral.
- Nadie puede modificar ni borrar el registro desde la aplicación, ni siquiera un administrador.

## 1. Migración única

Tabla `public.auditoria_eventos` con los campos indicados (id, ocurrido_en, user_id, email, tipo, resultado con restricción ok/denegado/fallo, entidad, entidad_id, ruta, detalle jsonb, ip inet, user_agent, dispositivo_id) y los tres índices pedidos.

Permisos, en este orden:
1. `CREATE TABLE`
2. `REVOKE ALL ... FROM authenticated, anon;` `GRANT SELECT ... TO authenticated;` `GRANT ALL ... TO service_role;`
3. `ENABLE ROW LEVEL SECURITY`
4. Una sola policy permisiva de lectura para `authenticated` con `USING (public.is_admin(auth.uid()))`. Sin policies de escritura: solo `service_role` (que salta RLS) puede insertar.

RPC `public.auditoria_listado(_desde, _hasta, _user_id, _tipo, _resultado, _limit int default 100, _offset int default 0)`, `STABLE SECURITY DEFINER SET search_path = public`, devuelve los campos de la tabla más `full_name` del perfil y `total_filas` (conteo total de la ventana filtrada). Primera línea: si `NOT public.is_admin(auth.uid())` retorna sin filas. `GRANT EXECUTE ... TO authenticated` explícito tras el CREATE.

Retención: `INSERT` en `app_settings` de `auditoria_retencion_dias = '90'` y función `public.purgar_auditoria()` que borra lo anterior a ese número de días leyendo el ajuste. Sin cron.

Nota: la RPC de listado ya cubre la consulta, pero mantengo también el `GRANT SELECT` a `authenticated` con la policy de admin tal y como pides.

## 2. Edge function `registrar-evento`

- `verify_jwt = false` (debe aceptar logins fallidos sin sesión); CORS desde `_shared/cors.ts`.
- Si llega `Authorization`, valida con `getUser()` y toma de ahí el `user_id`; el cuerpo nunca puede fijarlo.
- IP desde `x-forwarded-for` (primer valor) y user agent desde la cabecera; nunca del cuerpo.
- Inserta con la clave de servicio.
- Cuerpo aceptado: `{ tipo, resultado, email?, entidad?, entidad_id?, ruta?, detalle? }`, validado con lista blanca de `tipo` definida en el fichero: `login`, `logout`, `acceso_denegado`, `cambio_rol`, `aprobacion_usuario`, `baja_usuario`, `cambio_ver_margen`.
- Responde 204 siempre que pueda; nunca propaga error al cliente.

## 3. Cliente `src/lib/auditoria.ts`

`registrarEvento(tipo, opts)` en modo "dispara y olvida": invoca la función, envuelve todo en try/catch, no bloquea la interfaz ni muestra avisos.

## 4. Enganches (solo estos)

- `useAuth.tsx`: `SIGNED_IN` → `login` ok; en `signOut`, `logout` ok antes de cerrar sesión.
- `Auth.tsx`: error de acceso → `login` fallo con el email introducido (nunca la contraseña).
- `App.tsx` `ProtectedRoute`: `acceso_denegado` en las dos ramas de falta de permiso (adminOnly no cumplido y dashboard no autorizado), con la ruta solicitada. No se registran `!user` ni `!isApproved`.
- `AdminUsers.tsx`: `cambio_rol`, `aprobacion_usuario`, `baja_usuario`, `cambio_ver_margen` con `entidad='usuario'` y `entidad_id` del usuario afectado.

## 5. Pantalla `src/pages/AdminAuditoria.tsx`

Mismo patrón que `AdminUsers.tsx`. Ruta `/admin/auditoria` con `<ProtectedRoute adminOnly>`, enlace en `AppSidebar` en el grupo de Administración, sin fila en `dashboards`. Tabla paginada por la RPC con filtros, tarjetas en móvil. El desplegable de usuarios se rellena desde `profiles` con `limit` explícito y orden por nombre.

## Fuera de alcance

Dispositivos, sesión única, triggers de cambios de datos, registro de navegación, exportaciones y marca de agua.
