# Vaciar la caché de React Query al cambiar de usuario

Sin SQL. Un solo fichero: `src/hooks/useAuth.tsx`.

## Problema
El `QueryClient` de `src/App.tsx` guarda datos 5 minutos y nunca se vacía al cambiar de usuario. Al cerrar sesión y entrar con otra cuenta en el mismo navegador se ven datos del usuario anterior hasta que caducan o se recarga la página: fuga de datos entre usuarios en equipos compartidos.

## Verificación previa
`AuthProvider` está dentro de `QueryClientProvider` (`src/App.tsx`, líneas 197–202: `QueryClientProvider` → … → `BrowserRouter` → `AuthProvider`), así que `useQueryClient()` funciona dentro de `useAuth.tsx` sin cambiar el orden de los proveedores.

## Cambios

### 1. En `limpiarEstadoLocal` (líneas 349–353)
- Añadir `const queryClient = useQueryClient();` en el cuerpo de `AuthProvider`.
- Llamar a `queryClient.clear()` ANTES de `void resolverAcceso(null);`.
- Cubre cierre manual, expulsión, bloqueo y denegación (todas pasan por `limpiarEstadoLocal`).

```ts
const limpiarEstadoLocal = () => {
  fijarSesion(null);
  ultimoPathnameComprobado.current = null;
  queryClient.clear();
  void resolverAcceso(null);
};
```

### 2. En `resolverAcceso` (dentro de la rama `!reintentoCodigo`)
- Nuevo `const ultimoUsuarioAcceso = useRef<string | null>(null);`.
- Cuando la sesión que llega pertenece a un usuario DISTINTO del último que tuvo acceso, llamar a `queryClient.clear()` antes de `fijar("cargando")` y de cargar su perfil.
- Marcar `ultimoUsuarioAcceso.current = userId;` junto a `datosCargadosPara.current = userId;` (cuando el usuario pasa a activo).
- No se resetea a null en la rama de sesión nula: así un inicio posterior con otro usuario limpia la caché aunque el logout anterior haya fallado a medias; si el logout ya la limpió, `clear()` es idempotente y no daña nada.

```ts
if (!reintentoCodigo) {
  if (ultimoUsuarioAcceso.current && ultimoUsuarioAcceso.current !== userId) {
    queryClient.clear();
  }
  fijar("cargando");
  ...
  datosCargadosPara.current = userId;
  ultimoUsuarioAcceso.current = userId;
}
```

## Nada más
- No se toca `App.tsx`, ni el orden de proveedores, ni ningún otro fichero.
- Los refetches activos al vaciar se detienen solos (comportamiento de `queryClient.clear()`).

## Verificación
- `tsgo` typecheck y build limpios.
- Prueba manual sugerida: cerrar sesión y entrar con otra cuenta; los listados (Clientes, Documentos, Visitas) deben recargar datos propios sin mostrar los del usuario anterior.
