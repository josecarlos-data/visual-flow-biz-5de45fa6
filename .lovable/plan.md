# Rehacer la estructura de rejillas de src/pages/Ventas.tsx

El build anterior no se aplicó: el archivo sigue con `xl:h-[560px]`, `xl:h-[420px]`, el `grid grid-rows-2` que apila familias/marcas, Alertas con col-span y Devoluciones como Card suelta. Solo se toca estructura visual (clases y orden de las Cards); no se tocan drill-down, selectores Ventas/Ticket ni Mensual/Acumulada, proyección, KPIs, ResumenObjetivos ni los min-w-0/truncate ya aplicados.

## 1. Eliminar alturas fijas de contenedor

Quitar `xl:h-[560px]` de la rejilla A, `xl:h-[420px]` de la rejilla B y los `h-full` de las Cards que dependían de ellas. Las Cards crecen con su contenido; los CardContent que usaban `flex-1 overflow-y-auto` se quedan sin altura fija y sin scroll interno forzado (Top 10 clientes, Alertas, Mix por canal pasan a `space-y-2` plano).

## 2. Rejilla A — cuatro Cards hermanas

```text
<div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
  1. Top 10 clientes
  2. Alertas comerciales   (sin "lg:col-span-2 2xl:col-span-1")
  3. Top familias          (sacada del grid-rows-2)
  4. Top marcas            (sacada del grid-rows-2)
</div>
```

- Eliminar el `<div className="grid grid-rows-2 gap-4 h-full">` (líneas ~449-479): familias y marcas pasan a ser hermanas directas dentro de la rejilla.
- `2xl:grid-cols-3`, no `xl`: en portátiles de 14"-15,6" quedan dos columnas.
- CardContent de Top familias y Top marcas: `h-[220px]` (sustituye al `flex-1 min-h-[160px]`) para que el gráfico tenga altura estable sin estirar la fila.

## 3. Rejilla B — tres Cards a un tercio

```text
<div className="grid items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0 order-first lg:order-none">
  5. Mix por canal
  6. Devoluciones          (Card suelta actual, se mueve dentro)
  7. Evolución mensual     (className "order-first lg:order-none")
</div>
```

- Sin col-span en ninguna: se quita el `xl:col-span-2` de Evolución mensual.
- Devoluciones (líneas ~597-…, hoy Card suelta fuera de rejilla) pasa a ser la segunda Card de la rejilla B, con su Tabs de Motivos/Referencias/Vendedores intacto.
- Orden en móvil sin duplicar DOM: la rejilla B lleva `order-first lg:order-none` (sube entera justo debajo de los KPIs en móvil) y dentro de ella la Card de Evolución mensual lleva `order-first lg:order-none` para preceder a Mix por canal y Devoluciones.

## 4. Alturas de CardContent

- Evolución mensual: `h-[260px] sm:h-[300px] 2xl:h-[340px]` (sustituye `flex-1 min-h-[260px]`).
- Top familias / Top marcas: `h-[220px]`.
- Resto (Top 10 clientes, Alertas, Mix por canal, Devoluciones): sin altura fija.
- Ningún contenedor de rejilla lleva altura.

## 5. Skeleton (líneas ~257-281)

Mismo patrón: rejilla A con `items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3` (4 skeletons `h-64`, sin `grid-rows-2` ni alturas de contenedor) y rejilla B con `items-start gap-4 lg:grid-cols-3` (3 skeletons `h-64`, el tercero con `order-first lg:order-none` en su contenedor). Se elimina el `Skeleton className="h-64 w-full"` final suelto.

## 6. No tocar

Drill-down a /documentos, toggles Ventas/Ticket medio y Mensual/Acumulada, cálculo de proyección (`factorProy`), KPIs, ResumenObjetivos, línea punteada de proyección, min-w-0 y truncate existentes.

## Verificación

- `tsgo` + build.
- Playwright a 360 px: sin scroll horizontal; la primera Card tras los KPIs es "Evolución mensual".
- Playwright a 1920 px: rejilla A en 3 columnas, rejilla B en 3 tercios, ninguna Card se solapa con otra.
