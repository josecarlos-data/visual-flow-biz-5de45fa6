-- 1. cliente_kpis: sólo lectura para usuarios; escritura vía service_role / funciones internas
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cliente_kpis FROM authenticated, anon;
GRANT SELECT ON public.cliente_kpis TO authenticated;
GRANT ALL ON public.cliente_kpis TO service_role;

-- 2. Función interna: no debe poder llamarse directamente desde el cliente
REVOKE ALL ON FUNCTION public.clientes_permitidos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clientes_permitidos(uuid) TO service_role;

-- 3. Inline del cálculo de quincena para poder fijar search_path sin perder rendimiento
CREATE OR REPLACE FUNCTION public.objetivos_seguimiento(_anio integer)
RETURNS TABLE(id uuid, tipo text, vendedor text, cod_vendedor text, ruta text, importe_objetivo numeric, nota text, activo boolean, vendido numeric, vendido_anterior_ytd numeric, total_anterior numeric, quincena_corte integer, fecha_corte date, series jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_q int; v_f date; v_todos boolean; v_vend text;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;
  v_todos := public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial');
  v_vend := public.get_user_employee_code(auth.uid());
  IF NOT v_todos AND (v_vend IS NULL OR v_vend = '') THEN RETURN; END IF;

  v_q := public.quincena_corte(_anio);
  v_f := public.fecha_corte_datos();

  RETURN QUERY
  WITH obj AS (
    SELECT o.* FROM public.objetivos o
    WHERE o.anio = _anio AND (v_todos OR o.vendedor = v_vend)
  ),
  rutas_obj AS (
    SELECT DISTINCT o.ruta FROM obj o WHERE o.tipo = 'ruta' AND o.activo AND o.ruta IS NOT NULL
  ),
  ventas AS (
    SELECT c.vendedor AS vend,
           NULLIF(c.ruta_especial, '') AS ruta_esp,
           EXTRACT(YEAR FROM v.fecha)::int AS anio,
           -- cálculo de quincena en línea (equivalente a public.quincena_de)
           (EXTRACT(MONTH FROM v.fecha)::int - 1) * 2
             + CASE WHEN EXTRACT(DAY FROM v.fecha)::int <= 15 THEN 1 ELSE 2 END AS q,
           SUM(v.importe) AS importe
    FROM public.ventas_diarias v
    JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    WHERE v.fecha >= make_date(_anio - 1, 1, 1)
      AND v.fecha <  make_date(_anio + 1, 1, 1)
      AND c.vendedor IS NOT NULL AND c.vendedor <> ''
      AND (v_todos OR c.vendedor = v_vend)
    GROUP BY 1,2,3,4
  ),
  agg AS (
    SELECT o.id, ve.anio, ve.q, SUM(ve.importe) AS importe
    FROM obj o
    JOIN ventas ve ON ve.vend = o.vendedor
      AND (
        (o.tipo = 'ruta' AND ve.ruta_esp = o.ruta)
        OR (o.tipo = 'cartera' AND (ve.ruta_esp IS NULL OR ve.ruta_esp NOT IN (SELECT r.ruta FROM rutas_obj r)))
      )
    GROUP BY 1,2,3
  ),
  serie AS (
    SELECT a.id,
           jsonb_agg(jsonb_build_object('q', a.q, 'anio', a.anio, 'importe', a.importe) ORDER BY a.anio, a.q) AS series
    FROM agg a GROUP BY a.id
  )
  SELECT o.id, o.tipo, o.vendedor, o.cod_vendedor, o.ruta,
         o.importe_objetivo, o.nota, o.activo,
         COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id = o.id AND a.anio = _anio), 0),
         COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id = o.id AND a.anio = _anio - 1 AND a.q <= v_q), 0),
         COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id = o.id AND a.anio = _anio - 1), 0),
         v_q, v_f, COALESCE(s.series, '[]'::jsonb)
  FROM obj o
  LEFT JOIN serie s ON s.id = o.id
  ORDER BY o.tipo, o.vendedor, o.ruta NULLS FIRST;
END;
$$;

REVOKE ALL ON FUNCTION public.objetivos_seguimiento(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_seguimiento(integer) TO authenticated, service_role;

-- quincena_de ya no se usa en bucles por fila: se puede fijar search_path
ALTER FUNCTION public.quincena_de(date) SET search_path = public;