
DROP TABLE IF EXISTS public._diag_obj;
CREATE TABLE public._diag_obj(k bigserial primary key, seccion text, ms numeric, detalle text);

CREATE OR REPLACE FUNCTION public._diag_obj_run(_anio int) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE t0 timestamptz; t1 timestamptz; v_q int; v_f date; v_todos boolean; v_vend text; n bigint; rec record; ln int := 0;
BEGIN
  t0 := clock_timestamp();
  IF NOT public.is_approved(auth.uid()) THEN
    INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES ('ABORT: no aprobado',0,coalesce(auth.uid()::text,'null')); RETURN;
  END IF;
  v_todos := public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'director_comercial');
  v_vend := public.get_user_employee_code(auth.uid());
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('A rol (is_approved+is_admin+has_role+employee_code)', extract(epoch from (t1-t0))*1000,
     'uid='||coalesce(auth.uid()::text,'null')||' todos='||v_todos||' vend='||coalesce(v_vend,'null'));

  t0 := clock_timestamp();
  v_q := public.quincena_corte(_anio);
  v_f := public.fecha_corte_datos();
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('B quincena_corte+fecha_corte_datos', extract(epoch from (t1-t0))*1000, 'q='||v_q||' f='||v_f);

  t0 := clock_timestamp();
  CREATE TEMP TABLE d_obj ON COMMIT DROP AS
    SELECT o.* FROM public.objetivos o WHERE o.anio = _anio AND (v_todos OR o.vendedor = v_vend);
  CREATE TEMP TABLE d_rutas ON COMMIT DROP AS
    SELECT DISTINCT o.ruta FROM d_obj o WHERE o.tipo='ruta' AND o.activo AND o.ruta IS NOT NULL;
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('obj+rutas_obj', extract(epoch from (t1-t0))*1000, (SELECT count(*)||' objetivos' FROM d_obj));

  t0 := clock_timestamp();
  CREATE TEMP TABLE d_ventas ON COMMIT DROP AS
    SELECT c.vendedor AS vend, NULLIF(c.ruta_especial,'') AS ruta_esp,
           EXTRACT(YEAR FROM v.fecha)::int AS anio, public.quincena_de(v.fecha) AS q,
           SUM(v.importe) AS importe
    FROM public.ventas_diarias v JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    WHERE v.fecha >= make_date(_anio-1,1,1) AND v.fecha < make_date(_anio+1,1,1)
      AND c.vendedor IS NOT NULL AND c.vendedor <> '' AND (v_todos OR c.vendedor = v_vend)
    GROUP BY 1,2,3,4;
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('C CTE ventas', extract(epoch from (t1-t0))*1000, (SELECT count(*)||' filas' FROM d_ventas));

  t0 := clock_timestamp();
  CREATE TEMP TABLE d_agg ON COMMIT DROP AS
    SELECT o.id, ve.anio, ve.q, SUM(ve.importe) AS importe
    FROM d_obj o JOIN d_ventas ve ON ve.vend = o.vendedor
      AND ((o.tipo='ruta' AND ve.ruta_esp = o.ruta)
        OR (o.tipo='cartera' AND (ve.ruta_esp IS NULL OR ve.ruta_esp NOT IN (SELECT ru.ruta FROM d_rutas ru))))
    GROUP BY 1,2,3;
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('D CTE agg', extract(epoch from (t1-t0))*1000, (SELECT count(*)||' filas' FROM d_agg));

  t0 := clock_timestamp();
  CREATE TEMP TABLE d_serie ON COMMIT DROP AS
    SELECT a.id, jsonb_agg(jsonb_build_object('q',a.q,'anio',a.anio,'importe',a.importe) ORDER BY a.anio,a.q) AS series
    FROM d_agg a GROUP BY a.id;
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('E CTE serie (jsonb_agg)', extract(epoch from (t1-t0))*1000, (SELECT count(*)||' filas' FROM d_serie));

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM (
    SELECT o.id,
      COALESCE((SELECT SUM(a.importe) FROM d_agg a WHERE a.id=o.id AND a.anio=_anio),0) x1,
      COALESCE((SELECT SUM(a.importe) FROM d_agg a WHERE a.id=o.id AND a.anio=_anio-1 AND a.q<=v_q),0) x2,
      COALESCE((SELECT SUM(a.importe) FROM d_agg a WHERE a.id=o.id AND a.anio=_anio-1),0) x3,
      COALESCE(s.series,'[]'::jsonb) ser
    FROM d_obj o LEFT JOIN d_serie s ON s.id=o.id
    ORDER BY o.tipo,o.vendedor,o.ruta NULLS FIRST) z;
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('F select final (3 correladas + join serie)', extract(epoch from (t1-t0))*1000, n||' filas');

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM (
    WITH obj AS (
      SELECT o.* FROM public.objetivos o WHERE o.anio = _anio AND (v_todos OR o.vendedor = v_vend)
    ), rutas_obj AS (
      SELECT DISTINCT o.ruta FROM obj o WHERE o.tipo='ruta' AND o.activo AND o.ruta IS NOT NULL
    ), ventas AS (
      SELECT c.vendedor AS vend, NULLIF(c.ruta_especial,'') AS ruta_esp,
             EXTRACT(YEAR FROM v.fecha)::int AS anio, public.quincena_de(v.fecha) AS q, SUM(v.importe) AS importe
      FROM public.ventas_diarias v JOIN public.clientes c ON c.cod_cliente=v.cod_cliente
      WHERE v.fecha >= make_date(_anio-1,1,1) AND v.fecha < make_date(_anio+1,1,1)
        AND c.vendedor IS NOT NULL AND c.vendedor <> '' AND (v_todos OR c.vendedor = v_vend)
      GROUP BY 1,2,3,4
    ), agg AS (
      SELECT o.id, ve.anio, ve.q, SUM(ve.importe) AS importe
      FROM obj o JOIN ventas ve ON ve.vend=o.vendedor
        AND ((o.tipo='ruta' AND ve.ruta_esp=o.ruta)
          OR (o.tipo='cartera' AND (ve.ruta_esp IS NULL OR ve.ruta_esp NOT IN (SELECT ru.ruta FROM rutas_obj ru))))
      GROUP BY 1,2,3
    ), serie AS (
      SELECT a.id, jsonb_agg(jsonb_build_object('q',a.q,'anio',a.anio,'importe',a.importe) ORDER BY a.anio,a.q) AS series
      FROM agg a GROUP BY a.id
    )
    SELECT o.id, o.tipo, o.vendedor,
      COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id=o.id AND a.anio=_anio),0) x1,
      COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id=o.id AND a.anio=_anio-1 AND a.q<=v_q),0) x2,
      COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id=o.id AND a.anio=_anio-1),0) x3,
      v_q, v_f, COALESCE(s.series,'[]'::jsonb) ser
    FROM obj o LEFT JOIN serie s ON s.id=o.id
    ORDER BY o.tipo,o.vendedor,o.ruta NULLS FIRST) z2;
  t1 := clock_timestamp();
  INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES
    ('TOTAL consulta original (parametros reales)', extract(epoch from (t1-t0))*1000, n||' filas');

  FOR rec IN EXECUTE $q$
    EXPLAIN (ANALYZE, TIMING OFF, BUFFERS)
    WITH obj AS (
      SELECT o.* FROM public.objetivos o WHERE o.anio = $1 AND ($2 OR o.vendedor = $3)
    ), rutas_obj AS (
      SELECT DISTINCT o.ruta FROM obj o WHERE o.tipo='ruta' AND o.activo AND o.ruta IS NOT NULL
    ), ventas AS (
      SELECT c.vendedor AS vend, NULLIF(c.ruta_especial,'') AS ruta_esp,
             EXTRACT(YEAR FROM v.fecha)::int AS anio, public.quincena_de(v.fecha) AS q, SUM(v.importe) AS importe
      FROM public.ventas_diarias v JOIN public.clientes c ON c.cod_cliente=v.cod_cliente
      WHERE v.fecha >= make_date($1-1,1,1) AND v.fecha < make_date($1+1,1,1)
        AND c.vendedor IS NOT NULL AND c.vendedor <> '' AND ($2 OR c.vendedor = $3)
      GROUP BY 1,2,3,4
    ), agg AS (
      SELECT o.id, ve.anio, ve.q, SUM(ve.importe) AS importe
      FROM obj o JOIN ventas ve ON ve.vend=o.vendedor
        AND ((o.tipo='ruta' AND ve.ruta_esp=o.ruta)
          OR (o.tipo='cartera' AND (ve.ruta_esp IS NULL OR ve.ruta_esp NOT IN (SELECT ru.ruta FROM rutas_obj ru))))
      GROUP BY 1,2,3
    ), serie AS (
      SELECT a.id, jsonb_agg(jsonb_build_object('q',a.q,'anio',a.anio,'importe',a.importe) ORDER BY a.anio,a.q) AS series
      FROM agg a GROUP BY a.id
    )
    SELECT o.id,
      COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id=o.id AND a.anio=$1),0),
      COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id=o.id AND a.anio=$1-1 AND a.q<=$4),0),
      COALESCE((SELECT SUM(a.importe) FROM agg a WHERE a.id=o.id AND a.anio=$1-1),0),
      COALESCE(s.series,'[]'::jsonb)
    FROM obj o LEFT JOIN serie s ON s.id=o.id
    ORDER BY o.tipo,o.vendedor,o.ruta NULLS FIRST
  $q$ USING _anio, v_todos, v_vend, v_q
  LOOP
    ln := ln + 1;
    INSERT INTO public._diag_obj(seccion,ms,detalle) VALUES ('PLAN '||lpad(ln::text,3,'0'), NULL, rec."QUERY PLAN");
  END LOOP;
END; $f$;

GRANT EXECUTE ON FUNCTION public._diag_obj_run(int) TO authenticated;

DO $d$
BEGIN
  EXECUTE 'SET LOCAL statement_timeout = ''300s''';
  EXECUTE 'SET LOCAL request.jwt.claims = ''{"sub":"28f5caa7-bae6-4137-872e-a044a06848b0","role":"authenticated"}''';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public._diag_obj_run(2026);
  EXECUTE 'RESET ROLE';
END; $d$;

RESET ROLE;
DROP FUNCTION IF EXISTS public._diag_obj_run(int);
