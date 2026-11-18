COMMENT ON FUNCTION public.kpi_base(date, date) IS 'Asignación de comercial (Gespromo → perfil) DUPLICADA en kpi_trazabilidad (solo para excluidos): mantener ambas sincronizadas.';
COMMENT ON FUNCTION public.kpi_detalle(uuid, int, int, text) IS 'DEPRECATED: retirada; sustituida por kpi_trazabilidad (0052).';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.dashboards WHERE key='kpi_visitas') THEN
    UPDATE public.dashboards SET is_active=false,
      description = 'DEPRECATED: KPI integrado en Objetivos (0051); /kpi redirige a /objetivos.'
    WHERE key='kpi_visitas';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_trazabilidad(_linea_id uuid, _anio int, _mes int, _vendedor text,
  _incluir_excluidos boolean DEFAULT false, _pagina int DEFAULT 1, _tamano int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '15s' AS $$
-- NOTA: la asignación de comercial para EXCLUIDOS duplica la de kpi_base: mantener ambas sincronizadas.
DECLARE u uuid := auth.uid(); a record; d1 date; d2 date; regla text; res jsonb; tam int; off int;
BEGIN
  SELECT * INTO a FROM public.kpi_ambito(u);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT l.regla_conteo INTO regla FROM kpi_lineas l WHERE l.id=_linea_id;
  IF regla IS NULL THEN RETURN NULL; END IF;
  d1 := make_date(_anio,_mes,1); d2 := (d1 + interval '1 month - 1 day')::date;
  tam := least(greatest(coalesce(_tamano,50),1),5000); off := (greatest(coalesce(_pagina,1),1)-1)*tam;

  CREATE TEMP TABLE IF NOT EXISTS _kt_cuenta(clave text, correcto boolean, bloque_id uuid, visita_id uuid, fecha date, motivo_key text, cliente text) ON COMMIT DROP;
  TRUNCATE _kt_cuenta;
  INSERT INTO _kt_cuenta
  SELECT CASE regla WHEN 'bloque' THEN x.bloque_id::text WHEN 'cliente_mes' THEN x.motivo_key||'|'||x.cliente
                    ELSE x.motivo_key||'|'||x.cliente||'|'||x.fecha END,
         x.correcto, x.bloque_id, x.visita_id, x.fecha, x.motivo_key, x.cliente
  FROM public.kpi_base(d1, d2) x
  WHERE x.linea_id=_linea_id AND x.vendedor=_vendedor
    AND (a.todo OR x.user_id=u OR (a.jefe AND a.delegacion IS NOT NULL AND x.delegacion=a.delegacion));

  WITH b AS (
    SELECT k.*, bl.revisado_por, bl.revisado_en, v.origen, v.cod_cliente, v.cliente_externo
    FROM _kt_cuenta k JOIN visita_bloques bl ON bl.id=k.bloque_id JOIN visitas v ON v.id=k.visita_id
  ), un AS (
    SELECT b.clave, b.correcto, min(b.fecha) fecha, min(b.motivo_key) motivo_key, min(b.cod_cliente) cod_cliente,
      min(b.cliente_externo) cliente_externo, count(*)::int n_bloques, string_agg(DISTINCT b.origen, ',') origen,
      (array_agg(b.revisado_por ORDER BY b.revisado_en DESC NULLS LAST))[1] revisor,
      max(b.revisado_en) revisado_en, bool_or(b.revisado_por IS NOT NULL) hay_rev,
      bool_or(b.origen='gespromo') hay_ges, array_agg(DISTINCT b.visita_id) visitas
    FROM b GROUP BY b.clave, b.correcto
  ), un2 AS (
    SELECT un.*, CASE WHEN NOT un.correcto THEN 'Pendiente'
      WHEN un.hay_rev THEN 'Revisada en el CRM'
      WHEN un.hay_ges THEN 'Importada de Gespromo'
      ELSE 'Correcto sin revisor (app)' END tipo FROM un
  )
  SELECT jsonb_build_object(
    'regla', regla,
    'resumen', jsonb_build_object(
      'bloques', (SELECT count(*) FROM _kt_cuenta),
      'unidades', (SELECT count(*) FROM un2),
      'conseguidos', (SELECT count(*) FROM un2 WHERE correcto),
      'pendientes', (SELECT count(*) FROM un2 WHERE NOT correcto),
      'por_tipo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, count(*) n FROM un2 GROUP BY tipo) t), '{}'::jsonb)),
    'total', (SELECT count(*) FROM un2),
    'filas', coalesce((SELECT jsonb_agg(r ORDER BY r->>'fecha', r->>'clave') FROM (
      SELECT jsonb_build_object('clave', un2.clave, 'fecha', un2.fecha,
        'semana_iso', to_char(un2.fecha,'IYYY-"S"IW'), 'cod_cliente', un2.cod_cliente,
        'cliente', coalesce(c.cliente, un2.cliente_externo), 'motivo', coalesce(m.nombre, un2.motivo_key),
        'bloques', un2.n_bloques, 'origen', un2.origen, 'estado', CASE WHEN un2.correcto THEN 'Correcto' ELSE 'Pendiente' END,
        'tipo_validacion', un2.tipo, 'revisor', p.full_name, 'revisado_en', un2.revisado_en, 'visitas', to_jsonb(un2.visitas)) r
      FROM un2 LEFT JOIN clientes c ON c.cod_cliente=un2.cod_cliente LEFT JOIN motivos_visita m ON m.key=un2.motivo_key
        LEFT JOIN profiles p ON p.user_id=un2.revisor
      ORDER BY un2.fecha, un2.clave LIMIT tam OFFSET off) s), '[]'::jsonb)
  ) INTO res;

  IF coalesce(_incluir_excluidos,false) THEN
    WITH cfg AS (
      SELECT coalesce((SELECT to_date(value,'YYYY-MM') FROM app_settings WHERE key='kpi_contar_desde'), d1) AS desde,
             coalesce((SELECT string_to_array(replace(value,' ',''),',') FROM app_settings WHERE key='kpi_origenes'), ARRAY['app','gespromo']) AS origenes
    ), mot AS (SELECT motivo_key FROM kpi_linea_motivos WHERE linea_id=_linea_id),
    b AS MATERIALIZED (
      SELECT v.id visita_id, v.origen, v.user_id, v.vendedor, v.comercial_nombre, v.fecha, v.cod_cliente, v.cliente_externo,
             bl.id bloque_id, bl.motivo_key, upper(coalesce(bl.validacion,'pendiente')) val, bl.revisado_por, bl.revisado_en,
             CASE WHEN NOT (v.origen = ANY(cfg.origenes)) THEN 'Origen no incluido'
                  WHEN v.fecha < cfg.desde THEN 'Anterior a contar desde'
                  WHEN upper(coalesce(bl.validacion,'pendiente'))='NO CORRECTO' THEN 'No correcto'
                  WHEN upper(coalesce(bl.validacion,'pendiente')) NOT IN ('CORRECTO','PENDIENTE') THEN 'Validación desconocida: '||bl.validacion
             END motivo_exclusion
      FROM visita_bloques bl JOIN mot ON mot.motivo_key=bl.motivo_key JOIN visitas v ON v.id=bl.visita_id, cfg
      WHERE v.fecha BETWEEN d1 AND d2
    ), ex AS MATERIALIZED (SELECT * FROM b WHERE motivo_exclusion IS NOT NULL),
    nombres AS MATERIALIZED (SELECT DISTINCT ex.origen, ex.user_id, ex.vendedor, ex.comercial_nombre, substring(ex.vendedor from '^\s*(\d+)\s*-') cod FROM ex),
    codmap AS MATERIALIZED (
      SELECT DISTINCT ON (c.cod_vendedor) c.cod_vendedor, c.vendedor FROM clientes c
      WHERE c.cod_vendedor IN (SELECT n.cod FROM nombres n WHERE n.cod IS NOT NULL)
      GROUP BY c.cod_vendedor, c.vendedor ORDER BY c.cod_vendedor, count(*) DESC),
    r1 AS MATERIALIZED (
      SELECT n.*, CASE WHEN n.origen <> 'gespromo' AND n.user_id IS NOT NULL
        THEN coalesce((SELECT nullif(p.employee_code,'') FROM profiles p WHERE p.user_id=n.user_id), n.comercial_nombre, n.vendedor)
        ELSE coalesce(cm.vendedor, n.vendedor) END canon
      FROM nombres n LEFT JOIN codmap cm ON cm.cod_vendedor=n.cod),
    canones AS MATERIALIZED (
      SELECT c.canon, public.delegacion_vendedor(c.canon) deleg,
        (SELECT p.user_id FROM profiles p WHERE p.estado <> 'baja' AND normalizar_texto(p.employee_code)=normalizar_texto(c.canon) ORDER BY p.created_at LIMIT 1) uid_canon
      FROM (SELECT DISTINCT canon FROM r1) c),
    r2 AS (SELECT r1.*, k.deleg, CASE WHEN r1.origen <> 'gespromo' AND r1.user_id IS NOT NULL THEN r1.user_id ELSE k.uid_canon END uid
           FROM r1 JOIN canones k ON k.canon IS NOT DISTINCT FROM r1.canon),
    exr AS (
      SELECT ex.* FROM ex JOIN r2 ON r2.origen=ex.origen AND r2.user_id IS NOT DISTINCT FROM ex.user_id
        AND r2.vendedor IS NOT DISTINCT FROM ex.vendedor AND r2.comercial_nombre IS NOT DISTINCT FROM ex.comercial_nombre
      WHERE r2.canon=_vendedor AND (a.todo OR r2.uid=u OR (a.jefe AND a.delegacion IS NOT NULL AND r2.deleg=a.delegacion)))
    SELECT res || jsonb_build_object(
      'excluidos_por_motivo', coalesce((SELECT jsonb_object_agg(motivo_exclusion, n) FROM (SELECT motivo_exclusion, count(*) n FROM exr GROUP BY 1) t), '{}'::jsonb),
      'excluidos', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', exr.fecha, 'semana_iso', to_char(exr.fecha,'IYYY-"S"IW'),
          'cod_cliente', exr.cod_cliente, 'cliente', coalesce(c.cliente, exr.cliente_externo), 'motivo', coalesce(m.nombre, exr.motivo_key),
          'origen', exr.origen, 'estado', exr.val, 'motivo_exclusion', exr.motivo_exclusion, 'revisor', p.full_name,
          'revisado_en', exr.revisado_en, 'visitas', jsonb_build_array(exr.visita_id)) ORDER BY exr.fecha)
        FROM exr LEFT JOIN clientes c ON c.cod_cliente=exr.cod_cliente LEFT JOIN motivos_visita m ON m.key=exr.motivo_key
          LEFT JOIN profiles p ON p.user_id=exr.revisado_por), '[]'::jsonb)) INTO res;
  END IF;
  RETURN res;
END $$;
COMMENT ON FUNCTION public.kpi_trazabilidad(uuid,int,int,text,boolean,int,int) IS 'Detalle trazable de una celda KPI. Lo que cuenta sale de kpi_base; la asignación de comercial de los excluidos está DUPLICADA de kpi_base: mantener ambas sincronizadas.';
REVOKE ALL ON FUNCTION public.kpi_trazabilidad(uuid,int,int,text,boolean,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_trazabilidad(uuid,int,int,text,boolean,int,int) TO authenticated, service_role;