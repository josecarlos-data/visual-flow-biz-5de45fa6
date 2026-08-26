# Corregir representaciones engañosas en Resumen de ClienteDetalle

## Objetivo
Ajustar tres detalles de presentación en `src/pages/ClienteDetalle.tsx`, pestaña **Resumen**, para que los gráficos no muestren datos que no existen y los textos sean gramaticalmente correctos.

## Cambios

### 1) Meses futuros como `null` en la serie actual

En el `useMemo` `mensual` (línea ~252):

- Calcular `mesActual = new Date().getMonth() + 1` una sola vez fuera del bucle.
- Cambiar el tipo de `actual` a `number | null`.
- Inicializar `actual` con la regla:
  - `0` si el mes ya ha transcurrido (`(i + 1) <= mesActual`).
  - `null` si es un mes posterior (`(i + 1) > mesActual`).
- Solo aplicar el corte cuando `anioActual === new Date().getFullYear()`. Si `anioActual` es un año histórico, todos los meses se inicializan a `0` (año completo).
- Al acumular ventas del año actual, tratar `null` como `0` antes de sumar para evitar propagar `null`.
- En el `<Line dataKey="actual">` añadir `connectNulls={false}` para que la línea se interrumpa limpiamente tras el último mes con datos.

### 2) Distinguir visualmente el año en curso en el gráfico de barras

En el `useMemo` `porAnio` (línea ~246):

- Añadir a cada fila un campo booleano `enCurso`, verdadero solo cuando `anio === new Date().getFullYear()`.
- Importar `Cell` de `recharts` si aún no está importado.
- En el `<Bar dataKey="total">`, renderizar un `<Cell>` por fila:
  - `fill="hsl(var(--primary))"` para años cerrados.
  - `fill="hsl(var(--primary) / 0.45)"` para el año en curso.
- En el `<XAxis>` usar un `tickFormatter` que añada `" (en curso)"` al año en curso. En móvil, si la etiqueta queda muy larga, usar `" *"` y añadir debajo del gráfico una línea `<p className="text-xs text-muted-foreground">* Año en curso (datos parciales)</p>`.
- No modificar Tooltip ni eje Y.

### 3) Singular/plural de "días sin comprar"

En la línea ~420, cambiar la interpolación para que:
- `1 día sin comprar` cuando `kpis.dias_sin_comprar === 1`.
- `N días sin comprar` en cualquier otro caso (incluido 0).

## Restricciones

- Único fichero modificado: `src/pages/ClienteDetalle.tsx`.
- Sin migraciones, sin cambios en `supabase/`, `package.json`, hooks, RPCs ni RLS.
- No tocar las pestañas Visitas, Productos, Documentos ni Perfil.
- No tocar el bloque "Datos de ficha" ni los gráficos de Top familias / Top marcas.

## Verificación

1. `tsgo` sin errores y build limpia.
2. En un cliente con ventas en el año en curso, la línea del año actual termina en el mes actual y no desciende a cero en meses futuros.
3. La barra del año en curso se visualiza con opacidad reducida frente a años completos.
4. Un cliente con `dias_sin_comprar = 1` muestra "1 día sin comprar".
