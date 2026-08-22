# Eliminar la sección Compras

Compras fue una prueba temprana con datos inventados. Se retira por completo: página, importador y tabla.

## Frontend
- Borrar `src/pages/Compras.tsx`.
- En `src/App.tsx`: quitar el import de `Compras` (línea 13) y la ruta `/compras` (línea 124).

## Importador de datos
- Borrar `src/lib/datasets/compras.ts`.
- En `src/lib/datasets/index.ts`: quitar el import de `comprasDataset` y su entrada del array `DATASETS`. Los otros tres datasets (maestroIsi, visitasHistorico, bloquesExtraccion) quedan igual.

## Base de datos (una sola migración)
Orden exacto, porque `user_dashboard_access.dashboard_key` tiene clave foránea contra `dashboards.key`:

```text
1. DELETE FROM public.user_dashboard_access WHERE dashboard_key = 'compras';
2. DELETE FROM public.dashboards WHERE key = 'compras';
3. DROP TABLE IF EXISTS public.compras CASCADE;
```

El `CASCADE` arrastra índices, políticas RLS y el trigger de `updated_at` de la tabla.

## Verificación
- `rg -n "compras" src/` solo debe devolver los usos legítimos de `ClienteDetalle.tsx` (`ultima_compra` y "Sin compras registradas"), que no se tocan.
- `tsgo` sin errores.
- El menú lateral se genera desde la tabla `dashboards`, así que la entrada Compras desaparece al borrar esa fila; se comprueba en el preview.

## Notas técnicas
- `src/integrations/supabase/types.ts` es autogenerado: la entrada `compras` desaparecerá sola tras la migración.
- Las migraciones históricas que crearon la tabla no se editan; solo se añade la migración de retirada.
- No se toca ninguna otra tabla, dataset, ruta ni entrada de menú.
