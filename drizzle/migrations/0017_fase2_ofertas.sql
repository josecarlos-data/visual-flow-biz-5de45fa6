CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.puede_gestionar_ofertas(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_approved(_user_id) AND (
    public.is_admin(_user_id)
    OR public.has_role(_user_id, 'director_comercial')
    OR public.has_role(_user_id, 'marketing'));
$$;
REVOKE ALL ON FUNCTION public.puede_gestionar_ofertas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_ofertas(uuid) TO authenticated, service_role;

CREATE TABLE public.ofertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  mensaje text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicada','archivada')),
  vigente_desde date,
  vigente_hasta date,
  marcas text[] NOT NULL DEFAULT '{}',
  referencias text[] NOT NULL DEFAULT '{}',
  familias text[] NOT NULL DEFAULT '{}',
  delegaciones text[] NOT NULL DEFAULT '{}',
  tipos_cliente text[] NOT NULL DEFAULT '{}',
  requisitos jsonb NOT NULL DEFAULT '[]'::jsonb,
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  created_by uuid DEFAULT auth.uid(),
  publicada_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ofertas TO authenticated;
GRANT ALL ON public.ofertas TO service_role;
ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores ven ofertas" ON public.ofertas FOR SELECT TO authenticated
  USING ((SELECT public.puede_gestionar_ofertas(auth.uid())));
CREATE POLICY "Gestores crean ofertas" ON public.ofertas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.puede_gestionar_ofertas(auth.uid())));
CREATE POLICY "Gestores editan ofertas" ON public.ofertas FOR UPDATE TO authenticated
  USING ((SELECT public.puede_gestionar_ofertas(auth.uid())))
  WITH CHECK ((SELECT public.puede_gestionar_ofertas(auth.uid())));
CREATE POLICY "Gestores borran borradores" ON public.ofertas FOR DELETE TO authenticated
  USING ((SELECT public.puede_gestionar_ofertas(auth.uid())) AND estado = 'borrador');

CREATE TRIGGER ofertas_updated_at BEFORE UPDATE ON public.ofertas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ofertas_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.estado = 'publicada' AND (TG_OP = 'INSERT' OR OLD.estado <> 'publicada') THEN
    NEW.publicada_en := now();
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.token := OLD.token;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ofertas_guard BEFORE INSERT OR UPDATE ON public.ofertas
  FOR EACH ROW EXECUTE FUNCTION public.ofertas_guard();
CREATE TRIGGER auditar_ofertas AFTER INSERT OR UPDATE OR DELETE ON public.ofertas
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();

CREATE TABLE public.cliente_preferencias_ofertas (
  cod_cliente integer PRIMARY KEY REFERENCES public.clientes(cod_cliente) ON DELETE CASCADE,
  no_quiere_ofertas boolean NOT NULL DEFAULT false,
  marcas_excluidas text[] NOT NULL DEFAULT '{}',
  telefono_whatsapp text,
  motivo_desmarcado text,
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cliente_preferencias_ofertas TO authenticated;
GRANT ALL ON public.cliente_preferencias_ofertas TO service_role;
ALTER TABLE public.cliente_preferencias_ofertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver preferencias de clientes visibles" ON public.cliente_preferencias_ofertas FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.can_view_cliente(auth.uid(), cod_cliente));
CREATE POLICY "Crear preferencias de clientes visibles" ON public.cliente_preferencias_ofertas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND public.can_view_cliente(auth.uid(), cod_cliente));
CREATE POLICY "Editar preferencias de clientes visibles" ON public.cliente_preferencias_ofertas FOR UPDATE TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND public.can_view_cliente(auth.uid(), cod_cliente))
  WITH CHECK ((SELECT public.is_approved(auth.uid())) AND public.can_view_cliente(auth.uid(), cod_cliente));

