CREATE OR REPLACE FUNCTION public.kpi_base(_desde date, _hasta date)
RETURNS TABLE(vendedor text, user_id uuid, delegacion text, mes int, linea_id uuid, regla text, motivo_key text, cliente text, fecha date, bloque_id uuid, visita_id uuid, correcto boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT greatest(_desde, coalesce((SELECT to_date(value,'YYYY-MM') FROM app_settings WHERE key='kpi_contar_desde'), _desde)) AS desde,
           coalesce((SELECT string_to_array(replace(value,' ',''),',') FROM app_settings WHERE key='kpi_origenes'), ARRAY['app','gespromo']) AS origenes
  ), lm AS (
    SELECT l.id, l.regla_conteo, m.motivo_key FROM kpi_lineas l JOIN kpi_linea_motivos m ON m.linea_id=l.id WHERE l.activo
  ), b AS MATERIALIZED (
    SELECT v.id AS visita_id, v.origen, v.user_id, v.vendedor, v.comercial_nombre, v.fecha, v.cod_cliente, v.cliente_externo,
           bl.id AS bloque_id, bl.motivo_key, upper(coalesce(bl.validacion,'pendiente')) AS val, lm.id AS linea_id, lm.regla_conteo
    FROM visita_bloques bl JOIN lm ON lm.motivo_key = bl.motivo_key
    JOIN visitas v ON v.id = bl.visita_id, cfg
    WHERE v.fecha >= cfg.desde AND v.fecha <= _hasta AND v.origen = ANY(cfg.origenes)
      AND upper(coalesce(bl.validacion,'pendiente')) IN ('CORRECTO','PENDIENTE')
  ), nombres AS MATERIALIZED (
    SELECT DISTINCT b.origen, b.user_id, b.vendedor, b.comercial_nombre,
           substring(b.vendedor from '^\s*(\d+)\s*-') AS cod FROM b
  ), codmap AS MATERIALIZED (
    SELECT DISTINCT ON (c.cod_vendedor) c.cod_vendedor, c.vendedor
    FROM clientes c
    WHERE c.cod_vendedor IN (SELECT n.cod FROM nombres n WHERE n.cod IS NOT NULL)
    GROUP BY c.cod_vendedor, c.vendedor
    ORDER BY c.cod_vendedor, count(*) DESC
  ), res AS MATERIALIZED (
    SELECT n.origen, n.user_id, n.vendedor, n.comercial_nombre,
      CASE WHEN n.origen <> 'gespromo' AND n.user_id IS NOT NULL
        THEN coalesce((SELECT nullif(p.employee_code,'') FROM profiles p WHERE p.user_id=n.user_id), n.comercial_nombre, n.vendedor)
        ELSE coalesce(cm.vendedor, n.vendedor) END AS canon
    FROM nombres n LEFT JOIN codmap cm ON cm.cod_vendedor = n.cod
  ), canones AS MATERIALIZED (
    SELECT c.canon, public.delegacion_vendedor(c.canon) AS deleg,
      (SELECT p.user_id FROM profiles p WHERE p.estado <> 'baja' AND normalizar_texto(p.employee_code)=normalizar_texto(c.canon) ORDER BY p.created_at LIMIT 1) AS uid_canon
    FROM (SELECT DISTINCT canon FROM res) c
  ), res2 AS MATERIALIZED (
    SELECT r.*, k.deleg,
      CASE WHEN r.origen <> 'gespromo' AND r.user_id IS NOT NULL THEN r.user_id ELSE k.uid_canon END AS uid
    FROM res r JOIN canones k ON k.canon IS NOT DISTINCT FROM r.canon
  )
  SELECT r.canon, r.uid, r.deleg, extract(month FROM b.fecha)::int, b.linea_id, b.regla_conteo, b.motivo_key,
         coalesce(b.cod_cliente::text, 'ext:'||normalizar_texto(coalesce(b.cliente_externo,''))), b.fecha, b.bloque_id, b.visita_id, b.val='CORRECTO'
  FROM b JOIN res2 r ON r.origen=b.origen AND r.user_id IS NOT DISTINCT FROM b.user_id AND r.vendedor IS NOT DISTINCT FROM b.vendedor AND r.comercial_nombre IS NOT DISTINCT FROM b.comercial_nombre
$$;
REVOKE ALL ON FUNCTION public.kpi_base(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_base(date, date) TO service_role;