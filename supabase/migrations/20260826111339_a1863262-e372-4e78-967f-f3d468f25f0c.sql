SET LOCAL statement_timeout = '10min';

DROP MATERIALIZED VIEW public.documentos_resumen;

CREATE MATERIALIZED VIEW public.documentos_resumen AS
SELECT v.id_documento,
    regexp_replace(v.id_documento, '^[^|]*\|', '') AS doc_ref,
    v.cod_cliente,
    c.cliente,
    c.delegacion,
    c.vendedor,
    v.ejercicio AS anio,
    min(v.fecha) AS fecha,
    min(v.hora) AS hora,
    (array_agg(v.tipo_documento))[1] AS tipo_documento,
    (array_agg(v.operacion))[1] AS operacion,
    (array_agg(v.canal))[1] AS canal,
    (array_agg(v.almacen))[1] AS almacen,
    (array_agg(v.vendedor_linea))[1] AS vendedor_linea,
    (array_agg(v.registrado_por))[1] AS registrado_por,
    (array_agg(v.motivo_abono))[1] AS motivo_abono,
    (array_agg(v.id_doc_enlazado))[1] AS id_doc_enlazado,
    sum(v.importe) AS importe,
    sum(v.margen) AS margen,
    (count(*))::integer AS lineas
   FROM (public.ventas_diarias v
     JOIN public.clientes c ON ((c.cod_cliente = v.cod_cliente)))
  WHERE (v.id_documento IS NOT NULL)
  GROUP BY v.id_documento, v.cod_cliente, c.cliente, c.delegacion, c.vendedor, v.ejercicio;

CREATE UNIQUE INDEX idx_documentos_resumen_pk ON public.documentos_resumen (anio, cod_cliente, id_documento);
CREATE INDEX idx_documentos_resumen_anio_importe ON public.documentos_resumen (anio, ABS(importe) DESC);
CREATE INDEX idx_documentos_resumen_doc_ref ON public.documentos_resumen (doc_ref);

REVOKE ALL ON public.documentos_resumen FROM authenticated;
REVOKE ALL ON public.documentos_resumen FROM anon;
GRANT ALL ON public.documentos_resumen TO service_role;

DROP FUNCTION IF EXISTS public.actividad_interna_usuarios(integer, text);

