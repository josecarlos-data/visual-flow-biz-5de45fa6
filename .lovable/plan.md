# Ventas: desbordamiento móvil + gráfico unificado con proyección

Trabajo limitado a `src/pages/Ventas.tsx`. Sin RPCs, consultas ni dependencias nuevas.

## Parte 1 — Desbordamiento horizontal (prioritario)

1. Mix por canal: `min-w-0` en la fila flex, `min-w-0` en el nombre del canal (junto a `truncate`), y `truncate` en la línea de detalle (porcentaje · transacciones · ticket · clientes).
2. Devoluciones (las tres pestañas): `min-w-0` en el contenedor flex de cada fila y `min-w-0` en el `span` de la etiqueta.
3. Barra de progreso del mix: ancho acotado `Math.max(0, Math.min(100, share))`; color `bg-destructive` cuando `share < 0`, `bg-primary` en el resto. El texto del porcentaje sigue mostrando el valor real con signo.
4. Componente `Kpi`: el hint pasa de recorte a `whitespace-normal break-words` manteniendo `leading-tight`.
5. Comprobación a 360px de ancho: sin scroll horizontal en ninguna sección (verificación en navegador con captura).

## Parte 2 — Una sola tarjeta de línea

- Se elimina la Card "Ticket medio por mes" y la rejilla `lg:grid-cols-2` que las contenía.
- Queda una Card a ancho completo, título "Evolución mensual", con dos grupos de botones en el header (estilo compacto de Alertas: `size="sm"`, `h-7 px-3 text-[11px]`, contenedor `inline-flex rounded-md border p-0.5`):
  - Grupo A métrica: Ventas | Ticket medio (por defecto Ventas).
  - Grupo B vista: Mensual | Acumulada (por defecto Mensual), visible solo con métrica Ventas.
- Header apilado en móvil, en línea desde `sm`. `CardContent` con `h-[260px] sm:h-[300px]`.
- Series: Ventas+Mensual usa `serieMensual` tal cual; Ventas+Acumulada calcula suma corrida por año solo sobre meses con dato (los meses sin dato quedan sin valor, no a 0); Ticket medio usa `serieTicket` tal cual.

## Parte 3 — Línea de proyección punteada

Solo con métrica Ventas, en vista Mensual y Acumulada. Reutiliza `mensual`, `ytdPrevio`, `mesesConDatos` y `kpiActual`:

```text
factor = ytdPrevio > 0 ? kpiActual.importe / ytdPrevio : null
proyeccion[m] = importe del mes m del año anterior * factor,  para m > mesesConDatos
proyeccion[mesesConDatos] = valor real de ese mes (punto de anclaje)
```

En vista Acumulada la proyección se acumula igual que las demás series. Si `factor` es null no se dibuja.

Render: `<Line dataKey="proyeccion" stroke={getYearColor(anioActual, anioActual)} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls legendType="none" />`, y el Tooltip la etiqueta como "Proyección" (formatter que traduce el nombre de la clave).

## Notas técnicas

- Nuevos estados locales: `metrica` ("ventas" | "ticket") y `vista` ("mensual" | "acumulada").
- Un único `useMemo` derivado combina serie base + proyección según el estado, sin tocar `serieMensual`/`serieTicket`.
- No se modifican los `<Link>` de drill-down ni la sección de KPIs (salvo el punto 4).
- Verificación: typecheck y build limpios, más revisión visual a 360px.
