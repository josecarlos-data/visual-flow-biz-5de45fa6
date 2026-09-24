# Rehacer el control de acceso en useAuth con una máquina de estados única

Sin SQL, sin migraciones. Cambios en `src/hooks/useAuth.tsx`; `src/App.tsx` no necesita cambios (sigue leyendo los campos derivados), aunque puede leer `estadoAcceso` si se quiere.

## 1. Estado único

```text
type EstadoAcceso = 'cargando' | 'sin_sesion' | 'pendiente_aprobacion'
                  | 'pide_codigo' | 'denegado' | 'activo'
```

`const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso>('cargando')`. `setEstadoAcceso` solo se llama dentro de `resolverAcceso`.

## 2. resolverAcceso(session, codigo?)

Pasos en orden estricto, cada uno esperando al anterior:

1. `const gen = ++generacion.current`; `setEstadoAcceso('cargando')` salvo cuando se reintenta un código (ver abajo), para no volver a mostrar la carga en la pantalla del código.
2. Sin sesión: limpia los datos (rol, perfil, dashboards, error del código, contador de intentos), `sin_sesion`. Fin.
3. Carga de perfil, rol y dashboards (la lógica actual de `fetchUserData`, pasada a una función pura `cargarDatosUsuario(userId)` que **devuelve** los datos y no escribe estado). Al volver: si `gen !== generacion.current`, descarta. Luego escribe rol, código de empleado, delegación, ver_margen, dashboards y authError de una sola vez.
   - Error al leer el perfil: `authError` con el mensaje y estado `pendiente_aprobacion` (App muestra antes la pantalla de error porque comprueba `authError` primero, igual que hoy).
   - No aprobado: `pendiente_aprobacion`. Fin.
4. `registrar_sesion` (la lógica actual de `evaluarControl`, pasada a `evaluarControl(codigo)` que **devuelve** un veredicto `'activo' | 'pide_codigo' | 'denegado'` y emite los mismos eventos y avisos que hoy). Comprobación de la generación al volver.
   - Error de red o error de la llamada: `activo` (se deja pasar).
   - `pide_codigo`: escribe `codigoError` y el estado.
   - Tercer código inválido o equipo no autorizado: aviso actual, estado `denegado` y luego `signOut()`; el `SIGNED_OUT` resultante lleva a `sin_sesion`.
5. Todo correcto: `activo`.

`enviarCodigoAlta(codigo)` pasa a llamar a `resolverAcceso(sessionActual, codigo)`, así que también entra por la única función que escribe el estado. Si el paso 3 ya está hecho para el mismo usuario, se reutilizan los datos cargados (se salta la recarga) solo en esta llamada con código.

## 3. Contador de generación

`generacion = useRef(0)`. Se incrementa al empezar cada `resolverAcceso` y también en `limpiarEstadoLocal` (cierre de sesión). Cada `await` va seguido de `if (gen !== generacion.current) return;`, sin escribir nada.

## 4. Disparadores

- `getSession()` inicial: `resolverAcceso(session)`.
- `onAuthStateChange`:
  - `SIGNED_IN` y `SIGNED_OUT`: actualiza session/user y lanza `resolverAcceso` diferido con `setTimeout(…, 0)` (se conserva: llamar a Supabase dentro del callback bloquea). La marca del evento `login` en sessionStorage se mantiene igual.
  - `SIGNED_IN` de un usuario que ya está `activo` con el mismo id (Supabase lo emite al volver a enfocar la pestaña): solo actualiza session/user, sin volver a lanzar la cadena, para evitar un destello de carga.
  - `TOKEN_REFRESHED`, `USER_UPDATED`, `INITIAL_SESSION`: solo session/user.
- Temporizador de seguridad de 5 s: si sigue en `cargando`, invalida la generación y fija `sin_sesion` o `activo` según haya sesión... Para respetar la regla de un solo escritor, el temporizador llama a `resolverAcceso` en su modo de "fallo por tiempo", que escribe `activo` si hay sesión aprobada ya cargada o `sin_sesion` si no la hay.

