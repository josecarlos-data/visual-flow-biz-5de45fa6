# Perfil móvil fluido + buscador/ordenación en Productos

Ficheros: `src/components/ClientePerfilTab.tsx` y `src/pages/ClienteDetalle.tsx`.
Sin migraciones y sin tocar hooks: la RPC `cliente_top_productos` ya devuelve hasta 500 filas; el filtrado y la ordenación se hacen en memoria en el cliente.

## Estado verificado

- `ClientePerfilTab.tsx`: la fila de atributo está en la línea 148 con `flex items-start justify-between gap-3 border-b py-3 last:border-b-0`; el bloque derecho (línea 154) usa `flex shrink-0 items-center gap-2` y el `<span>` del valor no limita su ancho. Coincide con lo descrito.
- `ClienteDetalle.tsx`: la tarjeta "Productos comprados" está en las líneas 666-720. Cabecera `flex-row items-center justify-between gap-2 space-y-0` (línea 668) con el `Select` de año; la tabla tiene las cabeceras Referencia, Familia (`hidden sm:table-cell`), Marca (`hidden md:table-cell`), Uds., Importe, Margen (`hidden md:table-cell`, solo si `verMargen`) y Última (`hidden sm:table-cell`). El mensaje vacío actual es "Sin compras registradas en el periodo." (línea 684).

## A) Perfil en móvil (`ClientePerfilTab.tsx`)

A1. En `FilaAtributo`:
- La fila pasa a `flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3`.
- El bloque derecho pierde `shrink-0` y pasa a `flex w-full items-start gap-2 sm:w-auto sm:justify-end`.
- El `<span>` del valor pasa a `min-w-0 flex-1 break-words text-sm sm:flex-none sm:text-right`, conservando las clases condicionales de color actuales (`text-muted-foreground` si `sinConfirmar`, si no `font-medium text-foreground`). Puede ocupar varias líneas.
- El Badge "sin confirmar" y los botones de confirmar/editar se envuelven en un `div` con `flex shrink-0 items-center gap-2` para que no se compriman ni se envuelvan.

A2. La rama sin dato (botón "Añadir") usa el mismo contenedor derecho ya modificado: el botón conserva su ancho natural en móvil (no se estira, `w-full` lo hereda el contenedor, no el botón) y queda alineado a la derecha en `sm+` vía `sm:justify-end`. Se verifica visualmente.

## B) Productos: buscador y ordenación (`ClienteDetalle.tsx`)

B1. Cabecera de la tarjeta "Productos comprados":
- La cabecera pasa de `flex-row items-center justify-between gap-2 space-y-0` a `flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between`.
- Se añade un `<Input>` con `placeholder="Buscar referencia o descripción"`. El input va envuelto en un `div` con `relative w-full sm:w-64`, el icono `Search` de lucide-react se coloca dentro con `absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none`, y el `Input` lleva `pl-8` para dejar hueco al icono.
- En móvil el buscador ocupa una segunda línea a ancho completo, separado del `Select` por el `gap-2` de la cabecera.

B2. Filtro en memoria sobre el array `productos` (sin nueva consulta):
- Coincidencia por inclusión contra `referencia` y `descripcion`.
- Normalización de ambos lados con `.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()` (insensible a mayúsculas y acentos: "electrovalvula" encuentra "ELECTROVÁLVULA").
- Implementado con `useMemo` dependiente de `productos` y del texto de búsqueda.

B3. Ordenación por columna, en memoria:
- `useState<{ campo, dir }>` inicializado en `{ campo: "importe", dir: "desc" }` (orden de llegada actual).
- Columnas ordenables: Referencia (texto), Familia (texto), Marca (texto), Uds. (numérico), Importe (numérico), Margen (numérico, solo si `verMargen`) y Última (fecha).
- Cada `TableHead` ordenable contiene un `<button>` que alterna asc/desc; al cambiar de columna arranca en `desc` para numéricos/fecha y en `asc` para texto.
- En columnas alineadas a la derecha (Uds., Importe, Margen, Última), el botón lleva `ml-auto flex items-center gap-1` para que la cabecera siga alineada con sus celdas. En columnas de texto (Referencia, Familia, Marca), el botón lleva `flex items-center gap-1`.
- La columna activa muestra `ChevronUp` o `ChevronDown` (`h-3.5 w-3.5`) según la dirección; las demás no muestran icono.
- Los nulos van siempre al final, en ambas direcciones (comparador que los desvía antes de comparar valores).
- Se mantienen intactas las clases `hidden sm:table-cell` / `hidden md:table-cell` de las cabeceras: la ordenación no cambia la visibilidad responsive.
- Ordenación aplicada con `useMemo` sobre el resultado del filtro (encadenados: filtrar → ordenar → renderizar).

B4. Independencia del año: el texto de búsqueda y el estado de ordenación viven fuera del `Select` de año; cambiar `anioProd` solo reconsulta `useClienteProductos` y no reinicia búsqueda ni ordenación (no se resetean en ningún efecto).

B5. Mensajes de vacío diferenciados:
- Si `productos` está vacío → "Sin compras registradas en el periodo." (comportamiento actual, se conserva).
- Si hay productos pero el filtro no devuelve ninguno → "Ningún producto coincide con la búsqueda."

## Fuera de alcance

No se toca `useCrm.ts`, la RPC `cliente_top_productos`, la tabla de Documentos ni los diálogos de edición del perfil (`EditorValor`).

## Verificación

- `tsgo` y build de producción limpios.
- Playwright a 411 px: filas del perfil sin desbordamiento horizontal con un valor largo; buscador de productos en segunda línea a ancho completo; ordenación alternando asc/desc; cambio de año conserva búsqueda y orden.
