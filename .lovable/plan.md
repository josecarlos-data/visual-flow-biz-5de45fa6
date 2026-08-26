# Rediseño de layout en src/pages/Ventas.tsx

Objetivo: aprovechar mejor el ancho de pantallas grandes (~24") y mantener la legibilidad en móvil, sin modificar consultas, hooks, RPCs ni lógica de cálculo. Único archivo afectado: `src/pages/Ventas.tsx`.

## Cambios de layout

### 1) Fila de KPIs

- Rejilla condicional según `verMargen`:
  - `verMargen === true`: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-6`
  - `verMargen === false`: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`
- Renombrar etiqueta `"Transacciones"` a `"Documentos"` (icono e hint sin cambios).
- En el KPI "Facturación", ampliar el hint con la proyección de cierre calculada en cliente a partir de `mensual` y `kpis`:
  - `ytdPrevio` ya existe (línea 170 aprox.).
  - `totalAnioPrevio = mensual.filter(año anterior).reduce(importe)`.
  - `proyeccion = kpiActual.importe * (totalAnioPrevio / ytdPrevio)` si `ytdPrevio > 0`.
  - Hint resultante ejemplo: `"-7,0% vs 2025 YTD · proyección 11,3 M €"`.
  - Si `ytdPrevio === 0`, omitir la parte de proyección.

### 2) Evolución mensual + Ticket medio por mes

- Envolver ambas Cards en `<div className="grid gap-4 lg:grid-cols-2">`.
- Reducir altura del `CardContent` a `h-[240px] lg:h-[260px]`.
- En el YAxis de "Ticket medio por mes", cambiar `width` de 70 a 55.

### 3) Mix por canal + Devoluciones + Alertas comerciales

- Mover la Card "Alertas comerciales" para que comparta franja con "Mix por canal" y "Devoluciones":
  - Contenedor: `<div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">`.
  - Orden: Mix por canal, Devoluciones, Alertas comerciales.
- En "Alertas comerciales":
  - Eliminar `sm:flex-row` del `CardHeader` para que los botones queden siempre debajo del título.
  - Reducir texto de los botones a `text-[11px]`.
- Verificar que el badge de porcentaje en cada fila de alerta mantiene `shrink-0` y no empuja el nombre del cliente (ya truncado).

### 4) Top 10 clientes | Top familias + Top marcas apilados

- Mantener contenedor `<div className="grid gap-4 lg:grid-cols-2">`.
- Columna izquierda: "Top 10 clientes" (sin cambios).
- Columna derecha: `<div className="grid gap-4">` con "Top familias" y "Top marcas" apilados verticalmente.
- Altura del `CardContent` de cada gráfico de barras: `h-[200px]`.
- En ambos `BarChart`:
  - `tick fontSize={10}`
  - `YAxis width={70}`
  - `margin={{ ..., left: 70 }}`
- Eliminar la Card suelta de "Top marcas" que hoy aparece al final de la página.

### 5) Ajustes de móvil

- Espaciado general: `space-y-6` → `space-y-4 sm:space-y-6`.
- En los cuatro gráficos, pasar a `<Legend wrapperStyle={{ fontSize: 11 }} />`.
- En los `BarChart`, fijar `margin left: 70` y `YAxis width={70}` para todos los tamaños.
- Revisar que ninguna Card provoque scroll horizontal en 360 px de ancho.

### 6) Skeleton de carga

- Actualizar para reflejar la nueva estructura:
  - Una tira de KPIs con el número correcto de columnas según `verMargen` (por defecto mostrar 6 u omitir margen).
  - Dos bloques de gráficos en paralelo.

## Restricciones

- No añadir dependencias.
- No modificar textos excepto el cambio "Transacciones" → "Documentos".
- No tocar `panel_ventas_kpis` ni ninguna función SQL.
- No modificar `<Link>` existentes de Top clientes ni de alertas.
