# Inicio de sesión por usuario con bloqueo escalonado y límite por IP

## Estado actual comprobado

- `profiles.estado` admite `activo`, `suspendido_temporal`, `bloqueado_intentos`, `bloqueado_admin` y `baja` (CHECK). `username` es único sin distinguir mayúsculas (índice sobre `lower(username)`) y tiene formato `^[a-z0-9._-]{3,30}$`.
- Los 3 usuarios activos **no tienen nombre de usuario**. El acceso por correo tendrá que seguir encendido hasta que se les asigne uno.
- `app_settings` solo pueden leerlo los usuarios aprobados. La pantalla de login (sin sesión) **no puede leer** `acceso_permite_correo` directamente. Ver la decisión 1.
- `auditoria_eventos` no limita `tipo` (solo `resultado`), y ya tiene índice `(tipo, ocurrido_en)`.
- `admin_cambiar_estado`: definición vigente leída. Al pasar a `activo` ya pone `marcada_sospechosa = false`, pero no toca ninguna tabla de intentos.
- El evento `login` lo registran hoy `Auth.tsx` (fallo) y `useAuth.tsx` (ok).
- `cambiar-password` comprueba la contraseña actual con `signInWithPassword` y devuelve `actual_incorrecta` si falla.
- En `config.toml` solo `auth-email-hook` tiene `verify_jwt = false`.

## Decisiones que necesito antes de construir (desvíos del encargo)

1. **Cómo sabe la pantalla de login si se permite el correo.** Sin sesión no se puede leer `app_settings`. Propuesta: `iniciar-sesion` acepta además `{ "accion": "config" }` y devuelve solo `{ permite_correo: boolean }`. No abre `app_settings` al público ni añade ninguna función más.
2. **Mensaje de suspensión vigente (paso B.3).** Una suspensión puesta a mano por un admin también es `suspendido_temporal`. Propuesta:
   - si `estado_cambiado_por` es NULL (la puso el sistema), se usa el mensaje «…hasta las HH:MM por intentos fallidos»;
   - si la puso un admin, «Cuenta suspendida temporalmente hasta las HH:MM.».
   En ambos casos no se comprueba la contraseña ni se cuenta el intento.
3. **Riesgo a verificar: límite de intentos del propio servicio de autenticación.** Todas las comprobaciones de contraseña saldrán ahora desde la IP de la función de servidor, no desde la de cada usuario. Si el servicio de autenticación aplica su límite por IP, un pico de intentos podría frenar el login de todos. Lo compruebo al construir con varios intentos seguidos. Si aparece, te lo digo antes de seguir.

Si apruebas el plan sin comentar estos puntos, aplico las propuestas 1 y 2 tal cual.

## A. Migración (una, en drizzle/migrations)

1. Tabla `intentos_acceso` tal como la describes. Llevará GRANT ALL a service_role, REVOKE de anon/authenticated y RLS activado, con una única policy SELECT para `is_admin(auth.uid())`.
   - Excepción necesaria: GRANT SELECT a authenticated. Sin ese permiso, la policy de admin no puede funcionar desde el panel. Los no admin no ven nada por RLS.
2. `registrar_fallo_acceso(_user_id, _origen)` con la lógica especificada:
   - `INSERT … ON CONFLICT DO NOTHING` y después `SELECT … FOR UPDATE`;
   - ventanas de 15 min y 24 h;
   - duración 15/30/60 min;
   - solo cambia el estado si es `activo` o una suspensión vencida;
   - `marcada_sospechosa` a partir del ciclo 2;
   - evento `suspension_automatica` con `_origen` en el detalle;
   - devuelve `{suspendido, hasta}`.
3. `registrar_exito_acceso(_user_id)`: pone `fallos` a 0 y cierra las suspensiones vencidas con el evento `fin_suspension`. No toca `ciclos` ni `marcada_sospechosa`.
4. Las dos funciones: REVOKE EXECUTE de PUBLIC, anon y authenticated; GRANT solo a service_role.
5. `admin_cambiar_estado`: copia literal de la definición vigente con un único añadido: al pasar a `activo`, `DELETE FROM intentos_acceso WHERE user_id = _user_id`.
6. Fila de ajuste `acceso_permite_correo = 'true'`, con `ON CONFLICT DO NOTHING`.

## B. Función `iniciar-sesion` (verify_jwt = false)

Orden estricto, como en el encargo:
1. IP con la misma lógica que `registrar-evento`. Si esa IP acumula 20 o más `login` con resultado `fallo` en 15 min, la función corta ahí con el mensaje de espera.
2. Busca la cuenta por email (solo si se permite el correo) o por `lower(username)`. Si no existe, registra el evento `usuario_desconocido` y da la respuesta genérica.
3. Si hay una suspensión vigente, responde con el mensaje de la decisión 2.
4. Comprueba la contraseña con la clave anónima (`persistSession: false`).
   - Si falla, llama a `registrar_fallo_acceso(uid, 'login')`, registra el evento con IP y user agent, y da la respuesta genérica o el mensaje de suspensión.
5. Contraseña correcta pero usuario `bloqueado_admin`, `bloqueado_intentos` o `baja`: cierra esa sesión nueva, registra `login` denegado y muestra «Tu usuario está bloqueado…».
6. Contraseña correcta y usuario operativo: `registrar_exito_acceso`, registra `login` ok y devuelve `access_token` y `refresh_token`.

## C. `cambiar-password`

Si falla la contraseña actual (modos voluntario y forzado), llama a `registrar_fallo_acceso(uid, 'cambio_password')`. Nada más cambia.

## D. `registrar-evento`

Se elimina la rama que acepta eventos sin token. Desde ahora todo evento exige un JWT válido.

## E. Cliente

- `Auth.tsx`: campo «Usuario» (con «o correo» si se permite), llamada a `iniciar-sesion` y `supabase.auth.setSession()`. Se quita el registro de `login` fallido.
- `useAuth.tsx`: se quita el registro de `login` ok. No se tocan `resolverAcceso`, el `logout`, `registrar_sesion` ni `verificar_sesion`.
- `auditoria.ts` y `registrar-evento`: no se añaden tipos. Los eventos nuevos solo se escriben en el servidor. Pantalla de Auditoría: etiquetas legibles para `suspension_automatica` y `fin_suspension`, si tiene un mapa de etiquetas.

## F. Panel de usuarios

- Estado efectivo: una suspensión vencida se muestra como «Activo» con la nota «Suspensión finalizada el …». La insignia roja solo aparece con la suspensión vigente.
- Junto al estado, fallos recientes y ciclos, leídos de `intentos_acceso`.
- Interruptor «Permitir acceso con correo»:
  - con advertencia y aviso del número de usuarios activos sin nombre de usuario (hoy 3);
  - no se puede apagar mientras ese número sea mayor que 0;
  - registra `cambio_config_seguridad`.

## Verificación

- Mismos privilegios de `admin_cambiar_estado` antes y después, y en su definición solo cambia la línea añadida.
- Con una cuenta de prueba: login por correo; 5 fallos hasta la suspensión de 15 min; mensaje sin comprobar la contraseña; fin de la suspensión al entrar después.
- Usuario inexistente y contraseña errónea devuelven el mismo texto.
- Un evento sin token en `registrar-evento` no se guarda.
- Linter de la base.

Fuera de alcance: avisos por correo, segundo factor, `has_role`, `resolverAcceso`, `registrar_sesion` y `verificar_sesion`.
