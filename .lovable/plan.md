# Mapa de lentitud: causa común a toda la app + causa propia de Ventas

Todo lo que sigue está medido hoy contra la base de datos real. No se ha aplicado ningún cambio.

## Parte 1 — La causa común

### 1.1 Los índices están bien. No es eso.

| Tabla | Índice que usan las funciones de rol | Estado |
|---|---|---|
| `user_roles` | `user_roles_user_id_role_key (user_id, role)` UNIQUE | existe, se usa como *Index Only Scan*, 1 buffer, 0,003 ms |
| `profiles` | `profiles_user_id_key (user_id)` UNIQUE | existe (con 4 filas hace seq scan de 1 página, irrelevante) |

Una llamada suelta a `has_role` o `is_approved` cuesta microsegundos. El problema no es lo que cuesta una llamada, sino **cuántas veces se llama**.

### 1.2 Por qué se llaman una vez por fila

`is_approved`, `is_admin`, `has_role`, `get_user_delegacion`, `get_user_employee_code`, `can_view_cliente`, `clientes_permitidos`: todas son `STABLE SECURITY DEFINER`, `COST 100`, no `LEAKPROOF`.

`STABLE` está bien puesto, pero **no basta**: `STABLE` sólo garantiza que el valor no cambia dentro de la sentencia; no obliga al planificador a evaluarlas una sola vez. Y hay un detalle decisivo: **una función SQL con `SECURITY DEFINER` nunca se inlinea**. Postgres la deja como caja negra, la mete en la qual y la evalúa **fila a fila**.

Consecuencia directa, con los tamaños reales de las tablas:

| Política | Tabla | Filas | Llamadas a funciones de rol por consulta |
|---|---|---|---|
| `Role-scoped view clientes` | `clientes` | 11.592 | hasta 5 × 11.592 ≈ **58.000** |
| `Role-scoped view ventas_diarias` | `ventas_diarias` | 433.215 | `can_view_cliente` una vez **por fila leída** |
| `Role-scoped view resumen_cliente_mes` | `resumen_cliente_mes` | 35.488 | ídem |
| `Role-scoped view resumen_documentos` | `resumen_documentos` | 38.467 | ídem |
| `Role-scoped view cliente_kpis` | `cliente_kpis` | ~11.500 | ídem |
| `Role-scoped view visitas` | `visitas` | 21.492 | + subconsulta `IN (SELECT ... FROM clientes)` |

Y `can_view_cliente` no es barata: dentro hace `is_approved` + hasta tres `has_role` + un `EXISTS` sobre `clientes`. Multiplicado por cientos de miles de filas, ahí están los 3-6 s de la primera carga de cualquier pantalla.

**Prueba medida.** Escribí el mismo predicado de `clientes` pero con las comprobaciones de rol como subconsultas en lugar de llamadas a función. El planificador las convirtió en **InitPlan evaluados una sola vez** (`One-Time Filter`), con *Index Only Scan* sobre `user_roles`: **1.006 buffers en total** para las 11.592 filas, frente a las decenas de miles de invocaciones del plan actual. Mismo resultado (440 clientes del comercial), misma semántica.

Esto es exactamente el patrón que ya arregló `visita_bloques`: sacar la comprobación de la qual para que se evalúe una vez, no por fila.

### 1.3 Sobre el `COST 100`

`COST 100` significa "esta función cuesta 100× una operación básica". Le dice al planificador que evite llamarla, y eso empeora los planes por dos vías: descarta caminos con índice cuando la igualdad útil (`vendedor = get_user_employee_code(...)`) está dentro de un `OR` junto a la función cara, y le lleva a preferir barridos secuenciales. En la práctica el coste real de estas funciones es ~1 buffer. `COST 100` no está justificado; pero bajarlo es cosmético comparado con dejar de llamarlas por fila.

### 1.4 Corrección propuesta para la causa común (no aplicada)

Envolver cada llamada de rol en una subconsulta escalar: `(SELECT public.is_admin(auth.uid()))`. Postgres la promociona a InitPlan y la ejecuta **una vez por sentencia**. La semántica es idéntica — mismo predicado, mismo resultado — y no se toca ninguna condición de autorización.

Aplica a: las políticas de `clientes`, `visitas`, `visitas_planificadas`, `situaciones_cliente`, `rutas`, `cliente_perfil_datos`, y al **cuerpo** de `can_view_cliente` y `clientes_permitidos`.

Para las tablas grandes filtradas por `can_view_cliente` (`ventas_diarias`, `resumen_cliente_mes`, `resumen_documentos`, `cliente_kpis`) hace falta un paso más: sustituir la llamada por fila por una pertenencia a conjunto calculada una vez:

```sql
USING ( cod_cliente IN (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid())) )
```

con `clientes_permitidos` ya optimizada. Semánticamente equivale a `can_view_cliente` (mismo cuerpo, mismos roles); hay que verificarlo caso por caso antes de tocar nada.

### 1.5 Un dato que descarta el hardware como causa principal

La agregación de ventas de un comercial (440 clientes × `resumen_cliente_mes`) tarda **308 ms la primera vez y 8 ms las siguientes**, con índices y sin barridos. La instancia no está ahogada: `generate_series` de 3M filas en 778 ms, conexiones 17/60, disco 19 %. Memoria al 70 % con `shared_buffers` de 224 MB frente a 394 MB de base de datos — la caché justa, lo que explica la penalización de la *primera* carga. Subir instancia ayudaría al margen; no es lo primero que hay que hacer.