CREATE FUNCTION public.actividad_interna_usuarios(_anio integer, _almacen text DEFAULT NULL::text)
RETURNS TABLE(registrado_por text, almacen_principal text, n_almacenes integer, importe_vendido numeric, docs_venta integer, n_abonos integer, importe_abonado numeric, abonos_ajenos integer, abonos_atribuidos integer, importe_atribuido numeric, importe_neto numeric, clientes_distintos integer, ticket_medio numeric, pct_abonos numeric, pct_importe_abonado numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.registrado_por, d.almacen, d.operacion, d.importe, d.cod_cliente, d.id_documento, d.id_doc_enlazado
    FROM public.documentos_resumen d
    WHERE d.anio = _anio
      AND d.registrado_por IS NOT NULL
      AND btrim(d.registrado_por) <> ''
      AND (_almacen IS NULL OR d.almacen = _almacen)
  ),
  princ AS (
    SELECT b.registrado_por, b.almacen, COUNT(DISTINCT b.id_documento) AS docs,
           ROW_NUMBER() OVER (PARTITION BY b.registrado_por ORDER BY COUNT(DISTINCT b.id_documento) DESC, b.almacen) AS rn
    FROM base b
    WHERE b.almacen IS NOT NULL
    GROUP BY b.registrado_por, b.almacen
  ),
  agg AS (
    SELECT
      b.registrado_por,
      COUNT(DISTINCT b.almacen)::int AS n_almacenes,
      COALESCE(SUM(CASE WHEN COALESCE(b.operacion,'Venta') <> 'Abono' THEN b.importe ELSE 0 END), 0)::numeric AS importe_vendido,
      COUNT(DISTINCT CASE WHEN COALESCE(b.operacion,'Venta') <> 'Abono' THEN b.id_documento END)::int AS docs_venta,
      COUNT(DISTINCT CASE WHEN b.operacion = 'Abono' THEN b.id_documento END)::int AS n_abonos,
      ABS(COALESCE(SUM(CASE WHEN b.operacion = 'Abono' THEN b.importe ELSE 0 END), 0))::numeric AS importe_abonado,
      COUNT(DISTINCT b.cod_cliente)::int AS clientes_distintos
    FROM base b
    GROUP BY b.registrado_por
  ),
  abonos AS (
    SELECT b.registrado_por AS tramitador, b.importe, s.registrado_por AS vendedor
    FROM base b
    LEFT JOIN LATERAL (
      SELECT s.registrado_por
      FROM public.documentos_resumen s
      WHERE s.doc_ref = btrim(b.id_doc_enlazado)
        AND COALESCE(s.operacion,'Venta') <> 'Abono'
      ORDER BY s.anio DESC, s.cod_cliente, s.id_documento
      LIMIT 1
    ) s ON TRUE
    WHERE b.operacion = 'Abono'
      AND NULLIF(btrim(COALESCE(b.id_doc_enlazado, '')), '') IS NOT NULL
  ),
  ajenos AS (
    SELECT x.tramitador AS registrado_por, COUNT(*)::int AS abonos_ajenos
    FROM abonos x
    WHERE x.vendedor IS NOT NULL
      AND btrim(x.vendedor) <> ''
      AND x.vendedor <> x.tramitador
    GROUP BY x.tramitador
  ),
  atrib AS (
    SELECT x.vendedor AS registrado_por,
           COUNT(*)::int AS abonos_atribuidos,
           ABS(COALESCE(SUM(x.importe), 0))::numeric AS importe_atribuido
    FROM abonos x
    WHERE x.vendedor IS NOT NULL
      AND btrim(x.vendedor) <> ''
    GROUP BY x.vendedor
  ),
  fin AS (
    SELECT
      COALESCE(a.registrado_por, t.registrado_por) AS registrado_por,
      COALESCE(a.n_almacenes, 0) AS n_almacenes,
      COALESCE(a.importe_vendido, 0)::numeric AS importe_vendido,
      COALESCE(a.docs_venta, 0) AS docs_venta,
      COALESCE(a.n_abonos, 0) AS n_abonos,
      COALESCE(a.importe_abonado, 0)::numeric AS importe_abonado,
      COALESCE(a.clientes_distintos, 0) AS clientes_distintos,
      COALESCE(t.abonos_atribuidos, 0) AS abonos_atribuidos,
      COALESCE(t.importe_atribuido, 0)::numeric AS importe_atribuido
    FROM agg a
    FULL OUTER JOIN atrib t ON t.registrado_por = a.registrado_por
  )
  SELECT
    f.registrado_por,
    p.almacen,
    f.n_almacenes,
    f.importe_vendido,
    f.docs_venta,
    f.n_abonos,
    f.importe_abonado,
    COALESCE(j.abonos_ajenos, 0) AS abonos_ajenos,
    f.abonos_atribuidos,
    f.importe_atribuido,
    (f.importe_vendido - f.importe_atribuido)::numeric AS importe_neto,
    f.clientes_distintos,
    ROUND(f.importe_vendido / NULLIF(f.docs_venta, 0), 2) AS ticket_medio,
    ROUND(f.abonos_atribuidos::numeric / NULLIF(f.docs_venta, 0) * 100, 2) AS pct_abonos,
    ROUND(f.importe_atribuido / NULLIF(f.importe_vendido, 0) * 100, 2) AS pct_importe_abonado
  FROM fin f
  LEFT JOIN princ p ON p.registrado_por = f.registrado_por AND p.rn = 1
  LEFT JOIN ajenos j ON j.registrado_por = f.registrado_por
  ORDER BY f.importe_vendido DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.actividad_interna_usuarios(integer, text) TO authenticated;

DROP FUNCTION IF EXISTS public.actividad_interna_almacenes(integer);

