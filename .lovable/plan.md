# Migración panel_devoluciones + descripción en Referencias

## 1) Migración SQL: añadir `descripcion` a `public.panel_devoluciones`

- `DROP FUNCTION IF EXISTS public.panel_devoluciones(integer, integer);` para evitar el error de cambio de tipo de retorno (pasa de 4 a 5 columnas).
- Recrear la función con:
  - `RETURNS TABLE(tipo text, etiqueta text, descripcion text, importe numeric, lineas integer)`
  - `LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'`
  - Rama `motivo` y `vendedor`: devuelven `NULL::text` como `descripcion`.
  - Rama `referencia`: hacer `LEFT JOIN public.productos p ON p.referencia = a.referencia`, incluir `p.descripcion` en el `SELECT` y en el `GROUP BY`. Mantener el mismo `ORDER BY ABS(SUM(importe)) DESC` y `LIMIT`.
- Al final volver a otorgar: `GRANT EXECUTE ON FUNCTION public.panel_devoluciones(integer, integer) TO authenticated;`.
- No tocar ninguna otra función.

## 2) `src/pages/Ventas.tsx`

- Ampliar la interfaz `DevolucionRow` con `descripcion: string | null`.
- En el mapeo del resultado de `panel_devoluciones`, añadir `descripcion: r.descripcion ?? null`.
- Solo dentro de la pestaña `"Referencias"` (no en "Motivos" ni "Vendedores"):
  - El bloque izquierdo pasa a ser un `<span className="min-w-0">` que contiene:
    - Primera línea: `<span className="truncate">{d.etiqueta}</span>`.
    - Segunda línea (solo si `d.descripcion` no es null ni vacía): `<span className="block truncate text-xs text-muted-foreground">{d.descripcion}</span>`.
  - Mantener el `<div className="flex min-w-0 items-center justify-between gap-3 ...">` de la fila.
  - La fila sigue siendo `<div>` (sin enlace) en "Referencias" y "Vendedores"; "Motivos" conserva su `<Link>` actual.

## 3) Verificación

- `tsgo` limpio y `bun run build` exitoso.
- Revisar visualmente la pestaña Referencias para confirmar que la descripción aparece como segunda línea pequeña y que no hay scroll horizontal.
