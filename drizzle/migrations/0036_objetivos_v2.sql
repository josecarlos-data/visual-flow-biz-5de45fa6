-- Objetivos v2 (entrega 1): motor común, objetivos de venta y migración de 2026.
-- La tabla public.objetivos y sus funciones antiguas no se tocan.

CREATE TABLE public.tipos_objetivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  visible boolean NOT NULL DEFAULT false,
  disponible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_objetivo TO authenticated;
GRANT ALL ON public.tipos_objetivo TO service_role;
ALTER TABLE public.tipos_objetivo ENABLE ROW LEVEL SECURITY;

INSERT INTO public.tipos_objetivo (key, nombre, descripcion, visible, disponible, sort_order) VALUES
 ('cartera',   'Cartera',          'Facturación de la cartera del comercial frente al mismo periodo del año anterior', true,  true,  1),
 ('clientes',  'Lista de clientes','Conjunto de clientes con meta conjunta o por cliente', true, true, 2),
 ('cliente',   'Cliente concreto', 'Meta sobre un solo cliente', true, true, 3),
 ('actividad', 'Actividad',        'Motivos de visita validados (fase futura)', false, false, 10),
 ('rappel',    'Rappel de cliente','Tramos importe → % del Maestro ISI (fase futura)', false, false, 11),
 ('campana',   'Campaña',          'Clientes seleccionados con condiciones y beneficio sobre el incremento (fase futura)', false, false, 12);

CREATE TABLE public.objetivos_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL REFERENCES public.tipos_objetivo(key),
  desde date NOT NULL,
  hasta date NOT NULL,
  medida text NOT NULL DEFAULT 'importe' CHECK (medida IN ('importe','margen','unidades')),
  atribucion text NOT NULL DEFAULT 'foto_cartera' CHECK (atribucion IN ('ficha_actual','foto_cartera')),
  comparacion text NOT NULL DEFAULT 'fecha_corte' CHECK (comparacion IN ('fecha_corte','quincena_completa')),
  meta_tipo text NOT NULL DEFAULT 'pct' CHECK (meta_tipo IN ('pct','importe')),
  meta_valor numeric,
  modo_lista text NOT NULL DEFAULT 'conjunto' CHECK (modo_lista IN ('conjunto','por_cliente')),
  excluir_de_cartera boolean NOT NULL DEFAULT false,
  contar_ajenos boolean NOT NULL DEFAULT false,
  tramos jsonb NOT NULL DEFAULT '[{"pct":100,"etiqueta":"Objetivo"}]'::jsonb,
  mostrar_importe boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','activo','cerrado','archivado')),
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  nota text,
  origen_legacy jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta >= desde)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objetivos_v2 TO authenticated;
GRANT ALL ON public.objetivos_v2 TO service_role;
ALTER TABLE public.objetivos_v2 ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.objetivo_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objetivo_id uuid NOT NULL REFERENCES public.objetivos_v2(id) ON DELETE CASCADE,
  vendedor text NOT NULL,
  user_id uuid,
  meta_tipo text CHECK (meta_tipo IN ('pct','importe')),
  meta_valor numeric,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (objetivo_id, vendedor)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objetivo_asignaciones TO authenticated;
GRANT ALL ON public.objetivo_asignaciones TO service_role;
ALTER TABLE public.objetivo_asignaciones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.objetivo_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objetivo_id uuid NOT NULL REFERENCES public.objetivos_v2(id) ON DELETE CASCADE,
  asignacion_id uuid REFERENCES public.objetivo_asignaciones(id) ON DELETE CASCADE,
  cod_cliente integer NOT NULL REFERENCES public.clientes(cod_cliente),
  origen text NOT NULL DEFAULT 'lista' CHECK (origen IN ('lista','foto_cartera')),
  titular_vendedor text,
  meta_tipo text CHECK (meta_tipo IN ('pct','importe')),
  meta_valor numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (objetivo_id, asignacion_id, cod_cliente, origen)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objetivo_clientes TO authenticated;
GRANT ALL ON public.objetivo_clientes TO service_role;
ALTER TABLE public.objetivo_clientes ENABLE ROW LEVEL SECURITY;

CREATE INDEX objetivo_asignaciones_obj_idx ON public.objetivo_asignaciones(objetivo_id);
CREATE INDEX objetivo_clientes_asig_idx ON public.objetivo_clientes(asignacion_id);
CREATE INDEX objetivo_clientes_obj_idx ON public.objetivo_clientes(objetivo_id, cod_cliente);