## Parte 2 — Qué tiene Ventas de particular

### 2.1 No recalcula sobre `ventas_diarias`

Comprobado leyendo las funciones: `panel_ventas_kpis()` y `panel_ventas_mensual()` leen de `resumen_cliente_mes` y `resumen_documentos`, que ya son tablas resumidas. **La hipótesis de que agregan sobre `ventas_diarias` es falsa.** La agregación en sí, medida, cuesta 8 ms.

### 2.2 Lo que sí cuesta: `clientes_permitidos(auth.uid())` en cada función

Las dos funciones empiezan igual:

```sql
WITH p AS (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid())), ...
```

`clientes_permitidos` barre las 11.592 filas de `clientes` evaluando por fila `is_approved` + hasta tres `has_role` + `get_user_delegacion`/`get_user_employee_code`. La igualdad útil (`c.vendedor = ...`) está dentro de un `OR`, así que **no puede usar `idx_clientes_vendedor`**. Ese barrido es prácticamente todo el 1.927 ms de `panel_ventas_kpis` y el 1.847 ms de `panel_ventas_mensual`.

### 2.3 Y Ventas lo paga varias veces en paralelo

Del `pg_stat_statements` de hoy (medias reales en producción):

| Sentencia | Llamadas | Media | Total |
|---|---:|---:|---:|
| `panel_ventas_kpis()` | 216 | 1.950 ms | 421 s |
| `panel_ventas_mensual()` | 217 | 1.847 ms | 401 s |
| `rutas_visibles()` | 43 | 1.510 ms | 65 s |
| `SELECT * FROM visitas ORDER BY fecha DESC` | 73 | 550 ms | 40 s |
| `SELECT ... FROM clientes ORDER BY cliente` | 133 | 477 ms | 63 s |
| `SELECT * FROM clientes` | 698 | 87 ms | 61 s |

La pantalla de Ventas dispara `panel_ventas_kpis`, `panel_ventas_mensual` y varios `panel_top_*` a la vez; cada uno repite el mismo barrido de `clientes`. Con la instancia actual, tres o cuatro barridos concurrentes se estorban entre sí y la primera carga se va a 3-6 s. Rutas paga lo mismo vía `rutas_visibles()`.

**Nota aparte:** el segundo consumidor histórico de tiempo total (6.766 llamadas, 828 s) es un `SELECT ... FROM ventas_mensuales WHERE cod_cliente = ANY (...)`. Esa tabla **ya no existe**; son restos anteriores a la migración. El equivalente actual es el bucle de `useHistoricoData` que pagina `resumen_cliente_mes` en lotes de 500 clientes: para un director son ~24 peticiones HTTP encadenadas, cada una con su evaluación de RLS. Candidato claro a convertirse en un único RPC agregado, pero después de arreglar la RLS.

## Parte 3 — Orden de corrección propuesto por impacto/riesgo

Cada paso es una migración independiente, con verificación de autorización antes de pasar al siguiente.

1. **`clientes_permitidos` y `can_view_cliente`** — envolver las llamadas de rol en subconsultas escalares dentro del cuerpo. Un solo cambio, sin tocar políticas, y beneficia de golpe a Ventas, Rutas, Clientes y todas las tablas resumen. Riesgo mínimo: el predicado no cambia.
2. **Políticas de `clientes` y `visitas`** — misma envoltura, más convertir el `IN (SELECT ... FROM clientes)` de `visitas` en `IN (SELECT ... FROM clientes_permitidos(auth.uid()))` sólo si se confirma que el conjunto es idéntico. Afecta a Clientes, Visitas, Agenda y ficha de cliente.
3. **`ventas_diarias`, `resumen_cliente_mes`, `resumen_documentos`, `cliente_kpis`** — sustituir `can_view_cliente` por pertenencia a conjunto. Es donde más filas hay, pero también donde más hay que verificar; por eso va tercero.
4. **`visitas_planificadas`, `situaciones_cliente`, `rutas`, `cliente_perfil_datos`** — mismo tratamiento, tablas pequeñas, ganancia menor.
5. **Bajar `COST` de las funciones auxiliares** de 100 a un valor realista (1-10), ya con todo lo anterior aplicado.
6. **Colapsar el bucle de `useHistoricoData`** en un RPC único. Cambio de aplicación, no de autorización.
7. **Revisar tamaño de instancia** al final, con los números ya limpios, y sólo si la primera carga en frío sigue molestando.

## Verificación exigida en cada paso

Antes de dar por bueno cualquier paso: para un comercial, un jefe de zona y un admin reales, contar filas visibles en la tabla afectada **antes y después**. Si algún número sube, el cambio está mal y se revierte. Y repetir el `EXPLAIN (ANALYZE, BUFFERS)` exigiendo que desaparezcan los barridos secuenciales y que las funciones de rol aparezcan como `InitPlan`.

## Limitación de la medición de hoy

El rol del sandbox ya no tiene concedido `authenticated` (se revocó al cerrar el diagnóstico anterior) y no puede ejecutar las funciones `SECURITY DEFINER`. Las mediciones se han hecho reproduciendo el predicado de cada política con el UUID del comercial literal, más los tiempos reales de producción de `pg_stat_statements`, que sí vienen del rol `authenticated`. Si quieres los planes exactos bajo RLS, el primer paso de la implementación puede volver a conceder el rol temporalmente, como la vez anterior.
