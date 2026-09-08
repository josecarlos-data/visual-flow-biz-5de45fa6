# Control de dispositivos y sesión única

Registro de los equipos desde los que entra cada usuario, límite de dispositivos, opción de sesión única y panel de administración. Con un interruptor global para empezar en modo observación (solo registra) y pasar a bloqueo cuando esté validado.

## Aviso de alcance

Es el cambio más grande hasta ahora y toca autenticación, que es la parte más delicada. Lo construyo tal y como se describe, con dos cautelas que no amplían el alcance:

- El modo por defecto será observación: nadie puede quedarse fuera hasta que se cambie el selector a mano.
- Ante cualquier fallo de red en las comprobaciones, se deja pasar; y un administrador nunca puede ser bloqueado.

## A. Migración única

Tablas nuevas `public.dispositivos`, `public.sesiones_activas` y `public.codigos_alta`. `sesiones_activas` admite varias filas por usuario: clave primaria `(user_id, sesion_id)` e índice por `(user_id, ultima_actividad)`. `codigos_alta` guarda código único de 8 caracteres (mayúsculas y dígitos, sin O, 0, I, 1), usuario, quien lo creó, creación, caducidad a 24 horas, uso y dispositivo que lo consumió.

En las tres, en este orden: crear tabla, `REVOKE ALL ... FROM authenticated, anon`, `GRANT SELECT ... TO authenticated`, `GRANT ALL ... TO service_role`, activar RLS y una sola policy permisiva de lectura para `authenticated`: el propio usuario o `public.is_admin(auth.uid())`. Sin policies de escritura.

Columnas nuevas en `public.profiles`: `sesiones_max int NOT NULL DEFAULT 1` (0 = ilimitado) y `dispositivos_max int NOT NULL DEFAULT 2`.

En la misma migración, `CREATE OR REPLACE` de `public.prevent_profile_self_escalation` conservando íntegras las siete comprobaciones actuales (is_approved, ver_margen, employee_code, delegacion, zone_id, user_id, email) y añadiendo dos más: cualquier cambio en `sesiones_max` o en `dispositivos_max` lanza excepción. No se elimina ni se relaja ninguna comprobación existente y el trigger no se recrea, solo la función. La escritura desde el panel funciona sin más: la policy "Admins can update all profiles" permite a un administrador escribir cualquier columna, y el trigger no comprueba nada cuando quien escribe es administrador.

Filas en `app_settings`: `control_acceso_modo = 'observacion'`, `control_dispositivos_activo = 'true'` y `alta_dispositivo_modo = 'auto'` (auto | codigo).

Cinco funciones `SECURITY DEFINER SET search_path = public`, con `GRANT EXECUTE ... TO authenticated` explícito tras cada `CREATE` y nada a `anon`:

- `registrar_sesion(_dispositivo_id, _sesion_id, _user_agent, _codigo text DEFAULT NULL)` → jsonb `{permitido, motivo, modo}`.
  - Dispositivo ya registrado: actualiza última vez y agente; si está bloqueado, motivo `dispositivo_bloqueado`.
  - Dispositivo no registrado y `alta_dispositivo_modo = 'auto'`: alta automática por debajo de `dispositivos_max` con motivo `dispositivo_nuevo`; al superarlo, `dispositivo_no_autorizado`.
  - Dispositivo no registrado y modo `codigo`: sin código → `codigo_requerido`; código válido (de ese usuario, sin usar, sin caducar) → alta, código marcado como usado con su dispositivo, motivo `dispositivo_nuevo`; código inválido o caducado → `codigo_invalido`. El límite `dispositivos_max` se sigue aplicando: un código no permite superarlo.
  - Sesiones: borra primero las del usuario con `ultima_actividad` de hace más de 12 horas, inserta la nueva y, si `sesiones_max > 0` y se supera, borra las más antiguas por `ultima_actividad` hasta cumplirlo. Con `sesiones_max = 0` no borra ninguna.
  - En modo de acceso `observacion` siempre `permitido = true` con el motivo relleno, incluidos `codigo_requerido` y `codigo_invalido`, y el dispositivo se da de alta igualmente. El código solo bloquea en modo `bloqueo`. Un administrador nunca queda denegado.
