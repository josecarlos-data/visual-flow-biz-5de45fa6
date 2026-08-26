# Optimización de arranque, robustez y caché en App.tsx

## Objetivo
Mejorar el arranque, la robustez ante errores y el rendimiento percibido de la aplicación con tres cambios concentrados en `src/App.tsx` y un componente nuevo. No se modificará ninguna página, hook, consulta, migración ni archivo de configuración de paquetes.

## Cambios previstos

### 1) Configurar `QueryClient` con opciones globales por defecto

Sustituir en `src/App.tsx` (línea 34) la instancia vacía:

```text
const queryClient = new QueryClient();
```

por una instancia con `defaultOptions.queries`:

```text
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

Restricciones:
- No modificar los `staleTime` que ya declaran individualmente los hooks en `src/hooks/useCrm.ts`, `src/hooks/useObjetivos.ts` y `src/hooks/useHistoricoData.ts`; esos valores seguirán prevaleciendo sobre el global.
- No tocar ninguna llamada a `invalidateQueries` ni a `refetchOnMount` si existiera.

### 2) Crear `src/components/ErrorBoundary.tsx`

Nuevo componente de clase con:
- `static getDerivedStateFromError` para activar el estado de error.
- `componentDidCatch` para loguear el error mediante `console.error`.
- UI de error consistente con `AuthErrorScreen` (tarjeta centrada, título, explicación breve, mensaje de error en bloque `bg-muted`, botones "Recargar" y "Volver al inicio").

Comportamiento de los botones:
- "Recargar" → `window.location.reload()`.
- "Volver al inicio" → `window.location.href = "/"`.

Integración en `src/App.tsx`:
- Envolver con `<ErrorBoundary>` el contenido dentro de `<BrowserRouter>`, por fuera de `<Routes>`.
- NO envolver `<AuthProvider>` ni `<QueryClientProvider>` para no impedir el cierre de sesión si fallan.

### 3) Carga diferida de rutas con `React.lazy`

En `src/App.tsx`:
- Convertir todos los imports de páginas de `src/pages` a `React.lazy`, **excepto** `Auth` y `NotFound`, que permanecen como import estático.
- Envolver `<Routes>` en `<Suspense fallback={<LoadingScreen />}>`.
- `LoadingScreen` ya existe y ya está importado en el fichero.

Objetivo de rendimiento:
- El parser `@e965/xlsx` arrastrado por `src/pages/AdminData.tsx` deja de formar parte del bundle inicial.
- Cada ruta se convierte en un chunk separado.

## Ficheros afectados
- `src/App.tsx` (modificado).
- `src/components/ErrorBoundary.tsx` (nuevo).

## Ficheros explícitamente NO tocados
- `supabase/` (sin migraciones).
- `package.json`.
- Cualquier página bajo `src/pages/`.
- Cualquier hook bajo `src/hooks/`.

## Verificación
1. `tsgo` limpio y `bun run build` exitoso.
2. El build genera chunks separados por ruta, no un único bundle.
3. Navegar entre secciones y volver atrás no vuelve a disparar las consultas dentro de los 5 minutos (gracias al `staleTime` global).
4. Cambiar de pestaña del navegador y volver no recarga los datos (`refetchOnWindowFocus: false`).
