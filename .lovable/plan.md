# Datos de medición: objetivos_seguimiento(2026) y caché

Solo datos. Sin correcciones.

## 1) Tamaños en disco

| Objeto | Tabla | Índices | Total |
|---|---|---|---|
| `ventas_diarias` (433.215 filas) | 110 MB | 160 MB | 270 MB |
| `clientes` | 7.992 kB | 2.864 kB | 11 MB |
| `objetivos` | 8 kB | 48 kB | 64 kB |
| **Base completa** | | | **394 MB** |
| Esquema `public` (todas las tablas + índices) | | | 583 MB |

Índices de `ventas_diarias` por separado (14 índices, 160 MB en total):

```text
idx_vd_doc                        28 MB
ventas_diarias_pkey               18 MB
idx_ventas_diarias_fecha_cliente  16 MB
idx_ventas_diarias_cliente_fecha  15 MB
idx_vd_ref                        12 MB
idx_ventas_diarias_referencia     12 MB
idx_ventas_diarias_familia_fecha  11 MB
idx_ventas_diarias_marca_fecha    10 MB
idx_vd_fecha                     7.896 kB
idx_vd_cliente                   7.216 kB
idx_vd_marca                     6.512 kB
idx_vd_familia                   6.144 kB
idx_vd_canal                     5.600 kB
idx_vd_operacion                 5.464 kB
```

Índices de `clientes`: `clientes_pkey` 1.192 kB, `clientes_cod_cliente_key` 792 kB, `idx_clientes_vendedor` 312 kB, `idx_clientes_delegacion` 296 kB, `idx_clientes_ruta` 176 kB.

## 2) Parámetros de memoria

| Parámetro | Valor |
|---|---|
| `shared_buffers` | 28.672 × 8 kB = **224 MB** |
| `effective_cache_size` | 49.152 × 8 kB = **384 MB** |
| `work_mem` | **2.184 kB** (2,13 MB) |
| `maintenance_work_mem` | 32 MB |
| `max_connections` | 60 |
| `max_parallel_workers_per_gather` | 1 |
| `random_page_cost` / `seq_page_cost` | 1.1 / 1.0 |
| `jit` | off |
| `track_io_timing` | **off** (no hay tiempos de E/S por consulta) |

## 3) pg_statio_user_tables (acumulado desde el último reset de estadísticas)

| Tabla | heap_blks_read | heap_blks_hit | % hit | idx_blks_read | idx_blks_hit |
|---|---|---|---|---|---|
| `ventas_diarias` | 31.726 | 18.276.002 | **99,83 %** | 22.330 | 49.812.745 |
| `clientes` | 4.102 | 28.797.470 | 99,99 % | 482 | 46.138.984 |

Es decir, 0,17 % de las lecturas de heap de `ventas_diarias` han ido a disco (y ese contador incluye el arranque en frío histórico). Aviso: `heap_blks_read` cuenta fallos de *shared buffers*, que pueden servirse igualmente de la caché de página del SO, no necesariamente de disco físico.

## 4) y 5) Cinco ejecuciones cronometradas — NO se han podido hacer tal cual

Motivo, tal cual lo devuelve el servidor con el rol de consulta de este entorno:

```text
ERROR:  permission denied to set role "authenticated"
ERROR:  permission denied for function objetivos_seguimiento
```

El rol `supabase_read_only_user` no tiene `EXECUTE` sobre la función (fue parte del endurecimiento de seguridad) ni puede hacer `SET ROLE authenticated`. Para los cinco tiempos reales de la función hace falta modo Build (crear una copia temporal ejecutable, o conceder EXECUTE temporalmente).

Lo que sí se ha podido medir sin cambiar nada: el bloque caro de la función, el CTE `ventas` con la fórmula de `quincena_de` ya inlineada y el mismo rango sargable, ejecutado cinco veces seguidas en la misma sesión (el rol tiene `BYPASSRLS`, así que no filtra por vendedor: lee **más** filas que tu caso, no menos):

```text
pasada 1:  983,9 ms   (en frío)
pasada 2:  366,6 ms
pasada 3:  361,8 ms
pasada 4:  363,2 ms
pasada 5:  361,4 ms
```

Contador de disco medido antes y después de esas cinco pasadas (equivale a lo que pedías en el punto 5, medido entre pasadas calientes):

```text
antes de la pasada 1:  heap_blks_read = 31.726
tras la pasada 5:      heap_blks_read = 31.726   (sin cambio)
heap_blks_hit subió de 18.297.092 a 18.297.148
```

Cero bloques leídos fuera de `shared_buffers` en las cinco pasadas. La porción de `ventas_diarias` que toca el rango 2025-2026 son ~15.000 bloques (≈120 MB) y se mantuvo residente en los 224 MB de `shared_buffers` durante toda la serie, con otras consultas de fondo corriendo.

Qué no cubre esta medición: no incluye el resto del cuerpo de la función (`agg`, `serie`, `jsonb_agg`, subconsultas finales), ni el filtrado RLS por `vendedor`, ni el plan que se elige con `_anio` como parámetro en tiempo de ejecución en vez de literal.

## 6) Tamaños de instancia por encima del actual

Los 224 MB de `shared_buffers` / 384 MB de `effective_cache_size` / 60 conexiones corresponden al escalón **Micro (1 GB RAM, 2 vCPU compartidas)**. Los escalones superiores y su `shared_buffers` (≈25 % de la RAM; valores de la tabla de cómputo estándar, conviene confirmarlos en la pantalla de cómputo del backend antes de decidir):

| Escalón | RAM | vCPU | shared_buffers aprox. | max_connections aprox. |
|---|---|---|---|---|
| Micro (actual) | 1 GB | 2 | 224 MB | 60 |
| Small | 2 GB | 2 | ~512 MB | 90 |
| Medium | 4 GB | 2 | ~1 GB | 120 |
| Large | 8 GB | 2 dedicadas | ~2 GB | 160 |
| XL | 16 GB | 4 | ~4 GB | 240 |
| 2XL | 32 GB | 8 | ~8 GB | 380 |
| 4XL | 64 GB | 16 | ~16 GB | 480 |

A partir de Small, `shared_buffers` (512 MB) supera ya el tamaño total de la base (394 MB).

## Lo que hace falta para cerrar los puntos 4 y 5 al 100 %

Un único paso en modo Build, sin cambios permanentes:

1. Conceder `EXECUTE` temporal (o crear copia `objetivos_seguimiento_tmp`), ejecutar cinco veces bajo `SET LOCAL ROLE authenticated` con tu UUID y `request.jwt.claims`, cronometrando con `clock_timestamp()`.
2. Leer `heap_blks_read` de `ventas_diarias` antes de cada pasada, no solo entre la 3 y la 4.
3. Instalar `pg_buffercache` de forma temporal para contar cuántos bloques de `ventas_diarias` quedan residentes justo después de cada pasada — es la prueba directa de la hipótesis de evicción, y ahora mismo no está instalada.
4. Revertir permisos y extensión al terminar.
