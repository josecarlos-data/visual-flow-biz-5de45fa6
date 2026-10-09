# Auditar los cambios de ajustes hechos sin usuario y renombrar la pantalla de acceso

## Comprobado antes de proponer
- `auditar_cambio` termina sin registrar nada en cuanto `auth.uid()` es nulo, sea cual sea la tabla.
- Ninguna función del servidor escribe en `app_settings`. `avisos-seguridad` solo la lee y guarda su estado en `avisos_estado`, que no tiene trigger. Por tanto, la tarea de avisos no puede generar eventos sobre sí misma.
- `avisos-seguridad` ya trata como cualquier otro un evento `dato_cambio` de `app_settings` con `user_id` nulo, y escribe «por el sistema» en esos casos. **No hay que tocarla.**
- La pantalla de Auditoría ya muestra `origen` como «Usuario» o «Sistema».

## Propuesta: una función aparte solo para app_settings
Así `auditar_cambio` queda como está y las importaciones en visitas, clientes, objetivos y situaciones se siguen ignorando sin riesgo.

La migración (una sola, en `drizzle/migrations/`) hace esto:
1. Crea `public.auditar_cambio_ajustes()`, una función de trigger SECURITY DEFINER con `SET search_path = public`:
   - Registra siempre, también cuando `auth.uid()` es nulo.
   - Tipo `dato_alta`, `dato_cambio` o `dato_baja`; entidad `app_settings`; `entidad_id` es la clave del ajuste.
   - `detalle`: `campos`, `antes` y `despues` (el mismo formato de hoy), más `origen` con el valor `usuario` o `sistema`.
   - En un UPDATE sin cambios reales (sin contar `updated_at`), no registra nada.
   - Si el registro falla, no bloquea el cambio (`EXCEPTION WHEN OTHERS THEN NULL`), igual que hoy.
2. Sustituye en `app_settings` el trigger `auditar_app_settings` por uno nuevo con el mismo nombre que llama a la función nueva: DROP TRIGGER y CREATE TRIGGER, AFTER INSERT/UPDATE/DELETE, FOR EACH ROW.
3. Revoca `EXECUTE` de `auditar_cambio_ajustes()` a PUBLIC, anon y authenticated.

No cambian `auditar_cambio`, sus otros cuatro triggers, las políticas ni los permisos de `auditoria_eventos`. Tampoco se tocan las funciones de acceso, contraseñas, sesiones ni avisos.

## Pantalla de acceso
- En `src/pages/Auth.tsx`, el título pasa de «Dashboard Comercial» a «CRM Rimosa». No cambia nada más.

## Prueba
1. Sin usuario, cambio un ajuste de seguridad inocuo y lo devuelvo a su valor. Probablemente la duración de sesión, de 1 a 2 y otra vez a 1.
2. Compruebo que quedan dos eventos `dato_cambio` con `user_id` nulo y `origen: sistema`, y que Auditoría los muestra como «Sistema».
3. En la siguiente pasada de la tarea, compruebo el evento `aviso_seguridad/ok` de la categoría configuración. Si se envió un aviso hace menos de 30 minutos, el correo sale en la primera pasada después de ese plazo.
4. Compruebo que un cambio sin usuario en otra tabla sigue sin registrarse. Uso una transacción de prueba que se deshace al terminar.
