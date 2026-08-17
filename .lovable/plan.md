# Mapa de las 11 funciones lentas (solo diagnóstico, nada aplicado)

Medido hoy contra la base real. Los tiempos de `pg_stat_statements` son tuyos; los planes que cito los he ejecutado yo como propietario (sin RLS), lo que permite separar "coste propio de la consulta" de "coste de la autorización".

## 1) ¿Todas empiezan resolviendo el conjunto de clientes visibles?

**Sí, con `WITH p AS (SELECT ... FROM clientes_permitidos(auth.uid()))`:**
- `panel_top_clientes`, `panel_top_familias`, `panel_top_marcas`, `panel_canales`, `panel_devoluciones`, `panel_alertas`

**No usan `clientes_permitidos`; comprueban un solo cliente con `can_view_cliente(auth.uid(), _cod)`:**
- `cliente_top_productos`, `cliente_documentos` — una sola llamada de autorización por ejecución, no por fila

**No usa ninguna de las dos:**
- `objetivos_seguimiento` — resuelve el rol una sola vez en variables plpgsql (`v_todos`, `v_vend`) y luego filtra por `c.vendedor`. La autorización aquí **no cuesta nada**.

## 2) ¿Cuáles se arreglan con la envoltura del paso 1 y cuáles tienen problema propio?

La envoltura en subconsulta escalar **ya está aplicada** dentro de `clientes_permitidos` y `can_view_cliente` (paso 1). Por tanto **ninguna de estas once mejora con más envoltura**: lo que queda es coste propio.

| Función | Qué le queda por resolver |
|---|---|
| `objetivos_seguimiento` | Agregación completa sobre `ventas_diarias`. Ver punto 3. |
| `panel_devoluciones` | `ventas_diarias` con `operacion='Abono' AND EXTRACT(YEAR FROM fecha)=_anio`. El `EXTRACT` **no es sargable**: `idx_vd_fecha` no se puede usar y hace barrido secuencial de 433k filas. Además recorre el CTE `a` tres veces (tres `GROUP BY` distintos). |
| `cliente_top_productos` | Filtra por `cod_cliente` (índice bien) pero repite el `EXTRACT(YEAR ...)` y hace `LEFT JOIN productos` + `GROUP BY` sobre cuatro expresiones `COALESCE`. Coste medio, no crítico. |
| `cliente_documentos` | `GROUP BY id_documento` con `array_agg` sobre todas las líneas históricas del cliente antes de aplicar `LIMIT`. Ordena por `MIN(fecha)` sobre el conjunto completo. |
| `panel_top_familias` / `panel_top_marcas` / `panel_top_clientes` / `panel_canales` | Leen tablas resumen, correcto. Lo que pagan es materializar `clientes_permitidos` (11.592 filas para admin) y hacer hash join contra el resumen. Estructuralmente sanas; ~0,5-1,2 s es sobre todo caché fría. |
| `panel_alertas` | Igual, más `situaciones_activas()` y **tres pasadas sobre el CTE `k`** (una por tipo de alerta). |

Resumen: **problema de agregación/índices**, no de rol, en `objetivos_seguimiento`, `panel_devoluciones`, `cliente_documentos` y en menor medida `cliente_top_productos`. Las cuatro `panel_top_*`/`canales`/`alertas` solo tienen coste de volumen.

## 3) Por qué `objetivos_seguimiento` es cinco veces peor

El CTE `ventas` agrega **`ventas_diarias` en crudo**, no las tablas resumen. Plan real ejecutado hoy (sin RLS, o sea suelo absoluto):

```text
Finalize GroupAggregate  actual time=5186..5331 ms  rows=722
  Buffers: shared hit=29674, temp read=1422 written=1430
  -> Sort  Sort Method: external merge  Disk: 5672kB     <- vuelca a disco
     -> Nested Loop  rows=131267 (loops=2)  4846 ms
        -> Parallel Seq Scan on ventas_diarias  4495 ms
           Filter: EXTRACT(year FROM fecha) = ANY ('{2026,2025}')
           Rows Removed by Filter: 85335
        -> Memoize -> Index Scan clientes_cod_cliente_key  (262.545 loops)
```

Tres defectos acumulados, y ninguno tiene que ver con la autorización:

1. **Barrido secuencial completo de `ventas_diarias`** (433.215 filas; 262.545 útiles de 2025-2026). `EXTRACT(YEAR FROM v.fecha) IN (...)` impide usar `idx_vd_fecha`; con `fecha >= '2025-01-01' AND fecha < '2027-01-01'` sí sería sargable.
2. **Nested loop de 262.545 iteraciones** contra `clientes`, salvado a medias por Memoize (2.609 fallos, 128k aciertos) pero aun así 4,8 s.
3. **Sort externo a disco** (5,6 MB por worker) porque el planificador estima 1.058 filas y llegan 131.267 — estimación errada por dos órdenes de magnitud, culpa de las expresiones `EXTRACT` sin estadísticas.

Los 5.087 ms de media que ves son básicamente estos 5,3 s. Bajo `authenticated` no cambia: el filtro de rol es `c.vendedor = v_vend` sobre una variable ya resuelta.

Y se ejecuta **por cada objetivo activo** en el sentido de que el resultado se recalcula entero (19 filas en `objetivos`) — el coste no depende del número de objetivos, sino del barrido.

**Salida natural:** `resumen_cliente_mes` no sirve porque la quincena parte el mes en dos. Haría falta o bien un filtro por rango de fechas + índice, o bien una tabla/vista materializada `resumen_vendedor_quincena (vendedor, ruta_esp, anio, q, importe)` refrescada junto con los demás resúmenes.

**Nota sobre la medición:** este `EXPLAIN` lo he ejecutado como propietario, no con `SET LOCAL ROLE authenticated` dentro de migración, porque eso es un cambio de estado y estamos en modo plan. Dado que la autorización aquí se resuelve en variables antes de la consulta, el plan bajo `authenticated` es el mismo; si quieres la confirmación literal, la lanzo como primer paso de la implementación.

## 4) Las 14 llamadas: quién las dispara

Sí, es **una sola carga de pantalla**. `src/pages/Ventas.tsx` tiene dos `useEffect` con `Promise.all`:

- Efecto 1 (al montar): `panel_ventas_mensual`, `panel_ventas_kpis`, `panel_alertas`
- Efecto 2 (cuando se resuelve `anioActual`): `panel_top_clientes`, `panel_top_familias`, `panel_top_marcas`, `panel_canales`, `panel_devoluciones`

Ocho RPC en dos ráfagas paralelas. Con 14 cargas de Ventas salen exactamente los 14 de cada una.

**Lo que se pide más veces de lo necesario:**

- `objetivos_seguimiento` (12 llamadas) lo dispara `ResumenObjetivos`, que está **dentro de la página de Ventas**, y además `Objetivos.tsx` y `AdminObjetivos.tsx`. Es la función más cara de todas y se está pagando en una pantalla donde solo se muestran **4 tarjetas recortadas** (`.slice(0, 4)`) — trae la serie quincenal completa de todos los objetivos para pintar cuatro barras de progreso.
- `queryClient` se crea en `src/App.tsx` **sin opciones** (`new QueryClient()`): `staleTime: 0` y `refetchOnWindowFocus: true`. Cada vuelta a la pestaña revalida `objetivos_seguimiento`. Eso explica que sean 12 y no 14: hay caché entre montajes rápidos, pero se invalida enseguida.
- Las ocho RPC de Ventas **no pasan por React Query**: son `useEffect` + estado local, así que no hay caché ninguna. Volver a Ventas desde el menú relanza las ocho siempre.
- `anioActual` se inicializa a `new Date().getFullYear()` y luego se recalcula desde `kpis`. Si el año máximo de datos coincide con el actual no hay doble disparo (los contadores 14/14 lo confirman), pero es frágil: en enero, o si los datos se quedan atrás, el efecto 2 se ejecutaría **dos veces**, duplicando cinco RPC.

## Orden que sugiero (pendiente de tu decisión)

1. `objetivos_seguimiento`: filtro sargable por rango de fechas + resumen por vendedor/quincena. Es el único a 150 ms del timeout.
2. `panel_devoluciones`: filtro por rango de fechas e índice parcial sobre abonos.
3. Caché en cliente: `staleTime` razonable en el `QueryClient` y pasar las ocho RPC de Ventas a React Query; valorar si `ResumenObjetivos` necesita la serie completa o le basta un RPC ligero.
4. `cliente_documentos` y `cliente_top_productos`: acotar antes de agregar.
5. Las `panel_top_*` se quedan como están hasta ver el efecto de lo anterior.
