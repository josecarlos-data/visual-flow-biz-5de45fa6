# Corrección de la carrera al iniciar sesión

## Objetivo

Evitar que `verificar_sesion` cierre una sesión recién iniciada: al pasar de `/auth` a `/` se dispara `comprobarSesion` antes de que `registrar_sesion` haya escrito la fila en `sesiones_activas`, y la ausencia de fila se interpreta como expulsión.

## 1. Cliente — `src/hooks/useAuth.tsx`

### Guardia dentro de `comprobarSesion`

- Si `controlListo` es `false`, la función sale sin hacer nada. La guardia vive dentro de la propia función (además de en los efectos), de modo que ninguna vía de entrada (intervalo, focus, visibilitychange, cambio de ruta) se la salte.
- `controlListo` se añade a las dependencias de `comprobarSesion` (useCallback) y de los dos efectos que la usan (intervalo y cambio de ruta).

### Primer disparo del efecto de ruta

- Un `useRef` guarda el último `pathname` comprobado.
- Cuando `controlListo` pasa a `true`, la ref se inicializa con el `pathname` actual sin lanzar comprobación: el navegado `/auth` → `/` del inicio de sesión no dispara `comprobarSesion`.
- La comprobación solo se lanza cuando el `pathname` actual es distinto del guardado; tras comprobar, la ref se actualiza.

## 2. Migración — `public.verificar_sesion` (defensa en el servidor)

Una única migración en `drizzle/migrations/`:

- `DROP FUNCTION` con la firma exacta `public.verificar_sesion(text)` y recreación conservando seguridad (SECURITY DEFINER), volatilidad, `search_path` y la actualización espaciada de actividad.
- Lectura de `control_sesiones_activo` sin cambios: si no vale `'true'`, devuelve `vigente=true` inmediatamente.
- Nueva lógica de veredicto:
  - Si el usuario **no tiene ninguna fila** en `sesiones_activas` → `vigente=true` (no hay a quién expulsar; echar en ese estado es siempre falso positivo).
  - Solo devuelve `vigente=false` cuando el usuario **tiene al menos una fila** y **ninguna coincide** con el `_sesion_id` recibido (único caso real de expulsión).
- `REVOKE EXECUTE` de PUBLIC/anon y `GRANT EXECUTE TO authenticated` restaurados.

## Verificación

- Aplicar la migración y comprobar la definición y permisos finales de `verificar_sesion`.
- Build y comprobación de tipos limpios.
- Iniciar sesión con `sesiones_max = 1`: el primer intento entra sin el aviso de "iniciado sesión en otro equipo".
- Repetir la prueba de expulsión real (segundo equipo con el mismo usuario): la pestaña perdedora sigue cerrándose con cierre local.
- Con el control desactivado desde el panel, `verificar_sesion` sigue aceptando siempre.

## Alcance

Una migración y cambios únicamente en `src/hooks/useAuth.tsx`. No se toca `registrar_sesion`, ni el control de dispositivos, ni el panel de seguridad, ni la pantalla de código de alta.
