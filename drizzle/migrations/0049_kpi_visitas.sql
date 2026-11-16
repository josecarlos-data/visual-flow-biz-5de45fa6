CREATE TABLE public.kpi_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  objetivo_mes integer NOT NULL CHECK (objetivo_mes >= 0),
  umbral_bonus integer CHECK (umbral_bonus >= 0),
  importe_bonus numeric,
  regla_conteo text NOT NULL DEFAULT 'cliente_dia' CHECK (regla_conteo IN ('cliente_dia','cliente_mes','bloque')),
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kpi_linea_motivos (
  linea_id uuid NOT NULL REFERENCES public.kpi_lineas(id) ON DELETE CASCADE,
  motivo_key text NOT NULL REFERENCES public.motivos_visita(key),
  PRIMARY KEY (linea_id, motivo_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_lineas, public.kpi_linea_motivos TO authenticated;
GRANT ALL ON public.kpi_lineas, public.kpi_linea_motivos TO service_role;
ALTER TABLE public.kpi_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_linea_motivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_lineas leer" ON public.kpi_lineas FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "kpi_lineas crear" ON public.kpi_lineas FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(),'director_comercial'::app_role)));
CREATE POLICY "kpi_lineas editar" ON public.kpi_lineas FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(),'director_comercial'::app_role))) WITH CHECK (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(),'director_comercial'::app_role)));
CREATE POLICY "kpi_lineas borrar" ON public.kpi_lineas FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "kpi_motivos leer" ON public.kpi_linea_motivos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "kpi_motivos crear" ON public.kpi_linea_motivos FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(),'director_comercial'::app_role)));
CREATE POLICY "kpi_motivos borrar" ON public.kpi_linea_motivos FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(),'director_comercial'::app_role)));

CREATE OR REPLACE FUNCTION public.kpi_lineas_defaults() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.umbral_bonus IS NULL THEN NEW.umbral_bonus := NEW.objetivo_mes * 2; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_kpi_lineas_defaults BEFORE INSERT OR UPDATE ON public.kpi_lineas FOR EACH ROW EXECUTE FUNCTION public.kpi_lineas_defaults();
CREATE TRIGGER trg_kpi_lineas_auditar AFTER INSERT OR UPDATE OR DELETE ON public.kpi_lineas FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();
CREATE TRIGGER trg_kpi_linea_motivos_auditar AFTER INSERT OR UPDATE OR DELETE ON public.kpi_linea_motivos FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();

INSERT INTO public.app_settings(key, value, description) VALUES
  ('kpi_contar_desde', '2026-10', 'KPI de visitas: mes inicial (AAAA-MM) desde el que cuentan los bloques'),
  ('kpi_origenes', 'app,gespromo', 'KPI de visitas: orígenes de visita que cuentan, separados por coma')
ON CONFLICT (key) DO NOTHING;

-- Comercial de cada visita: app por autor; Gespromo por código «NN - » -> clientes.cod_vendedor -> perfil.employee_code
CREATE OR REPLACE FUNCTION public.kpi_base(_desde date, _hasta date)
RETURNS TABLE(vendedor text, user_id uuid, delegacion text, mes int, linea_id uuid, regla text, motivo_key text, cliente text, fecha date, bloque_id uuid, visita_id uuid, correcto boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT greatest(_desde, coalesce((SELECT to_date(value,'YYYY-MM') FROM app_settings WHERE key='kpi_contar_desde'), _desde)) AS desde,
           coalesce((SELECT string_to_array(replace(value,' ',''),',') FROM app_settings WHERE key='kpi_origenes'), ARRAY['app','gespromo']) AS origenes
  ), lm AS (
    SELECT l.id, l.regla_conteo, m.motivo_key FROM kpi_lineas l JOIN kpi_linea_motivos m ON m.linea_id=l.id WHERE l.activo
  ), b AS (
    SELECT v.id AS visita_id, v.origen, v.user_id, v.vendedor, v.comercial_nombre, v.fecha, v.cod_cliente, v.cliente_externo,
           bl.id AS bloque_id, bl.motivo_key, upper(coalesce(bl.validacion,'pendiente')) AS val, lm.id AS linea_id, lm.regla_conteo
    FROM visita_bloques bl JOIN lm ON lm.motivo_key = bl.motivo_key
    JOIN visitas v ON v.id = bl.visita_id, cfg
    WHERE v.fecha >= cfg.desde AND v.fecha <= _hasta AND v.origen = ANY(cfg.origenes)
      AND upper(coalesce(bl.validacion,'pendiente')) IN ('CORRECTO','PENDIENTE')
  ), nombres AS (
    SELECT DISTINCT b.origen, b.user_id, b.vendedor, b.comercial_nombre FROM b
  ), res AS (
    SELECT n.*, CASE WHEN n.origen <> 'gespromo' AND n.user_id IS NOT NULL
        THEN coalesce((SELECT nullif(p.employee_code,'') FROM profiles p WHERE p.user_id=n.user_id), n.comercial_nombre, n.vendedor)
        ELSE coalesce((SELECT c.vendedor FROM clientes c WHERE c.cod_vendedor = substring(n.vendedor from '^\s*(\d+)\s*-')
                       GROUP BY c.vendedor ORDER BY count(*) DESC LIMIT 1), n.vendedor) END AS canon
    FROM nombres n
  ), res2 AS (
    SELECT r.*, CASE WHEN r.origen <> 'gespromo' AND r.user_id IS NOT NULL THEN r.user_id
        ELSE (SELECT p.user_id FROM profiles p WHERE p.estado <> 'baja' AND normalizar_texto(p.employee_code)=normalizar_texto(r.canon) ORDER BY p.created_at LIMIT 1) END AS uid
    FROM res r
  )
  SELECT r.canon, r.uid, delegacion_vendedor(r.canon), extract(month FROM b.fecha)::int, b.linea_id, b.regla_conteo, b.motivo_key,
         coalesce(b.cod_cliente::text, 'ext:'||normalizar_texto(coalesce(b.cliente_externo,''))), b.fecha, b.bloque_id, b.visita_id, b.val='CORRECTO'
  FROM b JOIN res2 r ON r.origen=b.origen AND r.user_id IS NOT DISTINCT FROM b.user_id AND r.vendedor IS NOT DISTINCT FROM b.vendedor AND r.comercial_nombre IS NOT DISTINCT FROM b.comercial_nombre
