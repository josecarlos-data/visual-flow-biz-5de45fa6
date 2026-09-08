# Control de dispositivos y sesión única

Registro de los equipos desde los que entra cada usuario, límite de dispositivos, opción de sesión única y panel de administración. Con un interruptor global para empezar en modo observación (solo registra) y pasar a bloqueo cuando esté validado.

## Aviso de alcance

Es el cambio más grande hasta ahora y toca autenticación, que es la parte más delicada. Lo construyo tal y como se describe, con dos cautelas que no amplían el alcance:

- El modo por defecto será observación: nadie puede quedarse fuera hasta que se cambie el selector a mano.
- Ante cualquier fallo de red en las comprobaciones, se deja pasar; y un administrador nunca puede ser bloqueado.

## A. Migración única

Tablas nuevas `public.dispositivos` y `public.sesiones_activas` con los campos, índice y unicidad indicados. En ambas, en este orden: crear tabla, `REVOKE ALL ... FROM authenticated, anon`, `GRANT SELECT ... TO authenticated`, `GRANT ALL ... TO service_role`, activar RLS y una sola policy permisiva de lectura para `authenticated`: el propio usuario o `public.is_admin(auth.uid())`. Sin policies de escritura.

Columnas nuevas en `public.profiles`: `sesiones_multiples boolean NOT NULL DEFAULT false` y `dispositivos_max int NOT NULL DEFAULT 2`.

Filas en `app_settings`: `control_acceso_modo = 'observacion'` y `control_dispositivos_activo = 'true'`.

Cuatro funciones `SECURITY DEFINER SET search_path = public`, con `GRANT EXECUTE ... TO authenticated` explícito tras cada `CREATE` y nada a `anon`:

- `registrar_sesion(_dispositivo_id, _sesion_id, _user_agent)` → jsonb `{permitido, motivo, modo}`, con la lógica y el orden descritos (alta automática por debajo del máximo, `dispositivo_no_autorizado` al superarlo, `dispositivo_bloqueado`, upsert de sesión solo si `sesiones_multiples` es falso, admin nunca denegado, en observación siempre permitido con motivo relleno).
- `verificar_sesion(_sesion_id)` → jsonb `{vigente}`, `STABLE`, actualiza `ultima_actividad` cuando es vigente.
- `dispositivos_usuario(_user_id)` → tabla para el panel, 0 filas si el llamante no es admin.
- `admin_gestionar_dispositivo(_id, _accion, _nombre)` → bloquear / desbloquear / renombrar / eliminar, con verificación de admin al entrar.

Nota técnica: `verificar_sesion` se declara `STABLE` según lo pedido, así que la actualización de `ultima_actividad` se hace desde una función auxiliar `VOLATILE` interna; si el motor lo rechaza, la alternativa es dejarla `VOLATILE` (lo indicaría antes de cambiarlo).

## B. Auditoría

En `supabase/functions/registrar-evento/index.ts`, añadir a la lista blanca: `dispositivo_alta`, `dispositivo_denegado`, `sesion_expulsada`, `cambio_config_seguridad`. Nada más de esa función cambia.

## C. Cliente

- `src/lib/dispositivo.ts`: `getDispositivoId()` con uuid persistido en `localStorage` bajo `crm_dispositivo_id`.
- `src/hooks/useAuth.tsx`: tras un inicio de sesión válido genera un `sesion_id` (guardado en `sessionStorage`) y llama a `registrar_sesion`. Si no está permitido, cierra sesión, registra `dispositivo_denegado` y muestra un aviso claro de contactar con el administrador. Si el motivo es `dispositivo_nuevo`, registra `dispositivo_alta`. Comprobación de `verificar_sesion` cada 60 segundos y al recuperar el foco de la ventana; si deja de ser vigente, registra `sesion_expulsada`, cierra sesión y avisa de que se ha entrado desde otro equipo. Intervalo y escuchas limpiados al desmontar. Cualquier error de red deja pasar.

## D. Error de módulo tras un despliegue

`src/lib/lazyConRecarga.ts`: envoltorio de `React.lazy` que, si falla la carga dinámica, recarga la página una sola vez (marca en `sessionStorage`) y, si ya se recargó, propaga el error al `ErrorBoundary`. Todos los `lazy()` de `src/App.tsx` pasan a usarlo; las rutas no cambian.

## E. Panel de administración

En `src/pages/AdminUsers.tsx`, por usuario: interruptor "Permitir varias sesiones a la vez", número máximo de dispositivos y lista de sus dispositivos (última conexión, renombrar, bloquear, eliminar) vía las funciones nuevas. Arriba, selector global del modo de control de acceso (observación / bloqueo) sobre `app_settings`, solo para administradores, con una advertencia visible de lo que implica el modo bloqueo. Todo cambio en estos ajustes registra `cambio_config_seguridad`. Tarjetas en móvil, sin desplazamiento lateral.

Los dos campos nuevos del perfil se guardan con el mismo patrón que `ver_margen`; si la regla de seguridad que impide que un usuario se auto-escale bloqueara la escritura, se ajustaría esa comprobación en la misma migración para dejar pasar estos dos campos a los administradores.

## Fuera de alcance

Disparadores de cambios de datos, registro de navegación, exportaciones, marca de agua y limitación por IP. No se toca `auditoria_eventos` ni su policy, ni se crean vistas materializadas.
