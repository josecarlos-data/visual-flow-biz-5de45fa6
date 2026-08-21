# Plan: Corregir obtención de vendedores y delegaciones en AdminUsers

## Objetivo
Eliminar el límite de 1.000 filas de PostgREST en la pestaña de gestión de usuarios (`src/pages/AdminUsers.tsx`) para que los desplegables de vendedores y delegaciones muestren todos los valores reales de la base de datos, no solo los del primer bloque de clientes.

## Alcance
- Solo se toca `src/pages/AdminUsers.tsx`.
- No se modifican edge functions, SQL, migraciones, RLS, hooks ni componentes de UI.
- No se alteran las funciones de asignación de vendedor, delegación, rol ni permisos de dashboard.

## Cambios técnicos

### 1. Reemplazar consulta a `clientes` por RPCs
En `fetchData`, dentro del `Promise.all` inicial, sustituir:

```typescript
supabase.from("clientes").select("vendedor, delegacion")
```

por las dos llamadas a funciones RPC ya existentes y tipadas:

```typescript
supabase.rpc("get_distinct_vendedores"),
supabase.rpc("get_distinct_delegaciones"),
```

Ambas devuelven un array de filas con un único campo (`vendedor` o `delegacion`) y ya ordenan los resultados en el servidor.

### 2. Mapear resultados directamente
Tras recibir las respuestas, mapear el campo de cada fila a un array de strings:

```typescript
setVendedores((vendedoresRes.data ?? []).map((d) => d.vendedor));
setDelegaciones((delegacionesRes.data ?? []).map((d) => d.delegacion));
```

No se necesita `Set` ni `.sort()` porque las funciones RPC ya devuelven los valores distintos y ordenados.

### 3. Limpieza
Eliminar la variable `clientesRes` y la constante `clientes`. Eliminar el bloque que construye `uniqueVendedores` y `uniqueDelegaciones` con `new Set(...)`.

## Referencia de implementación
El patrón ya se utiliza en `src/hooks/useHistoricoData.ts` (funciones `useVendedores` y `useDelegaciones`), que mapean directamente el resultado de cada RPC.

## Verificación
- `tsgo` debe pasar sin errores de tipado.
- En el preview, el desplegable de vendedores en la gestión de usuarios debe mostrar todos los vendedores disponibles (no solo 3).
