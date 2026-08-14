# Diagnóstico: timeouts en la importación de bloques

## Cómo escribe hoy `src/lib/datasets/bloquesExtraccion.ts`

Leído el código (bloque `upload`, líneas 461-482, y `escribir`, 391-415):

- **No** se lanza todo en paralelo. Hay un bucle por lotes con `const CONC = 5`: se cogen 5 items, `Promise.all` sobre esos 5, se espera, y se pasa al siguiente lote.
- **Concurrencia máxima: 5 peticiones simultáneas.** Nunca más.
- **Una petición HTTP por bloque.** Cada item es un `UPDATE ... eq(id)` o un `INSERT` independiente contra PostgREST. No hay upsert masivo.

## Tu hipótesis: descartada

La saturación del pool no encaja con lo medido:

- Concurrencia tope de 5, no de 1.104.
- Salud actual del backend: conexiones 15/60, clientes de pool 1/200. Sin saturación.

## Lo que sí dicen las estadísticas del servidor

`pg_stat_statements` sobre el UPDATE exacto que emite la importación:

```text
UPDATE visita_bloques SET campos, campos_meta WHERE id = $2
  llamadas 2.272 · media 7.085 ms · máx 7.953 ms
UPDATE visita_bloques SET campos, campos_meta, motivo_key WHERE id = $2
  llamadas 45 · media 6.848 ms · máx 7.834 ms
```

El `statement_timeout` del rol `authenticated` es **8 s**. La media de esas
sentencias está pegada al techo: el tiempo se consume **dentro de Postgres**,
no en la cola del pool. No es un problema de cómo el cliente reparte el
trabajo.

Además, no es exclusivo de la escritura: el `SELECT` de bloques por
`visita_id` que hace la fase de preparación va a 2.275 ms de media, y
`panel_ventas_kpis()` a 1.927 ms. Todo el acceso a estas tablas va lento,
lo que apunta a un cuello común (contención o CPU del servidor), no a un
plan concreto.

Descartado ya, con datos:

- Plan del trigger: el plan genérico de la consulta interna de
  `promover_perfil_desde_bloque` usa índices (`visita_bloques_pkey`,
  `visitas_pkey`). No degenera en escaneo secuencial.
- Volumen de datos: `visita_bloques` 21.527 filas / 5,4 MB,
  `cliente_perfil_datos` 117 filas. Nada aquí justifica 7 s.
- Bloqueos largos: no se observan.

## Plan de trabajo

### 1. Medir dónde se van los 7 s (antes de tocar nada)

- Ejecutar el UPDATE con `EXPLAIN (ANALYZE, BUFFERS)` **bajo el rol
  `authenticated`** con las RLS activas, no como propietario. La medición de
  63 ms se hizo sin RLS; los cuatro triggers de `visita_bloques` más las
  políticas (`EXISTS` sobre `visitas` con `is_admin` / `puede_revisar_visitas`)
  solo aparecen en ese contexto.
- Repetir con el trigger de promoción deshabilitado en una transacción de
  prueba, para separar coste de trigger y coste de RLS.
- Revisar el tamaño de instancia de Lovable Cloud: que consultas triviales
  ronden el segundo sugiere CPU corta para la carga actual.

### 2. Corrección de la escritura: un RPC masivo (recomendado)

Sustituir la petición por bloque por **un único RPC por tanda de ~200-500
bloques**, que recibe un `jsonb` con el lote y hace la escritura en conjunto:

- Un `INSERT ... ON CONFLICT` / `UPDATE ... FROM jsonb_to_recordset` en una
  sola sentencia: una evaluación de RLS y de planificación por lote en vez de
  una por fila.
- El trigger de perfil se ejecuta igual (es `FOR EACH ROW`), pero deja de
  pagarse el ida y vuelta HTTP, la autenticación JWT y la reevaluación de
  políticas 1.100 veces.
- El RPC devuelve por fila `ok` / mensaje de error, para conservar el detalle
  actual de fallos en la UI y la idempotencia (se puede reintentar).

Por qué esto y no "lotes con concurrencia limitada": la concurrencia ya está
limitada a 5 y no es el problema. Bajarla solo alarga la importación; el coste
real es por sentencia, y la única palanca que lo reduce de verdad es agrupar
varias filas en una sentencia.

### 3. Salvaguarda para importaciones grandes

- Si la medición del paso 1 confirma que el trigger es una parte relevante del
  coste: en el RPC de importación, desactivarlo a nivel de sesión
  (`session_replication_role` no vale con SECURITY DEFINER estándar; se usaría
  una variable de sesión leída por el trigger para saltarse la promoción) y
  ejecutar al final un **backfill de perfil** en una sola sentencia sobre los
  bloques del lote. Mucho más barato que 1.100 promociones individuales.
- Mantener el reintento idempotente que ya existe.

### 4. Verificación

- Reimportar el CSV de 1.104 filas y comprobar 0 timeouts.
- Comprobar en `pg_stat_statements` que la media de la sentencia de escritura
  baja de segundos a decenas de ms por bloque.
- Comprobar que `cliente_perfil_datos` queda con los mismos hechos que
  produciría la ruta fila a fila (mismo recuento por `bloque_id`).

## Detalle técnico

- Fichero a cambiar: `src/lib/datasets/bloquesExtraccion.ts` (solo la fase
  `upload`; `parse` y `prepare` no se tocan).
- Nueva función de base de datos `importar_bloques_extraccion(jsonb)` con
  control de permisos explícito dentro (solo admin / revisor), devolviendo
  `TABLE(visita_id uuid, orden int, ok boolean, error text)`.
- Sin cambios de esquema en `visita_bloques` ni en `cliente_perfil_datos`.
