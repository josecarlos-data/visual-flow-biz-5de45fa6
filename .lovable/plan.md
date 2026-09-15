# Corregir expulsiones entre pestañas del mismo equipo

## Objetivo

Hacer que todas las pestañas de un mismo identificador de equipo compartan una única plaza de sesión, evitar que una expulsión cierre los demás contextos del usuario y añadir un interruptor general para desactivar temporalmente el control de sesiones.

## 1. Una única migración

### Ajuste global

- Añadir a `app_settings` la clave `control_sesiones_activo` con valor inicial `true` y una descripción clara.
- Usar una inserción idempotente para no sobrescribir una configuración existente.

### `public.registrar_sesion`

- Eliminar primero la función usando su firma exacta `public.registrar_sesion(text, text, text, text)` y recrearla conservando toda la lógica actual de autorización de equipos, códigos de alta, límites y respuestas.
- Leer `control_sesiones_activo`, con `true` como valor seguro por defecto.
- Cuando el acceso del equipo esté permitido y el control de sesiones esté activo:
  1. Limpiar sesiones caducadas como hasta ahora.
  2. Antes de insertar, borrar las sesiones anteriores del mismo usuario e identificador de equipo cuyo `sesion_id` sea distinto al actual.
  3. Insertar o actualizar la sesión actual.
  4. Aplicar `sesiones_max` ordenando por `ultima_actividad DESC, sesion_id DESC`, para que los empates sean deterministas.
- Cuando `control_sesiones_activo = 'false'`, no borrar sesiones por caducidad, equipo ni límite; se podrá mantener/registrar la sesión actual sin expulsar ninguna otra.
- Restaurar `GRANT EXECUTE ... TO authenticated` tras recrear la función y mantenerla sin acceso público o anónimo.

### `public.verificar_sesion`

- Recrear la función dentro de la misma migración, conservando su firma, seguridad, volatilidad y actualización espaciada de actividad.
- Leer `control_sesiones_activo`; cuando sea `false`, devolver inmediatamente `{"vigente": true}` sin consultar, borrar ni actualizar sesiones.
- Cuando sea `true`, mantener la comprobación actual.
- Mantener el permiso de ejecución exclusivamente para usuarios autenticados.

## 2. Identificador de sesión compartido por equipo

En `src/lib/dispositivo.ts` y `src/hooks/useAuth.tsx`:

- `getSesionId()` pasa de `sessionStorage` a `localStorage`, con la misma clave `crm_sesion_id`, junto al identificador de equipo. Se genera solo si no existe.
- Así, todas las pestañas del mismo equipo comparten el mismo `sesion_id`: `registrar_sesion` actualiza una única fila y ninguna pestaña expulsa a otra.
- El `DELETE` por `dispositivo_id` de la migración se mantiene: limpia las filas sueltas que dejaron los `sesion_id` antiguos por pestaña.
- Al cerrar sesión manualmente se elimina la clave `crm_sesion_id` del almacenamiento local, para que el siguiente inicio genere una nueva.
- La marca `auditoria_login_<user>` que evita registrar el evento de inicio repetido se queda en `sessionStorage`, sin cambios.

## 3. Expulsión local en el cliente

En `src/hooks/useAuth.tsx`:

- En la rama automática que detecta una sesión no vigente, sustituir la llamada al cierre manual completo por `supabase.auth.signOut({ scope: "local" })`.
- Después, limpiar el estado local de autenticación y control necesario para que esa pestaña vuelva al acceso sin afectar el token remoto de la sesión ganadora.
- Conservar sin cambios el botón manual de cerrar sesión y su flujo actual.
- Mantener la auditoría de `sesion_expulsada` y el aviso existente.

## 4. Interruptor en el panel de seguridad

En `SeguridadAccesoCard`:

- Cargar también `control_sesiones_activo` junto a los dos ajustes existentes.
- Añadir un tercer selector con opciones `Activo` y `Desactivado`.
- Guardarlo mediante el mismo flujo actual y registrar el cambio en Auditoría.
- Mostrar una advertencia visible cuando esté desactivado, indicando que temporalmente no se limita el acceso simultáneo desde distintos equipos.
- Ajustar la rejilla para que los tres controles se distribuyan correctamente en tamaños amplios y se apilen en móvil.

## Verificación

- Aplicar la única migración y comprobar las definiciones y permisos finales de ambas funciones.
- Build y comprobación de tipos limpios.
- Abrir dos pestañas con el mismo identificador de equipo y `sesiones_max = 1`: ambas permanecen operativas y ocupan una sola fila/plaza efectiva.
- Abrir otro equipo con el mismo usuario: se conserva solo el equipo ganador según el límite, sin empate indeterminado.
- Confirmar que una pestaña expulsada usa cierre local y no invalida la sesión ganadora.
- Desactivar el control desde el panel: `verificar_sesion` siempre acepta y `registrar_sesion` no elimina sesiones.
- Reactivarlo: vuelve a aplicarse el límite configurado.

## Alcance

Una migración para los cambios de base de datos y cambios únicamente en `src/hooks/useAuth.tsx` y `src/components/SeguridadAccesoCard.tsx`. Sin alterar la lógica de control de equipos, códigos de alta, auditoría ni el cierre manual de sesión.
