# Reconstruir el bloque de rejillas de src/pages/Ventas.tsx

Reescritura completa de la zona de layout. No se toca la carga de datos, las RPC, los drill-down a `/documentos`, los toggles Ventas/Ticket medio y Mensual/Acumulada, ni el cálculo de proyección.

Estado actual verificado: raíz en `flex flex-col gap-4 sm:gap-6`, `order-first lg:order-none` en la rejilla B y en la Card de Evolución mensual, dos rejillas de contenido, Top familias y Top marcas como Cards separadas con `h-[220px]`, y el margen del Top 10 renderizado como `{((c.margen / c.importe) * 100).toFixed(1)}%` sin etiqueta.

## 1. Contenedor raíz

Volver a `<div className="space-y-4 sm:space-y-6">` en la vista normal y en el skeleton. Eliminar toda clase `order-*` del fichero (rejilla B y Card de Evolución mensual, más el skeleton). El orden del DOM manda en todos los tamaños.

Orden de bloques hijos del raíz: título, aviso de error, `<ResumenObjetivos />`, rejilla de KPIs, rejilla de contenido.

## 2. Card única Top familias / Top marcas

Nuevo estado `const [ranking, setRanking] = useState<"familias" | "marcas">("familias");`

Se eliminan las dos Cards actuales y cualquier div envolvente. La nueva Card usa el mismo patrón de cabecera que Evolución mensual: `CardHeader` con `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`, título dinámico `Top familias {anioActual}` / `Top marcas {anioActual}`, y un grupo `inline-flex shrink-0 rounded-md border p-0.5` con dos `Button` `h-7 px-3 text-[11px]` (Familias / Marcas), variante `secondary` para el activo.

Un solo `BarChart` que conmuta las tres cosas a la vez:

```text
data     : ranking === "familias" ? topFamilias : topMarcas
YAxis    : dataKey "familia" | "marca"
Bar fill : getYearColor(anioActual, anioActual) | getYearColor(anioActual - 1, anioActual)
```

Resto igual: layout vertical, `margin left 70`, `YAxis width 70`, `tick fontSize 11`, tickFormatter en miles, Tooltip con `eur()`. Sin consultas nuevas.

## 3. Una sola rejilla de contenido

```text
<div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
  1. Alertas comerciales
  2. Top 10 clientes
  3. Top familias / marcas
  4. Mix por canal
  5. Devoluciones
  6. Evolución mensual
</div>
```

Ninguna hija lleva col-span. Se eliminan: la segunda rejilla, el `grid grid-rows-2`, la Card de Devoluciones suelta (pasa a ser la quinta hija con sus Tabs intactas), y cualquier `xl:h-[560px]`, `xl:h-[420px]`, `xl:col-span-2`, `lg:col-span-2`, `2xl:col-span-1`. Queda exactamente una rejilla de contenido.

## 4. Alturas de CardContent

- Alertas comerciales: `lg:max-h-[480px] lg:overflow-y-auto`
- Top 10 clientes: `lg:max-h-[480px] lg:overflow-y-auto`
- Familias / marcas: `h-[240px] 2xl:h-[420px]`
- Mix por canal y Devoluciones: sin altura
- Evolución mensual: `h-[260px] sm:h-[300px] 2xl:h-[380px]`

Ningún contenedor de rejilla lleva altura.

## 5. Etiqueta del margen en Top 10 clientes

El segundo porcentaje pasa de `29.5%` a `29,5 % margen`, reutilizando `fmtShare` (mismo decimal y separador que la línea "de cartera"): `{fmtShare((c.margen / c.importe) * 100)} margen`.

## 6. Skeleton

Raíz `space-y-4 sm:space-y-6`, la rejilla de KPIs igual que ahora, y una sola rejilla `grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0` con seis `Skeleton h-64`. Sin `order`, sin alturas de contenedor.

## Verificación

- `tsgo` y build.
- Playwright 360 px: ResumenObjetivos primero, luego KPIs, luego las seis Cards en orden 1-6; sin scroll horizontal.
- Playwright 1366 px: dos columnas, Alertas y Top 10 en la misma fila.
- Playwright 1920 px: dos filas de tres, sin solapamientos.
- Toggle Familias/Marcas: cambia título, datos, etiquetas del eje y color de barra.
