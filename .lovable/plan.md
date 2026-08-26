# Reorganización de rejilla en src/pages/Ventas.tsx

## Objetivo
Reordenar las Cards del panel de Ventas en un único contenedor de rejilla responsive, manteniendo KPIs, ResumenObjetivos, gráfico, selectores, drill-down y la lógica de cálculo intactos.

## Cambios en src/pages/Ventas.tsx

### 1. Nuevo orden y contenedor único
Eliminar los dos `<div className="grid ...">` actuales (el de Mix/Devoluciones/Alertas y el de Top clientes + familias/marcas) y el `<div className="grid gap-4">` anidado que apila Top familias y Top marcas.

Sustituirlos por un único contenedor:

```text
<div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
```

Las Cards irán como hijas directas en este orden:

1. Evolución mensual
2. Top 10 clientes
3. Alertas comerciales
4. Top familias
5. Top marcas
6. Mix por canal
7. Devoluciones

### 2. Anchos por Card

| Card | Clases de col-span |
| --- | --- |
| Evolución mensual | `lg:col-span-2 2xl:col-span-2` |
| Top 10 clientes | (por defecto, 1 columna) |
| Alertas comerciales | (por defecto, 1 columna); quitar `lg:col-span-2 2xl:col-span-1` que lleva hoy |
| Top familias | (por defecto, 1) |
| Top marcas | (por defecto, 1) |
| Mix por canal | (por defecto, 1) |
| Devoluciones | `2xl:col-span-2` |

### 3. Alturas

- Evolución mensual: `CardContent className="h-[260px] sm:h-[300px] 2xl:h-[420px]"`.
- Top familias y Top marcas: `CardContent className="h-[200px] 2xl:h-[240px]"`.

### 4. Skeleton de carga
Actualizar el bloque `if (loading)` para reflejar la nueva rejilla:

- Mantener los Skeleton de KPIs y `ResumenObjetivos` sin tocar.
- El Skeleton de Evolución mensual ya existe (`h-[260px] sm:h-[300px]`).
- Sustituir los dos grupos de Skeleton actuales por siete Skeleton que representen las nuevas Cards:
  - 1 Skeleton ancho completo con `lg:col-span-2 2xl:col-span-2` (Evolución mensual).
  - 6 Skeleton de altura fija (`h-64`, por ejemplo) para el resto, donde el último tenga `2xl:col-span-2` (Devoluciones).
- Usar el mismo contenedor `grid gap-4 lg:grid-cols-2 2xl:grid-cols-3` para el skeleton.

### 5. Restricciones
- No modificar la sección de KPIs ni `<ResumenObjetivos />`.
- No cambiar los `<Link>` de drill-down ni los selectores Ventas/Ticket medio/Mensual/Acumulada.
- No alterar el cálculo de la proyección ni los datos mostrados.
- Preservar los ajustes anti-desbordamiento ya aplicados (`min-w-0`, `truncate`, barras de progreso acotadas).

## Verificación

1. `tsgo` limpio y `bun run build` exitoso.
2. Con Playwright o inspección responsive, comprobar que en 360 px de ancho:
   - el orden vertical es exactamente el especificado;
   - no aparece scroll horizontal en ninguna sección;
   - Evolución mensual, Top familias y Top marcas respetan las alturas pedidas.
3. Revisar visualmente en lg y 2xl que no queden huecos en la rejilla.
