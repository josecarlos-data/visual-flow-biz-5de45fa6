# Reordenación de layout en src/pages/Ventas.tsx

## Objetivo
Reorganizar visualmente el cuerpo de la página de Ventas en tres filas independientes, manteniendo intactas las consultas, hooks, cálculos, enlaces y el contenido interno de cada tarjeta. Solo se modifica `src/pages/Ventas.tsx`.

## Estructura actual (única rejilla)
Hoy todo el contenido vive dentro de un único `grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3` con 7 Cards y col-spanes variados.

## Estructura nueva

### Fila 0 — sin cambios
- `<ResumenObjetivos />`
- Fila de KPIs (`grid grid-cols-2 sm:grid-cols-3 ...`)

### Fila A — tres columnas iguales
```text
<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0 xl:h-[560px]">
```

| Columna | Contenido | Clases a añadir |
| --- | --- | --- |
| 1 | Card "Top 10 clientes" | `h-full flex flex-col` en `<Card>`; `flex-1 overflow-y-auto` en `CardContent` |
| 2 | Card "Alertas comerciales" | `h-full flex flex-col` en `<Card>`; quitar `lg:col-span-2 2xl:col-span-1`; `flex-1 overflow-y-auto` en `CardContent` |
| 3 | `<div>` contenedor de dos tarjetas apiladas | `grid gap-4 h-full flex-col` (o `grid gap-4 h-full flex`); `h-full flex flex-col` en cada Card |
| 3a | Card "Top familias" | `flex-1 min-h-[160px]` en `CardContent` (sustituye `h-[200px] 2xl:h-[240px]`) |
| 3b | Card "Top marcas" | `flex-1 min-h-[160px]` en `CardContent` (sustituye `h-[200px] 2xl:h-[240px]`) |

### Fila B — dos columnas
```text
<div className="grid items-start gap-4 xl:grid-cols-3 [&>*]:min-w-0">
```

| Columna | Contenido | Clases a añadir |
| --- | --- | --- |
| 1 | Card "Mix por canal" | `h-full flex flex-col`; `flex-1` en `CardContent` |
| 2-3 | Card "Evolución mensual" | `xl:col-span-2`, `h-full flex flex-col`; `flex-1 min-h-[260px]` en `CardContent` (sustituye `h-[260px] sm:h-[300px] 2xl:h-[420px]`) |

### Fila C — ancho completo
- Card "Devoluciones" fuera de cualquier grid, con `w-full` implícita por ser hijo directo del contenedor `space-y-4 sm:space-y-6`.

## Skeleton de carga
Sustituir la rejilla única actual del skeleton por tres filas que reproduzcan la nueva estructura:

1. Fila A:
   ```text
   <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0 xl:h-[560px]">
     <Skeleton className="h-full" />   // Top 10 clientes
     <Skeleton className="h-full" />   // Alertas comerciales
     <div className="grid gap-4 h-full">
       <Skeleton className="h-full" /> // Top familias
       <Skeleton className="h-full" /> // Top marcas
     </div>
   </div>
   ```
2. Fila B:
   ```text
   <div className="grid items-start gap-4 xl:grid-cols-3 [&>*]:min-w-0">
     <Skeleton className="h-full min-h-[260px]" /> // Mix por canal
     <Skeleton className="h-full min-h-[260px] xl:col-span-2" /> // Evolución mensual
   </div>
   ```
3. Fila C:
   ```text
   <Skeleton className="h-64 w-full" /> // Devoluciones
   ```

## Restricciones
- No modificar RPCs, hooks, consultas, cálculos, estados ni la lógica de proyección.
- No tocar los `<Link>` de drill-down ni los selectores de métrica/vista.
- No alterar el contenido interno de las Cards (gráficos, listados, Tabs).
- No crear migraciones ni modificar `supabase/`.
- Preservar anti-desbordamientos ya aplicados (`min-w-0`, `truncate`).

## Verificación
1. `tsgo` limpio y `bun run build` exitoso.
2. En 360 px de ancho: sin scroll horizontal; el orden vertical es exactamente objetivos/KPIs → Top 10 clientes → Alertas → Top familias → Top marcas → Mix por canal → Evolución mensual → Devoluciones.
3. En `xl` y superiores: Fila A mide 560 px de alto y las tres columnas se alinean arriba (`items-start`); Fila B alinea Mix por canal y Evolución mensual arriba; Devoluciones ocupa todo el ancho.