CREATE OR REPLACE FUNCTION public.puede_gestionar_objetivos(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
      OR (public.is_approved(_user_id) AND public.has_role(_user_id, 'director_comercial'))
$$;
REVOKE ALL ON FUNCTION public.puede_gestionar_objetivos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_objetivos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_ver_asignacion_objetivo(_user_id uuid, _vendedor text, _asig_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(_user_id) AND (
    public.puede_gestionar_objetivos(_user_id)
    OR _asig_user = _user_id
    OR (COALESCE(public.get_user_employee_code(_user_id), '') <> '' AND _vendedor = public.get_user_employee_code(_user_id))
    OR (public.has_role(_user_id, 'jefe_de_zona')
        AND COALESCE(public.get_user_delegacion(_user_id), '') <> ''
        AND EXISTS (SELECT 1 FROM public.clientes c
                    WHERE c.vendedor = _vendedor AND c.delegacion = public.get_user_delegacion(_user_id)))
  )
$$;
REVOKE ALL ON FUNCTION public.puede_ver_asignacion_objetivo(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_asignacion_objetivo(uuid, text, uuid) TO authenticated, service_role;

CREATE POLICY "Aprobados ven tipos" ON public.tipos_objetivo FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Admin gestiona tipos" ON public.tipos_objetivo FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Gestores ven objetivos" ON public.objetivos_v2 FOR SELECT TO authenticated USING (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores crean objetivos" ON public.objetivos_v2 FOR INSERT TO authenticated WITH CHECK (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores editan objetivos" ON public.objetivos_v2 FOR UPDATE TO authenticated USING (public.puede_gestionar_objetivos(auth.uid())) WITH CHECK (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores borran objetivos" ON public.objetivos_v2 FOR DELETE TO authenticated USING (public.puede_gestionar_objetivos(auth.uid()));

CREATE POLICY "Gestores ven asignaciones" ON public.objetivo_asignaciones FOR SELECT TO authenticated USING (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores crean asignaciones" ON public.objetivo_asignaciones FOR INSERT TO authenticated WITH CHECK (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores editan asignaciones" ON public.objetivo_asignaciones FOR UPDATE TO authenticated USING (public.puede_gestionar_objetivos(auth.uid())) WITH CHECK (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores borran asignaciones" ON public.objetivo_asignaciones FOR DELETE TO authenticated USING (public.puede_gestionar_objetivos(auth.uid()));

CREATE POLICY "Gestores ven clientes objetivo" ON public.objetivo_clientes FOR SELECT TO authenticated USING (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores crean clientes objetivo" ON public.objetivo_clientes FOR INSERT TO authenticated WITH CHECK (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores editan clientes objetivo" ON public.objetivo_clientes FOR UPDATE TO authenticated USING (public.puede_gestionar_objetivos(auth.uid())) WITH CHECK (public.puede_gestionar_objetivos(auth.uid()));
CREATE POLICY "Gestores borran clientes objetivo" ON public.objetivo_clientes FOR DELETE TO authenticated USING (public.puede_gestionar_objetivos(auth.uid()));

CREATE TRIGGER auditar_objetivos_v2 AFTER INSERT OR UPDATE OR DELETE ON public.objetivos_v2 FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
CREATE TRIGGER auditar_objetivo_asignaciones AFTER INSERT OR UPDATE OR DELETE ON public.objetivo_asignaciones FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
CREATE TRIGGER auditar_objetivo_clientes AFTER INSERT OR UPDATE OR DELETE ON public.objetivo_clientes FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
CREATE TRIGGER auditar_tipos_objetivo AFTER INSERT OR UPDATE OR DELETE ON public.tipos_objetivo FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
CREATE TRIGGER objetivos_v2_updated_at BEFORE UPDATE ON public.objetivos_v2 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER objetivo_asignaciones_updated_at BEFORE UPDATE ON public.objetivo_asignaciones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tipos_objetivo_updated_at BEFORE UPDATE ON public.tipos_objetivo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.objetivo_fin_comparable(_desde date, _hasta date, _comparacion text)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_corte date := public.fecha_corte_datos(); v_fin date; v_q int; v_y int;
BEGIN
  v_fin := LEAST(_hasta, v_corte);
  IF v_fin < _desde THEN RETURN (_desde - interval '1 year')::date - 1; END IF;
  IF _comparacion = 'quincena_completa' AND v_fin = v_corte THEN
    v_y := EXTRACT(YEAR FROM v_corte)::int;
    v_q := public.quincena_corte(v_y);
    IF v_q = 0 THEN
      v_fin := make_date(v_y, 1, 1) - 1;
    ELSIF v_q % 2 = 1 THEN
      v_fin := make_date(v_y, (v_q + 1) / 2, 15);
    ELSE
      v_fin := (make_date(v_y, v_q / 2, 1) + interval '1 month - 1 day')::date;
    END IF;
  END IF;
  RETURN (v_fin - interval '1 year')::date;
END $$;
REVOKE ALL ON FUNCTION public.objetivo_fin_comparable(date, date, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.objetivo_filas(_asig uuid[])
RETURNS TABLE(asignacion_id uuid, cod_cliente integer, origen text, titular text,
              cli_meta_tipo text, cli_meta_valor numeric,
              vendido numeric, base_comparable numeric, base_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT oa.id AS asig, oa.vendedor, o.*,
           public.objetivo_fin_comparable(o.desde, o.hasta, o.comparacion) AS fin_comp,
           LEAST(o.hasta, public.fecha_corte_datos()) AS fin_real
    FROM public.objetivo_asignaciones oa JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id
    WHERE oa.id = ANY(_asig)
  ),
  excl AS (
    SELECT a.asig, oc.cod_cliente
    FROM a
    JOIN public.objetivos_v2 o2 ON o2.excluir_de_cartera AND o2.estado = 'activo' AND o2.id <> a.id
         AND o2.desde <= a.hasta AND o2.hasta >= a.desde
    JOIN public.objetivo_clientes oc ON oc.objetivo_id = o2.id AND oc.origen = 'lista'
    LEFT JOIN public.objetivo_asignaciones oa2 ON oa2.id = oc.asignacion_id
    WHERE a.tipo = 'cartera' AND COALESCE(oa2.vendedor, oc.titular_vendedor) = a.vendedor
  ),
  cli AS (
    SELECT a.asig, c.cod_cliente, 'ficha'::text AS origen, c.vendedor AS titular, NULL::text AS mt, NULL::numeric AS mv
    FROM a JOIN public.clientes c ON c.vendedor = a.vendedor
    WHERE a.tipo = 'cartera' AND a.atribucion = 'ficha_actual'
    UNION ALL
    SELECT a.asig, oc.cod_cliente, 'foto_cartera', oc.titular_vendedor, NULL, NULL
    FROM a JOIN public.objetivo_clientes oc ON oc.asignacion_id = a.asig AND oc.origen = 'foto_cartera'
    WHERE a.tipo = 'cartera' AND a.atribucion = 'foto_cartera'
    UNION ALL
    SELECT a.asig, oc.cod_cliente, 'lista', c.vendedor, oc.meta_tipo, oc.meta_valor
    FROM a JOIN public.objetivo_clientes oc
         ON oc.objetivo_id = a.id AND oc.origen = 'lista' AND (oc.asignacion_id = a.asig OR oc.asignacion_id IS NULL)
    JOIN public.clientes c ON c.cod_cliente = oc.cod_cliente
    WHERE a.tipo IN ('clientes','cliente')
      AND (a.contar_ajenos
           OR (a.atribucion = 'ficha_actual' AND c.vendedor = a.vendedor)
           OR (a.atribucion = 'foto_cartera' AND COALESCE(oc.titular_vendedor, c.vendedor) = a.vendedor))
  ),
  cli_ok AS (
    SELECT DISTINCT ON (cli.asig, cli.cod_cliente) cli.* FROM cli
    WHERE NOT EXISTS (SELECT 1 FROM excl e WHERE e.asig = cli.asig AND e.cod_cliente = cli.cod_cliente)
    ORDER BY cli.asig, cli.cod_cliente
  )
  SELECT k.asig, k.cod_cliente, k.origen, k.titular, k.mt, k.mv,
         COALESCE(SUM(CASE WHEN v.fecha BETWEEN a.desde AND a.fin_real THEN m.val END), 0),
         COALESCE(SUM(CASE WHEN v.fecha BETWEEN (a.desde - interval '1 year')::date AND a.fin_comp THEN m.val END), 0),
         COALESCE(SUM(CASE WHEN v.fecha BETWEEN (a.desde - interval '1 year')::date AND (a.hasta - interval '1 year')::date THEN m.val END), 0)
  FROM cli_ok k
  JOIN a ON a.asig = k.asig
  LEFT JOIN public.ventas_diarias v
    ON v.cod_cliente = k.cod_cliente
   AND v.fecha >= (a.desde - interval '1 year')::date
   AND v.fecha <= GREATEST(a.fin_real, (a.hasta - interval '1 year')::date)
  LEFT JOIN LATERAL (SELECT CASE a.medida WHEN 'margen' THEN v.margen WHEN 'unidades' THEN v.unidades ELSE v.importe END AS val) m ON true
  GROUP BY 1,2,3,4,5,6
$$;
REVOKE ALL ON FUNCTION public.objetivo_filas(uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.objetivo_meta(_tipo text, _valor numeric, _base numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _valor IS NULL THEN NULL
              WHEN _tipo = 'importe' THEN _valor
              ELSE ROUND(_base * (1 + _valor / 100.0), 2) END
$$;

CREATE OR REPLACE FUNCTION public.objetivo_tramo(_tramos jsonb, _pct numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT t FROM jsonb_array_elements(COALESCE(_tramos, '[]'::jsonb)) t
  WHERE _pct IS NOT NULL AND (t->>'pct')::numeric <= _pct
  ORDER BY (t->>'pct')::numeric DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.objetivos_v2_avance(_desde date DEFAULT NULL, _hasta date DEFAULT NULL)
RETURNS TABLE(objetivo_id uuid, nombre text, tipo text, desde date, hasta date, medida text, estado text,
              atribucion text, comparacion text, modo_lista text, mostrar_importe boolean, tramos jsonb,
              asignacion_id uuid, vendedor text, user_id uuid, sin_usuario boolean,
              num_clientes integer, meta numeric, vendido numeric, base_comparable numeric, base_total numeric,
              avance_pct numeric, falta numeric, proyeccion numeric, proyeccion_pct numeric,
              tramo jsonb, tramo_proyectado jsonb, fecha_corte date, fin_comparable date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_gestor boolean; v_corte date; v_margen boolean; v_ids uuid[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_approved(v_uid) THEN RETURN; END IF;
  v_gestor := public.puede_gestionar_objetivos(v_uid);
  v_margen := public.puede_ver_margen(v_uid);
  v_corte := public.fecha_corte_datos();

  SELECT array_agg(oa.id) INTO v_ids
  FROM public.objetivo_asignaciones oa JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id
  WHERE (_desde IS NULL OR o.hasta >= _desde) AND (_hasta IS NULL OR o.desde <= _hasta)
    AND o.estado <> 'archivado'
    AND (v_gestor OR o.estado IN ('activo','cerrado'))
    AND (o.medida <> 'margen' OR v_margen)
    AND public.puede_ver_asignacion_objetivo(v_uid, oa.vendedor, oa.user_id);
  IF v_ids IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH f AS (SELECT * FROM public.objetivo_filas(v_ids)),
  agg AS (
    SELECT f.asignacion_id AS aid, COUNT(*)::int AS n,
           SUM(f.vendido) AS r, SUM(f.base_comparable) AS bc, SUM(f.base_total) AS bt
    FROM f GROUP BY 1
  ),
  meta_cli AS (
    SELECT f.asignacion_id AS aid,
           SUM(public.objetivo_meta(COALESCE(f.cli_meta_tipo, oa.meta_tipo, o.meta_tipo),
                                    COALESCE(f.cli_meta_valor, oa.meta_valor, o.meta_valor), f.base_total)) AS m
    FROM f JOIN public.objetivo_asignaciones oa ON oa.id = f.asignacion_id
    JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id
    GROUP BY 1
  ),
  base AS (
    SELECT o.*, oa.id AS aid, oa.vendedor AS vend, oa.user_id AS uid,
           COALESCE(g.n, 0) AS n, COALESCE(g.r, 0) AS r, COALESCE(g.bc, 0) AS bc, COALESCE(g.bt, 0) AS bt,
           CASE WHEN o.tipo IN ('clientes','cliente') AND o.modo_lista = 'por_cliente' THEN mc.m
                ELSE public.objetivo_meta(COALESCE(oa.meta_tipo, o.meta_tipo), COALESCE(oa.meta_valor, o.meta_valor), COALESCE(g.bt, 0))
           END AS meta_calc,
           LEAST(o.hasta, v_corte) AS fin_real,
           public.objetivo_fin_comparable(o.desde, o.hasta, o.comparacion) AS fin_comp
    FROM public.objetivo_asignaciones oa JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id
    LEFT JOIN agg g ON g.aid = oa.id
    LEFT JOIN meta_cli mc ON mc.aid = oa.id
    WHERE oa.id = ANY(v_ids)
  ),
  proy AS (
    SELECT b.*,
      CASE WHEN v_corte >= b.hasta THEN b.r
           WHEN v_corte < b.desde THEN 0
           WHEN b.bc > 0 AND b.bt > 0 THEN ROUND(b.r * b.bt / b.bc, 2)
           ELSE ROUND(b.r * ((b.hasta - b.desde + 1)::numeric / GREATEST(b.fin_real - b.desde + 1, 1)), 2)
      END AS p
    FROM base b
  )
  SELECT p.id, p.nombre, p.tipo, p.desde, p.hasta, p.medida, p.estado,
         p.atribucion, p.comparacion, p.modo_lista, p.mostrar_importe, p.tramos,
         p.aid, p.vend, p.uid, (p.uid IS NULL),
         p.n, p.meta_calc, ROUND(p.r, 2), ROUND(p.bc, 2), ROUND(p.bt, 2),
         CASE WHEN p.meta_calc > 0 THEN ROUND(p.r / p.meta_calc * 100, 1) END,
         CASE WHEN p.meta_calc IS NOT NULL THEN GREATEST(p.meta_calc - p.r, 0) END,
         p.p,
         CASE WHEN p.meta_calc > 0 THEN ROUND(p.p / p.meta_calc * 100, 1) END,
         public.objetivo_tramo(p.tramos, CASE WHEN p.meta_calc > 0 THEN p.r / p.meta_calc * 100 END),
         public.objetivo_tramo(p.tramos, CASE WHEN p.meta_calc > 0 THEN p.p / p.meta_calc * 100 END),
         v_corte, p.fin_comp
  FROM proy p
  ORDER BY p.desde DESC, p.nombre, p.vend;
END $$;
REVOKE ALL ON FUNCTION public.objetivos_v2_avance(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_v2_avance(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.objetivos_v2_detalle(_asignacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record; v_clientes jsonb; v_serie jsonb;
BEGIN
  SELECT oa.*, o.desde, o.hasta, o.medida, o.estado, o.tipo, o.meta_tipo AS o_mt, o.meta_valor AS o_mv
    INTO r FROM public.objetivo_asignaciones oa JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id
   WHERE oa.id = _asignacion_id;
  IF NOT FOUND OR v_uid IS NULL
     OR NOT public.puede_ver_asignacion_objetivo(v_uid, r.vendedor, r.user_id)
     OR (NOT public.puede_gestionar_objetivos(v_uid) AND r.estado NOT IN ('activo','cerrado'))
     OR (r.medida = 'margen' AND NOT public.puede_ver_margen(v_uid)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cod_cliente', f.cod_cliente, 'cliente', c.cliente, 'titular', f.titular,
           'ajeno', (f.titular IS DISTINCT FROM r.vendedor),
           'real', ROUND(f.vendido, 2), 'base_comparable', ROUND(f.base_comparable, 2), 'base_total', ROUND(f.base_total, 2),
           'meta', public.objetivo_meta(COALESCE(f.cli_meta_tipo, r.meta_tipo, r.o_mt), COALESCE(f.cli_meta_valor, r.meta_valor, r.o_mv), f.base_total)
         ) ORDER BY f.vendido DESC), '[]'::jsonb)
    INTO v_clientes
    FROM public.objetivo_filas(ARRAY[_asignacion_id]) f JOIN public.clientes c ON c.cod_cliente = f.cod_cliente;

  WITH cl AS (SELECT f.cod_cliente FROM public.objetivo_filas(ARRAY[_asignacion_id]) f),
  m AS (
    SELECT date_trunc('month', v.fecha)::date AS mes,
           SUM(CASE r.medida WHEN 'margen' THEN v.margen WHEN 'unidades' THEN v.unidades ELSE v.importe END) AS val
    FROM public.ventas_diarias v JOIN cl ON cl.cod_cliente = v.cod_cliente
    WHERE (v.fecha BETWEEN r.desde AND r.hasta)
       OR (v.fecha BETWEEN (r.desde - interval '1 year')::date AND (r.hasta - interval '1 year')::date)
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('mes', mes, 'valor', ROUND(val, 2)) ORDER BY mes), '[]'::jsonb)
    INTO v_serie FROM m;

  RETURN jsonb_build_object('clientes', v_clientes, 'serie', v_serie);
END $$;
REVOKE ALL ON FUNCTION public.objetivos_v2_detalle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_v2_detalle(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.objetivo_tomar_foto(_objetivo_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.objetivo_clientes (objetivo_id, asignacion_id, cod_cliente, origen, titular_vendedor)
  SELECT oa.objetivo_id, oa.id, c.cod_cliente, 'foto_cartera', c.vendedor
  FROM public.objetivo_asignaciones oa
  JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id AND o.tipo = 'cartera' AND o.atribucion = 'foto_cartera'
  JOIN public.clientes c ON c.vendedor = oa.vendedor
  WHERE oa.objetivo_id = _objetivo_id
    AND NOT EXISTS (SELECT 1 FROM public.objetivo_clientes x WHERE x.asignacion_id = oa.id AND x.origen = 'foto_cartera')
  ON CONFLICT DO NOTHING
$$;
REVOKE ALL ON FUNCTION public.objetivo_tomar_foto(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.objetivos_v2_guardar(_d jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_tipo text; v_t record; a jsonb; c jsonb; v_aid uuid;
        v_n int; v_mal record; v_vend text; v_user uuid;
BEGIN
  IF NOT public.puede_gestionar_objetivos(v_uid) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  v_tipo := _d->>'tipo';
  SELECT * INTO v_t FROM public.tipos_objetivo WHERE key = v_tipo;
  IF NOT FOUND OR NOT v_t.disponible THEN RAISE EXCEPTION 'Tipo de objetivo no disponible'; END IF;
  IF COALESCE(btrim(_d->>'nombre'), '') = '' THEN RAISE EXCEPTION 'Falta el nombre'; END IF;
  IF jsonb_array_length(COALESCE(_d->'asignaciones', '[]')) = 0 THEN RAISE EXCEPTION 'Asigna al menos un comercial'; END IF;
  IF v_tipo = 'cliente' AND jsonb_array_length(COALESCE(_d->'clientes', '[]')) <> 1 THEN
    RAISE EXCEPTION 'Un objetivo de cliente concreto lleva exactamente un cliente';
  END IF;
  IF v_tipo = 'clientes' AND jsonb_array_length(COALESCE(_d->'clientes', '[]')) = 0 THEN
    RAISE EXCEPTION 'Añade al menos un cliente a la lista';
  END IF;

  v_id := NULLIF(_d->>'id', '')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.objetivos_v2 (nombre, tipo, desde, hasta, created_by) VALUES
      (_d->>'nombre', v_tipo, (_d->>'desde')::date, (_d->>'hasta')::date, v_uid) RETURNING id INTO v_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.objetivos_v2 WHERE id = v_id) THEN
    RAISE EXCEPTION 'Objetivo no encontrado';
  END IF;

  UPDATE public.objetivos_v2 SET
    nombre = _d->>'nombre', tipo = v_tipo,
    desde = (_d->>'desde')::date, hasta = (_d->>'hasta')::date,
    medida = COALESCE(_d->>'medida', medida),
    atribucion = COALESCE(_d->>'atribucion', atribucion),
    comparacion = COALESCE(_d->>'comparacion', comparacion),
    meta_tipo = COALESCE(_d->>'meta_tipo', meta_tipo),
    meta_valor = CASE WHEN _d ? 'meta_valor' THEN (_d->>'meta_valor')::numeric ELSE meta_valor END,
    modo_lista = COALESCE(_d->>'modo_lista', modo_lista),
    excluir_de_cartera = COALESCE((_d->>'excluir_de_cartera')::boolean, excluir_de_cartera),
    contar_ajenos = COALESCE((_d->>'contar_ajenos')::boolean, contar_ajenos),
    tramos = COALESCE(_d->'tramos', tramos),
    mostrar_importe = COALESCE((_d->>'mostrar_importe')::boolean, mostrar_importe),
    estado = COALESCE(_d->>'estado', estado),
    parametros = COALESCE(_d->'parametros', parametros),
    nota = CASE WHEN _d ? 'nota' THEN _d->>'nota' ELSE nota END
  WHERE id = v_id;

  DELETE FROM public.objetivo_asignaciones oa WHERE oa.objetivo_id = v_id
    AND oa.vendedor NOT IN (SELECT x->>'vendedor' FROM jsonb_array_elements(_d->'asignaciones') x);
  FOR a IN SELECT * FROM jsonb_array_elements(_d->'asignaciones') LOOP
    v_vend := a->>'vendedor';
    IF COALESCE(btrim(v_vend), '') = '' THEN RAISE EXCEPTION 'Asignación sin comercial'; END IF;
    v_user := COALESCE(NULLIF(a->>'user_id', '')::uuid,
                       (SELECT p.user_id FROM public.profiles p WHERE p.employee_code = v_vend ORDER BY p.created_at LIMIT 1));
    INSERT INTO public.objetivo_asignaciones (objetivo_id, vendedor, user_id, meta_tipo, meta_valor, nota)
    VALUES (v_id, v_vend, v_user, a->>'meta_tipo', (a->>'meta_valor')::numeric, a->>'nota')
    ON CONFLICT (objetivo_id, vendedor) DO UPDATE SET user_id = EXCLUDED.user_id,
      meta_tipo = EXCLUDED.meta_tipo, meta_valor = EXCLUDED.meta_valor, nota = EXCLUDED.nota;
  END LOOP;

  DELETE FROM public.objetivo_clientes WHERE objetivo_id = v_id AND origen = 'lista';
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(_d->'clientes', '[]')) LOOP
    v_aid := NULL;
    IF NULLIF(c->>'vendedor', '') IS NOT NULL THEN
      SELECT id INTO v_aid FROM public.objetivo_asignaciones WHERE objetivo_id = v_id AND vendedor = c->>'vendedor';
      IF v_aid IS NULL THEN RAISE EXCEPTION 'El cliente % apunta a un comercial no asignado', c->>'cod_cliente'; END IF;
    END IF;
    INSERT INTO public.objetivo_clientes (objetivo_id, asignacion_id, cod_cliente, origen, titular_vendedor, meta_tipo, meta_valor)
    SELECT v_id, v_aid, cl.cod_cliente, 'lista', cl.vendedor, c->>'meta_tipo', (c->>'meta_valor')::numeric
    FROM public.clientes cl WHERE cl.cod_cliente = (c->>'cod_cliente')::int;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Cliente % no existe', c->>'cod_cliente'; END IF;
  END LOOP;

  PERFORM public.objetivo_tomar_foto(v_id);

  SELECT f.cod_cliente, f.asignacion_id INTO v_mal
  FROM public.objetivos_v2 o
  JOIN public.objetivo_asignaciones oa ON oa.objetivo_id = o.id
  JOIN LATERAL public.objetivo_filas(ARRAY[oa.id]) f ON true
  WHERE o.id = v_id AND o.tipo IN ('clientes','cliente') AND o.modo_lista = 'por_cliente'
    AND COALESCE(f.cli_meta_tipo, oa.meta_tipo, o.meta_tipo) = 'pct' AND f.base_total <= 0
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'El cliente % no compró en el periodo anterior: ponle un importe fijo', v_mal.cod_cliente;
  END IF;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.objetivos_v2_guardar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_v2_guardar(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.objetivos_v2_duplicar(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); o record; v_new uuid; v_desde date; v_hasta date; v_meses int;
BEGIN
  IF NOT public.puede_gestionar_objetivos(v_uid) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO o FROM public.objetivos_v2 WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Objetivo no encontrado'; END IF;
  IF EXTRACT(DAY FROM o.desde) = 1 AND o.hasta = (date_trunc('month', o.hasta) + interval '1 month - 1 day')::date THEN
    v_meses := (EXTRACT(YEAR FROM o.hasta) - EXTRACT(YEAR FROM o.desde))::int * 12
             + (EXTRACT(MONTH FROM o.hasta) - EXTRACT(MONTH FROM o.desde))::int + 1;
    v_desde := (o.desde + make_interval(months => v_meses))::date;
    v_hasta := (v_desde + make_interval(months => v_meses) - interval '1 day')::date;
  ELSE
    v_desde := o.hasta + 1;
    v_hasta := o.hasta + (o.hasta - o.desde + 1);
  END IF;

  INSERT INTO public.objetivos_v2 (nombre, tipo, desde, hasta, medida, atribucion, comparacion, meta_tipo, meta_valor,
    modo_lista, excluir_de_cartera, contar_ajenos, tramos, mostrar_importe, estado, parametros, nota, created_by)
  SELECT o.nombre || ' (copia)', o.tipo, v_desde, v_hasta, o.medida,
         CASE WHEN o.atribucion = 'ficha_actual' AND o.origen_legacy IS NOT NULL THEN 'foto_cartera' ELSE o.atribucion END,
         'fecha_corte', o.meta_tipo, o.meta_valor, o.modo_lista, o.excluir_de_cartera, o.contar_ajenos,
         o.tramos, o.mostrar_importe, 'borrador', o.parametros, o.nota, v_uid
  RETURNING id INTO v_new;

  INSERT INTO public.objetivo_asignaciones (objetivo_id, vendedor, user_id, meta_tipo, meta_valor, nota)
  SELECT v_new, vendedor, user_id, meta_tipo, meta_valor, nota FROM public.objetivo_asignaciones WHERE objetivo_id = _id;

  INSERT INTO public.objetivo_clientes (objetivo_id, asignacion_id, cod_cliente, origen, titular_vendedor, meta_tipo, meta_valor)
  SELECT v_new, na.id, oc.cod_cliente, 'lista', oc.titular_vendedor, oc.meta_tipo, oc.meta_valor
  FROM public.objetivo_clientes oc
  LEFT JOIN public.objetivo_asignaciones oa ON oa.id = oc.asignacion_id
  LEFT JOIN public.objetivo_asignaciones na ON na.objetivo_id = v_new AND na.vendedor = oa.vendedor
  WHERE oc.objetivo_id = _id AND oc.origen = 'lista';

  PERFORM public.objetivo_tomar_foto(v_new);
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.objetivos_v2_duplicar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_v2_duplicar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.objetivos_v2_propuesta(_desde date, _hasta date, _pct numeric DEFAULT 5)
RETURNS TABLE(vendedor text, user_id uuid, num_clientes integer, base_anterior numeric, meta_sugerida numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.puede_gestionar_objetivos(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT c.vendedor,
         (SELECT p.user_id FROM public.profiles p WHERE p.employee_code = c.vendedor ORDER BY p.created_at LIMIT 1),
         COUNT(DISTINCT c.cod_cliente)::int,
         ROUND(COALESCE(SUM(v.importe), 0), 2),
         ROUND(COALESCE(SUM(v.importe), 0) * (1 + COALESCE(_pct, 0) / 100.0), 2)
  FROM public.clientes c
  LEFT JOIN public.ventas_diarias v ON v.cod_cliente = c.cod_cliente
       AND v.fecha BETWEEN (_desde - interval '1 year')::date AND (_hasta - interval '1 year')::date
  WHERE COALESCE(c.vendedor, '') <> ''
  GROUP BY c.vendedor
  ORDER BY c.vendedor;
END $$;
REVOKE ALL ON FUNCTION public.objetivos_v2_propuesta(date, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_v2_propuesta(date, date, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.objetivos_v2_sin_codigo()
RETURNS TABLE(caso text, user_id uuid, nombre text, username text, rol text, vendedor text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.puede_gestionar_objetivos(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT 'usuario_sin_codigo'::text, p.user_id, p.full_name, p.username, string_agg(r.role::text, ','), NULL::text
  FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE r.role IN ('comercial','jefe_de_zona') AND COALESCE(btrim(p.employee_code), '') = '' AND p.estado <> 'baja'
  GROUP BY p.user_id, p.full_name, p.username
  UNION ALL
  SELECT DISTINCT 'objetivo_sin_usuario', NULL::uuid, NULL, NULL, NULL, oa.vendedor
  FROM public.objetivo_asignaciones oa JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id AND o.estado <> 'archivado'
  WHERE oa.user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_code = oa.vendedor);
END $$;
REVOKE ALL ON FUNCTION public.objetivos_v2_sin_codigo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.objetivos_v2_sin_codigo() TO authenticated;

INSERT INTO public.objetivos_v2 (nombre, tipo, desde, hasta, atribucion, comparacion, meta_tipo, meta_valor,
                                 estado, origen_legacy)
SELECT 'Cartera 2026', 'cartera', '2026-01-01', '2026-12-31', 'ficha_actual', 'quincena_completa', 'importe', NULL,
       'activo', jsonb_build_object('tabla', 'objetivos', 'anio', 2026, 'tipo', 'cartera')
WHERE EXISTS (SELECT 1 FROM public.objetivos WHERE anio = 2026 AND tipo = 'cartera');

INSERT INTO public.objetivo_asignaciones (objetivo_id, vendedor, user_id, meta_tipo, meta_valor, nota)
SELECT n.id, o.vendedor,
       (SELECT p.user_id FROM public.profiles p WHERE p.employee_code = o.vendedor ORDER BY p.created_at LIMIT 1),
       'importe', o.importe_objetivo, o.nota
FROM public.objetivos o
JOIN public.objetivos_v2 n ON n.origen_legacy->>'tipo' = 'cartera' AND (n.origen_legacy->>'anio')::int = 2026
WHERE o.anio = 2026 AND o.tipo = 'cartera';

INSERT INTO public.objetivos_v2 (nombre, tipo, desde, hasta, atribucion, comparacion, meta_tipo, meta_valor,
                                 modo_lista, excluir_de_cartera, estado, origen_legacy)
SELECT 'Sprint Primavera 2026', 'clientes', '2026-01-01', '2026-12-31', 'ficha_actual', 'quincena_completa', 'importe', NULL,
       'conjunto', true, 'activo', jsonb_build_object('tabla', 'objetivos', 'anio', 2026, 'tipo', 'ruta')
WHERE EXISTS (SELECT 1 FROM public.objetivos WHERE anio = 2026 AND tipo = 'ruta');

INSERT INTO public.objetivo_asignaciones (objetivo_id, vendedor, user_id, meta_tipo, meta_valor, nota)
SELECT n.id, o.vendedor,
       (SELECT p.user_id FROM public.profiles p WHERE p.employee_code = o.vendedor ORDER BY p.created_at LIMIT 1),
       'importe', o.importe_objetivo,
       concat_ws(' · ', 'Ruta especial ' || o.ruta, o.nota)
FROM public.objetivos o
JOIN public.objetivos_v2 n ON n.origen_legacy->>'tipo' = 'ruta' AND (n.origen_legacy->>'anio')::int = 2026
WHERE o.anio = 2026 AND o.tipo = 'ruta';

INSERT INTO public.objetivo_clientes (objetivo_id, asignacion_id, cod_cliente, origen, titular_vendedor)
SELECT oa.objetivo_id, oa.id, c.cod_cliente, 'lista', c.vendedor
FROM public.objetivos o
JOIN public.objetivos_v2 n ON n.origen_legacy->>'tipo' = 'ruta' AND (n.origen_legacy->>'anio')::int = 2026
JOIN public.objetivo_asignaciones oa ON oa.objetivo_id = n.id AND oa.vendedor = o.vendedor
JOIN public.clientes c ON c.ruta_especial = o.ruta AND c.vendedor = o.vendedor
WHERE o.anio = 2026 AND o.tipo = 'ruta' AND o.activo;

COMMENT ON TABLE public.objetivos IS 'Sustituida por objetivos_v2; se retira cuando la nueva pantalla esté validada';
