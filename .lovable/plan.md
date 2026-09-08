# Tres correcciones del control de acceso (sin SQL)

## 1 — Eliminar el destello del CRM antes de saber si el equipo está autorizado

**`src/hooks/useAuth.tsx`**
- Nuevo estado `controlListo`, inicializado a `false`.
- Pasa a `true` solo cuando `evaluarControl` ha terminado, en todas sus ramas, incluida la de error de red (donde se deja pasar). Lo más limpio: en `evaluarControl` hacer `setControlListo(true)` en un `finally`, o justo antes de cada `return`.
- También pasa a `true` cuando no hay control que evaluar: si no hay usuario o no está aprobado, no hay nada que esperar (el gate solo aplica a usuarios autenticados y aprobados). Para que la pantalla de login y la de pendiente de aprobación no se queden cargando, el efecto que dispara `evaluarControl` hará `setControlListo(true)` directamente cuando `!user || !isApproved`.
- En `signOut`, reset a `controlListo = false` junto al resto del estado.
- Exponer `controlListo` en el tipo del contexto, valor por defecto y Provider.

**`src/App.tsx`**
- `ControlAcceso` lee también `controlListo`: si es `false`, renderiza `<LoadingScreen />` y nada más. Ni rutas, ni menú lateral, ni un píxel del CRM.
- Orden de render: `controlListo === false` → carga; si no, `pideCodigoAlta` → pantalla de código; si no, la app.

## 2 — Expulsión de sesión más rápida (useAuth.tsx)

En el efecto de `verificar_sesion`:
- Intervalo de 60000 a 20000 ms.
- Nuevo listener `visibilitychange`: lanza la comprobación cuando `document.visibilityState === "visible"`. Se mantiene el de `focus`. Ambos se eliminan en la limpieza del efecto.
- Comprobación al cambiar de ruta: `useLocation()` dentro de `AuthProvider` (ya está bajo `BrowserRouter` en App.tsx, así que es válido) y un efecto que llama a `comprobar` cuando cambia `location.pathname`, con las mismas guardas (`user && isApproved && !pideCodigoAlta`).
- Marca anti-solape: `comprobando = useRef(false)`; al entrar, si ya es `true` se sale; si no, se pone a `true` y se libera en `finally`. La marca vive fuera para compartirla entre el intervalo, los listeners y el efecto de ruta — para ello `comprobar` se define con `useCallback` y ambos efectos la usan.

## 3 — Desbordamiento de DispositivosUsuarioDialog

**`src/components/DispositivosUsuarioDialog.tsx`**
- `DialogContent`: ancho responsivo sin scroll horizontal — `w-[calc(100vw-2rem)] max-w-2xl` (o equivalente) para que nunca supere el viewport en móvil.
- User-agent: `truncate` (una línea con puntos suspensivos) y `title={d.user_agent}` con el texto completo. La clase `truncate` incluye `overflow-hidden`, así que no puede ensanchar el contenedor.
- Lista de equipos: contenedor con `max-h-… overflow-y-auto` propio, para que muchos equipos hagan scroll dentro de la lista en vez de estirar el diálogo.
- Verificación en móvil (viewport estrecho) de que no aparece scroll horizontal en ninguna parte del diálogo.

## Fuera de alcance
No se toca `registrar_sesion`, ninguna RPC ni SQL. No se toca la lógica de guardado ni otros ficheros.

## Verificación
- Build y typecheck limpios.
- Recarga con sesión activa: solo se ve el indicador de carga hasta que termina la comprobación; nunca el CRM.
- Equipo que necesita código: pantalla de código directa, sin destello previo.
- Sesión expulsada desde otro equipo: en ≤20 s, al volver a la pestaña o al cambiar de sección, cierra sesión.
- Diálogo de equipos: user-agent truncado con tooltip, lista con scroll propio, sin scroll horizontal en móvil.