## 5. Vigilante de sesión

Un único efecto con dependencias `[estadoAcceso, location.pathname]` separado en dos partes internas:

- Efecto A `[estadoAcceso]`: si no es `activo`, no hace nada. Si lo es: intervalo de 20 s, listeners de focus y visibilitychange, y guarda el pathname actual como punto de partida. La limpieza lo desmonta todo en cuanto el estado cambia.
- Efecto B `[location.pathname, estadoAcceso]`: solo si es `activo` y el pathname es distinto del guardado; se salta así el primer pathname tras entrar.
- `comprobarSesion` sale inmediatamente si el estado no es `activo` (leído desde una ref sincronizada), además de la marca anti-solapamiento actual. Tras el `await` comprueba también la generación.
- Expulsión: evento `sesion_expulsada`, aviso actual, limpieza de la marca de login y de `crm_sesion_id`, `signOut({ scope: 'local' })` con límite de 4 s, `limpiarEstadoLocal()`. El `SIGNED_OUT` lleva a `sin_sesion` y la pantalla de acceso, sin cuelgues.

## 6. Campos del contexto (mismos nombres y tipos)

```text
isLoading      = estadoAcceso === 'cargando'
controlListo   = estadoAcceso !== 'cargando'
pideCodigoAlta = estadoAcceso === 'pide_codigo'
isApproved     = estadoAcceso in ('pide_codigo','denegado','activo')
```

`session`, `user`, `role`, `authError`, `employeeCode`, `delegacion`, `verMargen`, `dashboards`, `codigoError` siguen siendo estado de datos (escritos solo por `resolverAcceso` y la limpieza). Se añade `estadoAcceso`.

## 7. Qué desaparece y por qué

- Estados `isLoading`, `isApproved`, `pideCodigoAlta`, `controlListo`: pasan a derivarse de `estadoAcceso`; ya no pueden contradecirse entre sí.
- `controlHechoPara` (ref): lo sustituye la generación y el hecho de que la cadena solo se lanza en `SIGNED_IN`/`SIGNED_OUT`/sesión inicial.
- Efecto que lanza `evaluarControl` al cambiar user/isApproved: sustituido por el paso 4 de la cadena.
- Efecto que pone `controlListo` a false/true: sustituido por `cargando` al inicio de la cadena.
- `setTimeout` con `fetchUserData` + `setIsLoading(false)` en cada evento de auth (incluido el refresco de token): sustituido por el disparo selectivo de `resolverAcceso`.
- Escrituras de veredicto en `evaluarControl` (`setPideCodigoAlta`, `setControlListo` en el finally): ahora devuelve un resultado y no escribe el veredicto.
- Los dos efectos del vigilante con guardas repetidas (`user`, `isApproved`, `pideCodigoAlta`, `controlListo`): sustituidos por la única condición `estadoAcceso === 'activo'`.

## 8. Se conserva exactamente

Evento `logout` con `esperar: true` antes de `signOut`; `cerrar_sesion` y borrado de `crm_sesion_id`; eventos `dispositivo_alta`, `codigo_usado`, `codigo_invalido`, `dispositivo_denegado`, `sesion_expulsada` con los mismos datos; máximo 3 intentos de código; aviso de equipo no autorizado con el identificador; se deja pasar ante error de red.

## Verificación

- Build y typecheck limpios.
- Entrar a la primera sin aviso de expulsión; sin destello del CRM antes de la pantalla del código.
- Equipo nuevo: pantalla de código; código erróneo tres veces cierra sesión.
- Dos pestañas normales del mismo equipo conviven; cerrar sesión en una deja la otra en la pantalla de acceso con el aviso.
- Segundo equipo con sesiones_max=1: la pestaña perdedora se cierra con cierre local.