$$;
REVOKE ALL ON FUNCTION public.kpi_base(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_base(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.kpi_ambito(_uid uuid)
RETURNS TABLE(todo boolean, jefe boolean, delegacion text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_uid) OR public.has_role(_uid,'director_comercial'::app_role),
         public.has_role(_uid,'jefe_de_zona'::app_role),
         public.get_user_delegacion(_uid)
  WHERE public.is_approved(_uid) AND public.has_dashboard_access(_uid,'kpi_visitas')
$$;
REVOKE ALL ON FUNCTION public.kpi_ambito(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_ambito(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.kpi_resumen(_anio int)
RETURNS TABLE(vendedor text, user_id uuid, sin_usuario boolean, mes int, linea_id uuid, linea text, orden int,
              conseguidos int, pendientes int, objetivo int, umbral int, importe_bonus numeric, bonus boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); a record;
BEGIN
  SELECT * INTO a FROM public.kpi_ambito(u);
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  WITH f AS (
    SELECT * FROM public.kpi_base(make_date(_anio,1,1), make_date(_anio,12,31)) x
    WHERE a.todo OR x.user_id = u OR (a.jefe AND a.delegacion IS NOT NULL AND x.delegacion = a.delegacion)
  ), k AS (
    SELECT f.vendedor, f.user_id, f.mes, f.linea_id, f.correcto,
      CASE f.regla WHEN 'bloque' THEN f.bloque_id::text
                   WHEN 'cliente_mes' THEN f.motivo_key||'|'||f.cliente
                   ELSE f.motivo_key||'|'||f.cliente||'|'||f.fecha END AS clave
    FROM f
  ), g AS (
    SELECT k.vendedor, max(k.user_id::text)::uuid AS uid, k.mes, k.linea_id,
           count(DISTINCT k.clave) FILTER (WHERE k.correcto)::int AS ok,
           count(DISTINCT k.clave) FILTER (WHERE NOT k.correcto)::int AS pend
    FROM k GROUP BY k.vendedor, k.mes, k.linea_id
  )
  SELECT g.vendedor, g.uid, g.uid IS NULL, g.mes, l.id, l.nombre, l.orden, g.ok, g.pend,
         l.objetivo_mes, l.umbral_bonus, l.importe_bonus, g.ok >= l.umbral_bonus
  FROM g JOIN kpi_lineas l ON l.id = g.linea_id
  ORDER BY g.vendedor, g.mes, l.orden;
END $$;
REVOKE ALL ON FUNCTION public.kpi_resumen(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_resumen(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kpi_detalle(_linea_id uuid, _anio int, _mes int, _vendedor text)
RETURNS TABLE(visita_id uuid, fecha date, cod_cliente text, motivo_key text, correcto boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); a record;
BEGIN
  SELECT * INTO a FROM public.kpi_ambito(u);
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT DISTINCT x.visita_id, x.fecha, x.cliente, x.motivo_key, x.correcto
  FROM public.kpi_base(make_date(_anio,_mes,1), (make_date(_anio,_mes,1) + interval '1 month - 1 day')::date) x
  WHERE x.linea_id = _linea_id AND x.vendedor = _vendedor
    AND (a.todo OR x.user_id = u OR (a.jefe AND a.delegacion IS NOT NULL AND x.delegacion = a.delegacion))
  ORDER BY x.fecha DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.kpi_detalle(uuid, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_detalle(uuid, int, int, text) TO authenticated, service_role;

INSERT INTO public.dashboards(key, name, description, icon, route, sort_order, is_active)
VALUES ('kpi_visitas', 'KPI visitas', 'Objetivos mensuales por motivo de visita', 'Gauge', '/kpi', 45, true)
ON CONFLICT (key) DO NOTHING;

WITH n AS (
  INSERT INTO public.kpi_lineas(nombre, objetivo_mes, umbral_bonus, orden) VALUES
    ('Estudio de competencia', 12, 24, 10),
    ('Promoción / Oferta', 30, 60, 20),
    ('Revisión de seguimiento', 30, 60, 30),
    ('GSMart + Viaje incentivo + Información / Potencial', 15, 30, 40)
  RETURNING id, orden)
INSERT INTO public.kpi_linea_motivos(linea_id, motivo_key)
SELECT n.id, m.k FROM n JOIN (VALUES (10,'competencia'),(20,'promocion'),(30,'revision_seguimiento'),(40,'gsmart'),(40,'viaje_incentivo'),(40,'informacion_potencial')) m(o,k) ON m.o = n.orden;