CREATE OR REPLACE FUNCTION public.preferencias_ofertas_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gerencia boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  v_gerencia := public.is_admin(v_uid) OR public.has_role(v_uid, 'director_comercial');
  IF public.has_role(v_uid, 'marketing') AND NOT v_gerencia THEN
    RAISE EXCEPTION 'Marketing no puede cambiar las preferencias del cliente' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.no_quiere_ofertas AND NOT NEW.no_quiere_ofertas THEN
    IF NOT v_gerencia THEN
      RAISE EXCEPTION 'Solo administración o dirección puede volver a permitir ofertas' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(COALESCE(NEW.motivo_desmarcado, '')), '') IS NULL
       OR NEW.motivo_desmarcado IS NOT DISTINCT FROM OLD.motivo_desmarcado THEN
      RAISE EXCEPTION 'Indica el motivo para volver a permitir ofertas' USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.updated_by := v_uid;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preferencias_ofertas_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preferencias_ofertas_guard BEFORE INSERT OR UPDATE ON public.cliente_preferencias_ofertas
  FOR EACH ROW EXECUTE FUNCTION public.preferencias_ofertas_guard();
CREATE TRIGGER preferencias_ofertas_updated_at BEFORE UPDATE ON public.cliente_preferencias_ofertas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER auditar_preferencias_ofertas AFTER INSERT OR UPDATE OR DELETE ON public.cliente_preferencias_ofertas
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();

