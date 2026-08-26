# Actividad interna: atribución real de abonos

Amplía únicamente la sección Actividad interna. No se toca Documentos, ni el importador `maestroIsi.ts`, ni ninguna otra sección.

## 1. Migración: columna de cruce en la vista de documentos

Recrear `public.documentos_resumen` (DROP sin CASCADE + CREATE) idéntica a la definición actual (mismas 19 columnas, mismo JOIN con clientes, mismo WHERE y GROUP BY) añadiendo una columna:

- `doc_ref` = `regexp_replace(v.id_documento, '^[^|]*\|', '')`, agrupada junto a `id_documento`.

En la misma migración, sin omitir nada de lo existente:

- `SET LOCAL statement_timeout = '10min'` al inicio.
- Índices recreados: `idx_documentos_resumen_pk` (UNIQUE sobre `anio, cod_cliente, id_documento`) e `idx_documentos_resumen_anio_importe` (sobre `anio, ABS(importe) DESC`).
- Índice nuevo: `idx_documentos_resumen_doc_ref` sobre `(doc_ref)`.
- Permisos: `REVOKE ALL ... FROM authenticated`, `REVOKE ALL ... FROM anon`, `GRANT ALL ... TO service_role`.

## 2. Atribución de abonos en las RPC

Ambas funciones necesitan `DROP FUNCTION` + `CREATE` (cambia la lista de columnas devueltas), manteniendo firma, `SECURITY DEFINER`, `STABLE`, `search_path = public`, la comprobación de acceso tal cual (admin o dashboard `actividad_interna`) y el `GRANT EXECUTE` a `authenticated`.

Tres columnas nuevas en `actividad_interna_usuarios` y en `actividad_interna_almacenes`:

- `abonos_atribuidos` (int): abonos del año cuya venta original fue registrada por ese usuario (o, en la vista por almacén, cuya venta original pertenece a ese almacén).
- `importe_atribuido` (numeric): `ABS` del importe de esos abonos.
- `importe_neto` (numeric): `importe_vendido - importe_atribuido`.

Resolución del enlace: para cada abono del año, `LEFT JOIN LATERAL (SELECT registrado_por, almacen FROM public.documentos_resumen s WHERE s.doc_ref = btrim(a.id_doc_enlazado) AND COALESCE(s.operacion,'Venta') <> 'Abono' LIMIT 1) ON TRUE`, sin filtrar el lado de la venta por `_anio` (la venta original puede ser de otro año) y sin JOIN directo, para no duplicar filas cuando `doc_ref` se repite entre clientes. Un abono sin enlace, o cuyo enlace no resuelve, no se atribuye a nadie y queda fuera de estas tres columnas.

- `n_abonos` e `importe_abonado` se mantienen sin cambios en SQL (pasan a interpretarse como "tramitados").
- `pct_abonos` y `pct_importe_abonado` pasan a calcularse sobre los atribuidos: `abonos_atribuidos / docs_venta * 100` e `importe_atribuido / importe_vendido * 100`.
- Se mantiene `n_almacenes` y el resto de métricas y el orden por `importe_vendido DESC`.

## 3. Frontend

`src/hooks/useCrm.ts`: añadir `abonos_atribuidos`, `importe_atribuido` e `importe_neto` a `ActividadUsuario` y `ActividadAlmacen`. Sin cambios en los hooks.

`src/pages/ActividadInterna.tsx`, pestaña "Por usuario":

- Nueva columna "Neto" (importe_neto) justo después de "Vendido".
- "Abonos" -> "Abonos tramitados"; "Importe abonado" -> "Imp. tramitado".
- Nuevas columnas "Abonos s/ sus ventas" (abonos_atribuidos) e "Imp. atribuido" (importe_atribuido).
- Cabecera de almacén renombrada a "Plaza (est.)" y eliminado el badge "+N" (el valor sigue siendo el almacén principal).
- Todas las columnas nuevas ordenables con el mecanismo de ordenación local existente.

Pestaña "Por almacén": se añaden las mismas columnas nuevas para mantener coherencia de lectura.

## Fuera de alcance

Clasificación operativo/funcional, comparativa anual, gráficos y exportación.