- `verificar_sesion(_sesion_id)` → jsonb `{vigente}`, `VOLATILE`; vigente = existe fila para `(auth.uid(), _sesion_id)`; actualiza `ultima_actividad` solo si han pasado más de 5 minutos.
- `dispositivos_usuario(_user_id)` → tabla para el panel, 0 filas si el llamante no es admin.
- `admin_gestionar_dispositivo(_id, _accion, _nombre)` → bloquear / desbloquear / renombrar / eliminar, con verificación de admin al entrar.
- `admin_generar_codigo(_user_id)` → text; verifica admin al entrar, invalida los códigos previos sin usar de ese usuario y devuelve el nuevo.

## B. Auditoría

En `supabase/functions/registrar-evento/index.ts`, añadir a la lista blanca: `dispositivo_alta`, `dispositivo_denegado`, `sesion_expulsada`, `cambio_config_seguridad`, `codigo_generado`, `codigo_usado`, `codigo_invalido`. Nada más de esa función cambia.

## C. Cliente

- `src/lib/dispositivo.ts`: `getDispositivoId()` con uuid persistido en `localStorage` bajo `crm_dispositivo_id`.
- `src/hooks/useAuth.tsx`: tras un inicio de sesión válido genera un `sesion_id` (guardado en `sessionStorage`) y llama a `registrar_sesion`. Si el motivo es `dispositivo_nuevo`, registra `dispositivo_alta`.
- Si no está permitido por dispositivo no autorizado o bloqueado: cierra sesión, registra `dispositivo_denegado` y muestra un mensaje orientado a la acción — equipo no autorizado, contacte con el administrador, identificador de equipo con los 8 primeros caracteres del identificador del equipo. Se llama siempre "identificador de equipo", nunca "código", para no confundirlo con el código de alta.
- Si el motivo es `codigo_requerido` o `codigo_invalido`, en lugar de cerrar sesión se muestra una pantalla pidiendo el código de alta (campo de 8 caracteres y botón); al enviarlo se vuelve a llamar a `registrar_sesion` con el código. Tras tres intentos fallidos, cierra sesión.
- Comprobación de `verificar_sesion` cada 60 segundos y al recuperar el foco de la ventana; si deja de ser vigente, registra `sesion_expulsada`, cierra sesión y avisa de que se ha entrado desde otro equipo. El cierre de sesión borra además su propia fila de `sesiones_activas`. Intervalo y escuchas limpiados al desmontar. Cualquier error de red deja pasar.

## D. Error de módulo tras un despliegue

`src/lib/lazyConRecarga.ts`: envoltorio de `React.lazy` que, si falla la carga dinámica, recarga la página una sola vez (marca en `sessionStorage`) y, si ya se recargó, propaga el error al `ErrorBoundary`. Todos los `lazy()` de `src/App.tsx` pasan a usarlo; las rutas no cambian.

## E. Panel de administración

En `src/pages/AdminUsers.tsx`, por usuario: número máximo de sesiones simultáneas (0 = sin límite), número máximo de dispositivos, lista de sus dispositivos (última conexión, renombrar, bloquear, eliminar) y botón "Generar código de alta" que muestra el código en grande, copiable y con su caducidad. Arriba, dos selectores globales sobre `app_settings`, solo para administradores y cada uno con su advertencia: modo de control de acceso (observación / bloqueo) y modo de alta de dispositivo (automática / con código). Todo cambio en estos ajustes registra `cambio_config_seguridad`. Tarjetas en móvil, sin desplazamiento lateral.

Los dos campos nuevos del perfil se guardan con el mismo patrón que `ver_margen`. Queda prohibido relajar el trigger anti-escalado para dejar pasar estos campos: si al probarlo algo falla, se detiene y se explica en vez de ajustar la policy.

## Fuera de alcance

Disparadores de cambios de datos, registro de navegación, exportaciones, marca de agua y limitación por IP. No se toca `auditoria_eventos` ni su policy, ni se crean vistas materializadas.