CREATE FUNCTION public.actividad_interna_almacenes(_anio integer)
RETURNS TABLE(almacen text, importe_vendido numeric, docs_venta integer, n_abonos integer, importe_abonado numeric, abonos_atribuidos integer, importe_atribuido numeric, importe_neto numeric, clientes_distintos integer, ticket_medio numeric, pct_abonos numeric, pct_importe_abonado numeric, n_usuarios integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.almacen, d.operacion, d.importe, d.cod_cliente, d.id_documento, d.id_doc_enlazado, d.registrado_por
    FROM public.documentos_resumen d
    WHERE d.anio = _anio AND d.almacen IS NOT NULL
  ),
  agg AS (
    SELECT
      b.almacen,
      COALESCE(SUM(CASE WHEN COALESCE(b.operacion,'Venta') <> 'Abono' THEN b.importe ELSE 0 END), 0)::numeric AS importe_vendido,
      COUNT(DISTINCT CASE WHEN COALESCE(b.operacion,'Venta') <> 'Abono' THEN b.id_documento END)::int AS docs_venta,
      COUNT(DISTINCT CASE WHEN b.operacion = 'Abono' THEN b.id_documento END)::int AS n_abonos,
      ABS(COALESCE(SUM(CASE WHEN b.operacion = 'Abono' THEN b.importe ELSE 0 END), 0))::numeric AS importe_abonado,
      COUNT(DISTINCT b.cod_cliente)::int AS clientes_distintos,
      COUNT(DISTINCT NULLIF(btrim(COALESCE(b.registrado_por,'')), ''))::int AS n_usuarios
    FROM base b
    GROUP BY b.almacen
  ),
  atrib AS (
    SELECT s.almacen AS almacen,
           COUNT(*)::int AS abonos_atribuidos,
           ABS(COALESCE(SUM(x.importe), 0))::numeric AS importe_atribuido
    FROM (
      SELECT b.importe, b.id_doc_enlazado
      FROM base b
      WHERE b.operacion = 'Abono'
        AND NULLIF(btrim(COALESCE(b.id_doc_enlazado, '')), '') IS NOT NULL
    ) x
    LEFT JOIN LATERAL (
      SELECT s.almacen
      FROM public.documentos_resumen s
      WHERE s.doc_ref = btrim(x.id_doc_enlazado)
        AND COALESCE(s.operacion,'Venta') <> 'Abono'
      ORDER BY s.anio DESC, s.cod_cliente, s.id_documento
      LIMIT 1
    ) s ON TRUE
    WHERE s.almacen IS NOT NULL
    GROUP BY s.almacen
  ),
  fin AS (
    SELECT
      COALESCE(a.almacen, t.almacen) AS almacen,
      COALESCE(a.importe_vendido, 0)::numeric AS importe_vendido,
      COALESCE(a.docs_venta, 0) AS docs_venta,
      COALESCE(a.n_abonos, 0) AS n_abonos,
      COALESCE(a.importe_abonado, 0)::numeric AS importe_abonado,
      COALESCE(a.clientes_distintos, 0) AS clientes_distintos,
      COALESCE(a.n_usuarios, 0) AS n_usuarios,
      COALESCE(t.abonos_atribuidos, 0) AS abonos_atribuidos,
      COALESCE(t.importe_atribuido, 0)::numeric AS importe_atribuido
    FROM agg a
    FULL OUTER JOIN atrib t ON t.almacen = a.almacen
  )
  SELECT
    f.almacen,
    f.importe_vendido,
    f.docs_venta,
    f.n_abonos,
    f.importe_abonado,
    f.abonos_atribuidos,
    f.importe_atribuido,
    (f.importe_vendido - f.importe_atribuido)::numeric AS importe_neto,
    f.clientes_distintos,
    ROUND(f.importe_vendido / NULLIF(f.docs_venta, 0), 2) AS ticket_medio,
    ROUND(f.abonos_atribuidos::numeric / NULLIF(f.docs_venta, 0) * 100, 2) AS pct_abonos,
    ROUND(f.importe_atribuido / NULLIF(f.importe_vendido, 0) * 100, 2) AS pct_importe_abonado,
    f.n_usuarios
  FROM fin f
  ORDER BY f.importe_vendido DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.actividad_interna_almacenes(integer) TO authenticated;