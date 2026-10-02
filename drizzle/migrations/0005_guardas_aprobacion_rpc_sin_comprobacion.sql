CREATE OR REPLACE FUNCTION public.actividad_interna_almacenes(_anio integer)
 RETURNS TABLE(almacen text, importe_vendido numeric, docs_venta integer, n_abonos integer, importe_abonado numeric, abonos_atribuidos integer, importe_atribuido numeric, importe_neto numeric, clientes_distintos integer, ticket_medio numeric, pct_abonos numeric, pct_importe_abonado numeric, n_usuarios integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION public.actividad_interna_filtros()
 RETURNS TABLE(anios integer[], almacenes text[], motivos text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT ARRAY_AGG(DISTINCT d.anio ORDER BY d.anio DESC) FROM public.documentos_resumen d WHERE d.anio IS NOT NULL),
    (SELECT ARRAY_AGG(DISTINCT d.almacen ORDER BY d.almacen) FROM public.documentos_resumen d WHERE d.almacen IS NOT NULL),
    (SELECT ARRAY_AGG(DISTINCT m.motivo ORDER BY m.motivo) FROM (
       SELECT COALESCE(NULLIF(btrim(COALESCE(d.motivo_abono, '')), ''), 'SIN MOTIVO') AS motivo
       FROM public.documentos_resumen d
       WHERE d.operacion = 'Abono'
     ) m);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actividad_interna_motivos(_anio integer, _almacen text DEFAULT NULL::text)
 RETURNS TABLE(motivo text, n_abonos integer, importe numeric, pct_n numeric, pct_importe numeric, tramitadores integer, clientes_distintos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT COALESCE(NULLIF(btrim(COALESCE(d.motivo_abono, '')), ''), 'SIN MOTIVO') AS motivo_norm,
           d.id_documento, d.importe, d.registrado_por, d.cod_cliente
    FROM public.documentos_resumen d
    WHERE d.anio = _anio
      AND d.operacion = 'Abono'
      AND (_almacen IS NULL OR d.almacen = _almacen)
  ),
  agg AS (
    SELECT b.motivo_norm AS motivo,
           COUNT(DISTINCT b.id_documento)::int AS n_abonos,
           ABS(COALESCE(SUM(b.importe), 0))::numeric AS importe,
           COUNT(DISTINCT b.registrado_por)::int AS tramitadores,
           COUNT(DISTINCT b.cod_cliente)::int AS clientes_distintos
    FROM base b
    GROUP BY b.motivo_norm
  ),
  tot AS (
    SELECT SUM(a.n_abonos)::numeric AS t_n, SUM(a.importe)::numeric AS t_imp FROM agg a
  )
  SELECT a.motivo,
         a.n_abonos,
         a.importe,
         ROUND(a.n_abonos::numeric / NULLIF(t.t_n, 0) * 100, 2) AS pct_n,
         ROUND(a.importe / NULLIF(t.t_imp, 0) * 100, 2) AS pct_importe,
         a.tramitadores,
         a.clientes_distintos
  FROM agg a CROSS JOIN tot t
  ORDER BY a.n_abonos DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actividad_interna_usuarios(_anio integer, _almacen text DEFAULT NULL::text, _motivo text DEFAULT NULL::text)
 RETURNS TABLE(registrado_por text, almacen_principal text, n_almacenes integer, importe_vendido numeric, docs_venta integer, n_abonos integer, importe_abonado numeric, abonos_ajenos integer, abonos_atribuidos integer, importe_atribuido numeric, importe_neto numeric, clientes_distintos integer, ticket_medio numeric, pct_abonos numeric, pct_importe_abonado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_dashboard_access
               WHERE user_id = auth.uid() AND dashboard_key = 'actividad_interna')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.registrado_por, d.almacen, d.operacion, d.importe, d.cod_cliente, d.id_documento, d.id_doc_enlazado,
           COALESCE(NULLIF(btrim(COALESCE(d.motivo_abono, '')), ''), 'SIN MOTIVO') AS motivo_norm
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
      COUNT(DISTINCT CASE WHEN b.operacion = 'Abono' AND (_motivo IS NULL OR b.motivo_norm = _motivo) THEN b.id_documento END)::int AS n_abonos,
      ABS(COALESCE(SUM(CASE WHEN b.operacion = 'Abono' AND (_motivo IS NULL OR b.motivo_norm = _motivo) THEN b.importe ELSE 0 END), 0))::numeric AS importe_abonado,
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
      AND (_motivo IS NULL OR b.motivo_norm = _motivo)
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

CREATE OR REPLACE FUNCTION public.cliente_top_productos(_cod integer, _desde date, _hasta date, _desde_prev date DEFAULT NULL::date, _hasta_prev date DEFAULT NULL::date)
 RETURNS TABLE(referencia text, descripcion text, familia text, marca text, unidades numeric, importe numeric, margen numeric, ultima_compra date, unidades_anterior numeric, importe_anterior numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_margen boolean;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  v_margen := public.puede_ver_margen(auth.uid());
  RETURN QUERY
  SELECT v.referencia,
         p.descripcion,
         COALESCE(p.familia_nombre, p.familia, v.familia),
         COALESCE(p.marca_nombre, p.marca, v.marca),
         COALESCE(SUM(v.unidades) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0),
         COALESCE(SUM(v.importe) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0),
         CASE WHEN v_margen THEN COALESCE(SUM(v.margen) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0) ELSE 0 END,
         MAX(v.fecha) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta),
         COALESCE(SUM(v.unidades) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0),
         COALESCE(SUM(v.importe) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0)
  FROM public.ventas_diarias v
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE v.cod_cliente = _cod
    AND v.fecha >= LEAST(_desde, COALESCE(_desde_prev, _desde))
    AND v.fecha <= GREATEST(_hasta, COALESCE(_hasta_prev, _hasta))
  GROUP BY v.referencia, p.descripcion,
           COALESCE(p.familia_nombre, p.familia, v.familia),
           COALESCE(p.marca_nombre, p.marca, v.marca)
  ORDER BY GREATEST(
             COALESCE(SUM(v.importe) FILTER (WHERE v.fecha BETWEEN _desde AND _hasta), 0),
             COALESCE(SUM(v.importe) FILTER (WHERE _desde_prev IS NOT NULL AND v.fecha BETWEEN _desde_prev AND _hasta_prev), 0)
           ) DESC
  LIMIT 500;
END;
$function$;

CREATE OR REPLACE FUNCTION public.situaciones_activas()
 RETURNS TABLE(cod_cliente integer, etiqueta text, categoria text, nota text, efecto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (s.cod_cliente) s.cod_cliente, s.etiqueta, s.categoria, s.nota, s.efecto
  FROM public.situaciones_cliente s
  WHERE s.activo
    AND s.desde <= CURRENT_DATE
    AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE)
    AND (SELECT public.is_approved(auth.uid()))
  ORDER BY s.cod_cliente, s.updated_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.has_dashboard_access(_user_id uuid, _dashboard_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin(_user_id)
    OR (public.is_approved(_user_id) AND EXISTS (
      SELECT 1 FROM public.user_dashboard_access
      WHERE user_id = _user_id AND dashboard_key = _dashboard_key
    ));
$function$;
