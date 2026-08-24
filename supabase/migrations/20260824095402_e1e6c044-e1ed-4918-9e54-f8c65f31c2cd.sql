SET LOCAL statement_timeout = '10min';

DROP MATERIALIZED VIEW IF EXISTS public.documentos_resumen;

CREATE MATERIALIZED VIEW public.documentos_resumen AS
SELECT
  v.id_documento,
  v.cod_cliente,
  c.cliente,
  c.delegacion,
  c.vendedor,
  v.ejercicio AS anio,
  MIN(v.fecha) AS fecha,
  MIN(v.hora) AS hora,
  (array_agg(v.tipo_documento))[1] AS tipo_documento,
  (array_agg(v.operacion))[1] AS operacion,
  (array_agg(v.canal))[1] AS canal,
  (array_agg(v.almacen))[1] AS almacen,
  (array_agg(v.vendedor_linea))[1] AS vendedor_linea,
  (array_agg(v.registrado_por))[1] AS registrado_por,
  (array_agg(v.motivo_abono))[1] AS motivo_abono,
  (array_agg(v.id_doc_enlazado))[1] AS id_doc_enlazado,
  SUM(v.importe) AS importe,
  SUM(v.margen) AS margen,
  COUNT(*)::int AS lineas
FROM public.ventas_diarias v
JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
WHERE v.id_documento IS NOT NULL
GROUP BY v.id_documento, v.cod_cliente, c.cliente, c.delegacion, c.vendedor, v.ejercicio;

CREATE UNIQUE INDEX idx_documentos_resumen_pk
  ON public.documentos_resumen (anio, cod_cliente, id_documento);
CREATE INDEX idx_documentos_resumen_anio_importe
  ON public.documentos_resumen (anio, ABS(importe) DESC);

REVOKE ALL ON public.documentos_resumen FROM authenticated;
REVOKE ALL ON public.documentos_resumen FROM anon;
GRANT ALL ON public.documentos_resumen TO service_role;