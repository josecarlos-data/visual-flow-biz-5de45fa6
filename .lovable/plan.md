# Variación por referencia en la pestaña Productos

## Aviso previo: hay un llamador con la firma antigua

La verificación pedida en el punto 6 encuentra **un llamador fuera del frontend**:
`supabase/functions/cliente-insights/index.ts` (línea 72) invoca
`cliente_top_productos` con `{ _cod, _anio: null }`. Al hacer DROP de la firma
`(integer, integer)`, esa llamada fallaría y el análisis IA de la ficha dejaría
de generarse.

Propuesta (mínima, dentro del espíritu del plan): actualizar esa llamada a la
nueva firma con el equivalente de "todos los años":
`{ _cod, _desde: "2000-01-01", _hasta: <hoy>, _desde_prev: null, _hasta_prev: null }`,
y redesplegar la función. No se cambia su prompt ni su lógica.
El resto de coincidencias del grep son ficheros de migraciones ya aplicados
(histórico), que no se re-ejecutan.

## 1) Migración

Un único fichero, en este orden:

1. `DROP FUNCTION IF EXISTS public.cliente_top_productos(integer, integer);`
2. `CREATE FUNCTION public.cliente_top_productos(_cod integer, _desde date, _hasta date, _desde_prev date DEFAULT NULL, _hasta_prev date DEFAULT NULL)`
   `RETURNS TABLE(referencia text, descripcion text, familia text, marca text, unidades numeric, importe numeric, margen numeric, ultima_compra date, unidades_anterior numeric, importe_anterior numeric)`
   `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'`
3. `GRANT EXECUTE ON FUNCTION public.cliente_top_productos(integer, date, date, date, date) TO authenticated;`

Cuerpo, igual que hoy salvo lo indicado:

- Se conserva `IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;`
  y `v_margen := public.puede_ver_margen(auth.uid());`.
- WHERE con una sola pasada:
  `v.cod_cliente = _cod AND v.fecha >= LEAST(_desde, COALESCE(_desde_prev,_desde)) AND v.fecha <= GREATEST(_hasta, COALESCE(_hasta_prev,_hasta))`.
- Periodo actual: `COALESCE(SUM(v.unidades) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0)` e ídem para importe.
- Margen: `CASE WHEN v_margen THEN COALESCE(SUM(v.margen) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta),0) ELSE 0 END`.
- `ultima_compra`: `MAX(v.fecha) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta)`.
- Periodo anterior: `COALESCE(SUM(...) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0)`.
- GROUP BY idéntico al actual (referencia, descripción y los COALESCE de familia y marca).
- `ORDER BY GREATEST(COALESCE(<importe_actual>,0), COALESCE(<importe_anterior>,0)) DESC LIMIT 500`
  (expresiones repetidas en el ORDER BY, ya que no hay alias de salida usable en plpgsql RETURN QUERY).

Como el rango completo puede abarcar dos periodos, en "Todos los años"
(`_desde = 2000-01-01`) el escaneo es el mismo que hoy con `_anio IS NULL`.

## 2) Hook `useCrm.ts`

- `ProductoCliente` gana `unidades_anterior: number` e `importe_anterior: number`.
- `useClienteProductos(cod, rango)` con
  `rango: { desde: string; hasta: string; desdePrev: string | null; hastaPrev: string | null }`;
  `queryKey: ["crm_cliente_productos", cod, desde, hasta, desdePrev, hastaPrev]`;
  RPC con `_desde/_hasta/_desde_prev/_hasta_prev`.
- Mapeo con `Number(... ?? 0)` para los dos campos nuevos.

## 3) Selector de periodo (`ClienteDetalle.tsx`)

- Estado `periodoProd`, por defecto `"12m"`. Se elimina `anioProdInicializado` y su `useEffect`.
- Cálculo del rango con `useMemo`, siempre en hora local vía `isoLocal()`:
  - `12m`: hasta = hoy, desde = hoy − 12 meses; prev = los 12 meses inmediatamente anteriores (desde − 12 meses … desde − 1 día).
  - Año `Y` (de la lista `anios` ya existente): desde = 1 ene Y; hasta = 31 dic Y, o hoy si Y es el año en curso; prev = mismas fechas desplazadas un año atrás.
  - `todos`: desde = 2000-01-01, hasta = hoy, prev = `null`.
- Items del Select: "Últimos 12 meses", un item por año, "Todos los años".

## 4) Columna Variación

- Cabecera y celdas solo si hay periodo de comparación (`desdePrev != null`); si no, no se renderiza nada.
- Posición: entre "Importe" y "Última", `text-right hidden md:table-cell`, ordenable como el resto.
- Contenido por fila:
  - anterior > 0 y actual > 0 → `(actual − anterior)/anterior` con un decimal, verde (`text-primary`) al subir y rojo (`text-destructive`) al bajar, con `ChevronUp`/`ChevronDown`; debajo, `text-xs text-muted-foreground` con el importe anterior en `eur(..., 2)`.
  - anterior > 0 y actual = 0 → "−100 %" en rojo y debajo "sin compras".
  - anterior = 0 y actual > 0 → `Badge` pequeño "Nueva".
- Móvil: bajo el importe, segunda línea `text-xs md:hidden` con el mismo porcentaje y color (solo cuando hay comparación).
- Orden: `CampoOrden` incorpora `"variacion"`; el comparador usa el porcentaje calculado y manda las filas sin comparación posible ("Nueva") al final en ambas direcciones.

## Fuera de alcance

No se tocan `cliente_documentos`, `cliente_documento_lineas`, las tarjetas KPI ni otras pantallas sobre `ventas_diarias`.

## Verificación

- La migración hace DROP con la firma exacta `(integer, integer)` antes del CREATE y termina con el GRANT EXECUTE sobre `(integer, date, date, date, date)`.
- Tras el cambio, los únicos llamadores vivos serán `useCrm.ts` y la edge function `cliente-insights` (ambos con la nueva firma).
- Build y `tsgo` limpios; comprobación en preview de los tres periodos y de la columna en escritorio y móvil.
