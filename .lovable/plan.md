# Recrear vista materializada public.documentos_resumen con cuatro columnas adicionales

Objetivo: ampliar la vista materializada `public.documentos_resumen` con `delegacion`, `vendedor`, `motivo_abono` e `id_doc_enlazado`, manteniendo el resto de la definición exactamente igual. No se modifica ningún fichero de `src/`.

## Cambios en base de datos (una migración)

1. Aumentar el timeout local de la transacción a 10 minutos para tolerar el rellenado de ~400.000 filas.
2. Eliminar y recrear la vista materializada:
   - Mantener el `JOIN` con `public.clientes c` y el `WHERE v.id_documento IS NOT NULL`.
   - Añadir `c.delegacion` y `c.vendedor` al `SELECT` y al `GROUP BY`.
   - Añadir `(array_agg(v.motivo_abono))[1] AS motivo_abono` y `(array_agg(v.id_doc_enlazado))[1] AS id_doc_enlazado` al `SELECT`, agregados (no agrupados).
   - Conservar `GROUP BY v.id_documento, v.cod_cliente, c.cliente, v.ejercicio` más las dos nuevas columnas de cliente.
3. Recrear los dos índices:
   - `idx_documentos_resumen_pk` UNIQUE sobre `(anio, cod_cliente, id_documento)`.
   - `idx_documentos_resumen_anio_importe` sobre `(anio, ABS(importe) DESC)`.
4. Restaurar permisos restrictivos:
   - `REVOKE ALL ON public.documentos_resumen FROM authenticated, anon;`
   - `GRANT ALL ON public.documentos_resumen TO service_role;`
5. No tocar `public.documentos_listado`, `public.refrescar_documentos_resumen`, `public.ventas_diarias`, `public.clientes` ni ninguna política RLS.

## Verificación

- Comprobar que la vista existe con las nuevas columnas y los índices.
- Confirmar que `documentos_listado` sigue ejecutándose sin errores (las columnas nuevas no afectan a la RPC actual).
- Si el `CREATE` excede el timeout, informar al usuario para relanzarlo sin trocear la operación.