-- Selectores
CREATE OR REPLACE FUNCTION public.ofertas_opciones(_tipo text, _q text DEFAULT '')
RETURNS TABLE(codigo text, nombre text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM (
    SELECT DISTINCT p.marca AS codigo, COALESCE(NULLIF(p.marca_nombre,''), p.marca) AS nombre
      FROM public.productos p WHERE _tipo = 'marca' AND NULLIF(p.marca,'') IS NOT NULL
    UNION ALL
    SELECT DISTINCT p.familia, COALESCE(NULLIF(p.familia_nombre,''), p.familia)
      FROM public.productos p WHERE _tipo = 'familia' AND NULLIF(p.familia,'') IS NOT NULL
    UNION ALL
    SELECT DISTINCT c.cod_tipo_cliente, COALESCE(NULLIF(c.tipo_cliente,''), NULLIF(c.extra->>'Tipo de cliente',''), c.cod_tipo_cliente)
      FROM public.clientes c WHERE _tipo = 'tipo_cliente' AND NULLIF(c.cod_tipo_cliente,'') IS NOT NULL
  ) o
  WHERE (SELECT public.puede_gestionar_ofertas(auth.uid()))
    AND (COALESCE(_q,'') = '' OR o.codigo ILIKE '%'||_q||'%' OR o.nombre ILIKE '%'||_q||'%')
  ORDER BY o.nombre
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.ofertas_opciones(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_opciones(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ofertas_buscar_referencias(_q text)
RETURNS TABLE(referencia text, descripcion text, marca text, marca_nombre text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.referencia, p.descripcion, p.marca, p.marca_nombre
  FROM public.productos p
  WHERE (SELECT public.puede_gestionar_ofertas(auth.uid()))
    AND length(COALESCE(_q,'')) >= 2
    AND (p.referencia ILIKE '%'||_q||'%' OR p.descripcion ILIKE '%'||_q||'%')
  ORDER BY p.referencia LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.ofertas_buscar_referencias(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_buscar_referencias(text) TO authenticated, service_role;

-- Marcas efectivas (para bloqueos): marcas de la oferta + marca de cada referencia
CREATE OR REPLACE FUNCTION public.oferta_marcas_efectivas(_oferta_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT m) FILTER (WHERE m IS NOT NULL AND m <> ''), '{}')
  FROM public.ofertas o
  CROSS JOIN LATERAL (
    SELECT unnest(o.marcas) AS m
    UNION SELECT p.marca FROM public.productos p WHERE p.referencia = ANY(o.referencias)
  ) x
  WHERE o.id = _oferta_id AND (SELECT public.is_approved(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.oferta_marcas_efectivas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oferta_marcas_efectivas(uuid) TO authenticated, service_role;

-- Patrones de prohibición
CREATE OR REPLACE FUNCTION public.normalizar_texto(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions' AS $$
  SELECT upper(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(_t,'')));
$$;
GRANT EXECUTE ON FUNCTION public.normalizar_texto(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ofertas_patrones_vista_previa(_patrones text[])
RETURNS TABLE(valor text, clientes integer, bloqueado boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.prohibicion_venta, COUNT(*)::int,
    EXISTS (SELECT 1 FROM unnest(COALESCE(_patrones,'{}')) p
            WHERE btrim(p) <> '' AND public.normalizar_texto(c.prohibicion_venta) LIKE '%'||public.normalizar_texto(btrim(p))||'%')
  FROM public.clientes c
  WHERE NULLIF(btrim(c.prohibicion_venta),'') IS NOT NULL
    AND (SELECT public.puede_gestionar_ofertas(auth.uid()))
  GROUP BY c.prohibicion_venta
  ORDER BY 3 DESC, 2 DESC;
$$;
REVOKE ALL ON FUNCTION public.ofertas_patrones_vista_previa(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_patrones_vista_previa(text[]) TO authenticated, service_role;

-- Página pública
CREATE OR REPLACE FUNCTION public.oferta_publica(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN o.estado <> 'publicada' THEN jsonb_build_object('estado','no_disponible')
      WHEN o.vigente_hasta IS NOT NULL AND o.vigente_hasta < CURRENT_DATE THEN jsonb_build_object('estado','vencida')
      WHEN o.vigente_desde IS NOT NULL AND o.vigente_desde > CURRENT_DATE THEN jsonb_build_object('estado','no_disponible')
      ELSE jsonb_build_object('estado','vigente','titulo',o.titulo,'descripcion',o.descripcion,
        'vigente_hasta',o.vigente_hasta,'adjuntos',o.adjuntos)
    END
    FROM public.ofertas o WHERE o.token = _token AND length(_token) >= 20
  ), jsonb_build_object('estado','no_disponible'));
$$;
REVOKE ALL ON FUNCTION public.oferta_publica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oferta_publica(text) TO anon, authenticated, service_role;

-- Ajustes
INSERT INTO public.app_settings(key, value, description) VALUES
  ('ofertas_url_base', 'https://crmrimosa.josecarlossobrino.com', 'Dirección base de los enlaces públicos de ofertas'),
  ('ofertas_patrones_prohibicion', '["PROHIBICION","PERDIDAS","GIRO DEVUELTO","CERRAD","LIQUIDACION","CONCURSO","FALLECID","PASA AL","CAMBIA DE CODIGO"]', 'Patrones de prohibición de venta que bloquean el envío de ofertas')
ON CONFLICT (key) DO NOTHING;

-- Panel
INSERT INTO public.dashboards(key, name, description, icon, route, sort_order, is_active)
VALUES ('ofertas', 'Ofertas', 'Ofertas comerciales para enviar a clientes', 'Megaphone', '/ofertas', 50, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.user_dashboard_access(user_id, dashboard_key)
SELECT DISTINCT ur.user_id, 'ofertas' FROM public.user_roles ur
WHERE ur.role IN ('marketing','director_comercial')
  AND NOT EXISTS (SELECT 1 FROM public.user_dashboard_access a WHERE a.user_id = ur.user_id AND a.dashboard_key = 'ofertas');

-- Archivos de ofertas
CREATE POLICY "Gestores suben archivos de ofertas" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ofertas-publicas' AND (SELECT public.puede_gestionar_ofertas(auth.uid())));
CREATE POLICY "Gestores cambian archivos de ofertas" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ofertas-publicas' AND (SELECT public.puede_gestionar_ofertas(auth.uid())));
CREATE POLICY "Gestores borran archivos de ofertas" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ofertas-publicas' AND (SELECT public.puede_gestionar_ofertas(auth.uid())));