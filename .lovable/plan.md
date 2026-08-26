# Actividad interna: análisis por motivo de abono

Solo se amplía Actividad interna. No se crean tablas nuevas ni se toca Documentos ni el importador.

## 1. RPC nueva: actividad_interna_motivos

`public.actividad_interna_motivos(_anio int, _almacen text DEFAULT NULL)`, plpgsql, STABLE, SECURITY DEFINER, `search_path = public`, con la misma comprobación de acceso como primera instrucción (rol admin o `user_dashboard_access` con `actividad_interna`) y `GRANT EXECUTE` a `authenticated`.

Una fila por `motivo_abono` sobre los abonos del año (`operacion = 'Abono'`), filtrando por `almacen` cuando `_almacen` no es NULL. Motivo nulo o vacío se agrupa como `'SIN MOTIVO'`.

Columnas: `motivo`, `n_abonos` (COUNT DISTINCT `id_documento`), `importe` (ABS de la suma), `pct_n` (% sobre el total de abonos del año/almacén), `pct_importe` (% sobre el importe abonado total), `tramitadores` (COUNT DISTINCT `registrado_por`), `clientes_distintos` (COUNT DISTINCT `cod_cliente`). Orden `n_abonos DESC`.

## 2. Filtro de motivo en actividad_interna_usuarios

`DROP FUNCTION IF EXISTS public.actividad_interna_usuarios(integer, text)` antes de crear la nueva firma `(_anio int, _almacen text DEFAULT NULL, _motivo text DEFAULT NULL)`, para no dejar una sobrecarga.

El filtro de motivo aplica solo a los abonos:

- `importe_vendido`, `docs_venta`, `clientes_distintos`, `ticket_medio`, `n_almacenes` y `almacen_principal` se calculan siempre sobre todas las ventas del año, ignorando `_motivo`.
- `n_abonos`, `importe_abonado`, `abonos_ajenos`, `abonos_atribuidos` e `importe_atribuido` se restringen a los abonos de ese motivo (comparando `SIN MOTIVO` con motivo nulo o vacío).
- `importe_neto` = `importe_vendido - importe_atribuido` (ya filtrado).
- `pct_abonos` y `pct_importe_abonado` se mantienen en la RPC.

Se conservan la atribución por LATERAL con `ORDER BY s.anio DESC, s.cod_cliente, s.id_documento LIMIT 1`, el FULL OUTER JOIN entre tramitados y atribuidos, y el orden por `importe_vendido DESC`.

## 3. actividad_interna_filtros

Se añade `motivos text[]` con los valores distintos de `motivo_abono` presentes en abonos, ordenados alfabéticamente.

## 4. Frontend

`src/hooks/useCrm.ts`: nuevo tipo `ActividadMotivo` y hook `useActividadMotivos(anio, almacen)`; `motivos` en el tipo de filtros; `useActividadUsuarios` acepta un tercer argumento `motivo` que va en la queryKey y en los parámetros de la RPC.

`src/pages/ActividadInterna.tsx`:

- Tercera pestaña "Por motivo" con su propio selector de almacén y tabla ordenable (mecanismo local existente): Motivo, Abonos, Importe, % abonos, % importe, Tramitadores, Clientes.
- En "Por usuario", selector "Motivo" junto al de almacén con "Todos los motivos" por defecto; con motivo activo se muestra bajo los filtros una línea de 13px en color secundario: "Las columnas de abonos están filtradas por motivo; las de venta no."
- Se eliminan de la tabla "Por usuario" las columnas "% abonos" y "% imp. abonado".

## Fuera de alcance

Agrupación de motivos, comparativa anual, gráficos y exportación.
