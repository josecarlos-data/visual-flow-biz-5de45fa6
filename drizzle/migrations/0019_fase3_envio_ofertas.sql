CREATE TABLE public.ofertas_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id uuid NOT NULL REFERENCES public.ofertas(id) ON DELETE RESTRICT,
  cod_cliente integer NOT NULL REFERENCES public.clientes(cod_cliente) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  comercial_nombre text,
  telefono text NOT NULL,
  mensaje text NOT NULL,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','enviado','no_enviado','sin_confirmar')),
  tanda_id uuid,
  abierto_en timestamptz NOT NULL DEFAULT now(),
  confirmado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ofertas_envios_cliente_idx ON public.ofertas_envios(cod_cliente, abierto_en DESC);
CREATE INDEX ofertas_envios_oferta_idx ON public.ofertas_envios(oferta_id);
CREATE INDEX ofertas_envios_user_estado_idx ON public.ofertas_envios(user_id, estado);
GRANT SELECT ON public.ofertas_envios TO authenticated;
GRANT ALL ON public.ofertas_envios TO service_role;
ALTER TABLE public.ofertas_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver envios propios o de clientes visibles" ON public.ofertas_envios FOR SELECT TO authenticated
  USING ((SELECT public.is_approved(auth.uid())) AND (
    user_id = auth.uid() OR public.can_view_cliente(auth.uid(), cod_cliente)
    OR (SELECT public.puede_gestionar_ofertas(auth.uid()))));

CREATE OR REPLACE FUNCTION public.puede_enviar_ofertas(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_approved(_uid) AND (
    public.has_role(_uid,'admin') OR public.has_role(_uid,'director_comercial')
    OR public.has_role(_uid,'jefe_de_zona') OR public.has_role(_uid,'comercial'));
$$;
REVOKE ALL ON FUNCTION public.puede_enviar_ofertas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_enviar_ofertas(uuid) TO authenticated, service_role;

-- Evaluación interna (sin comprobación de llamante; solo la usan las RPC de abajo)
CREATE OR REPLACE FUNCTION public.oferta_evaluar_cliente(_oferta_id uuid, _cod integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o public.ofertas%ROWTYPE;
  c public.clientes%ROWTYPE;
  p public.cliente_preferencias_ofertas%ROWTYPE;
  b jsonb := '[]'::jsonb;
  a jsonb := '[]'::jsonb;
  v_patrones text[];
  v_efectos text[];
  v_marcas text[];
  v_excl text[];
  r jsonb;
  v_val text;
  v_nombre text;
  v_valores text[];
BEGIN
  SELECT * INTO o FROM public.ofertas WHERE id = _oferta_id;
  SELECT * INTO c FROM public.clientes WHERE cod_cliente = _cod;
  IF o.id IS NULL OR c.id IS NULL THEN
    RETURN jsonb_build_object('bloqueos', jsonb_build_array('No disponible'), 'avisos', '[]'::jsonb);
  END IF;
  SELECT * INTO p FROM public.cliente_preferencias_ofertas WHERE cod_cliente = _cod;

  IF o.estado <> 'publicada' OR (o.vigente_hasta IS NOT NULL AND o.vigente_hasta < CURRENT_DATE)
     OR (o.vigente_desde IS NOT NULL AND o.vigente_desde > CURRENT_DATE) THEN
    b := b || to_jsonb('La oferta no está vigente'::text);
  END IF;
  IF cardinality(o.delegaciones) > 0 AND NOT (COALESCE(c.delegacion,'') = ANY(o.delegaciones)) THEN
    b := b || to_jsonb(('Delegación fuera de la oferta (' || COALESCE(c.delegacion,'sin delegación') || ')')::text);
  END IF;
  IF cardinality(o.tipos_cliente) > 0 AND NOT (COALESCE(c.cod_tipo_cliente,'') = ANY(o.tipos_cliente)) THEN
    b := b || to_jsonb(('Tipo de cliente fuera de la oferta (' || COALESCE(NULLIF(c.cod_tipo_cliente,''),'sin tipo') || ')')::text);
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(o.requisitos,'[]'::jsonb)) LOOP
    CONTINUE WHEN COALESCE(r->>'atributo_key','') = '';
    SELECT nombre INTO v_nombre FROM public.perfil_atributos WHERE key = r->>'atributo_key';
    SELECT d.valor_texto INTO v_val FROM public.cliente_perfil_datos d
      WHERE d.cod_cliente = _cod AND d.atributo_key = r->>'atributo_key' AND d.estado = 'confirmado'
      ORDER BY d.observado_en DESC, d.updated_at DESC LIMIT 1;
    SELECT COALESCE(array_agg(public.normalizar_texto(btrim(x))), '{}') INTO v_valores
      FROM jsonb_array_elements_text(COALESCE(r->'valores','[]'::jsonb)) x;
    IF v_val IS NULL THEN
      a := a || to_jsonb(('Sin dato: ' || COALESCE(v_nombre, r->>'atributo_key'))::text);
    ELSIF cardinality(v_valores) > 0 AND NOT (public.normalizar_texto(btrim(v_val)) = ANY(v_valores)) THEN
      b := b || to_jsonb(('No cumple: ' || COALESCE(v_nombre, r->>'atributo_key') || ' = ' || v_val)::text);
    END IF;
  END LOOP;
  v_marcas := ARRAY(SELECT DISTINCT m FROM (
      SELECT unnest(o.marcas) m UNION SELECT pr.marca FROM public.productos pr WHERE pr.referencia = ANY(o.referencias)) x
      WHERE m IS NOT NULL AND m <> '');
  v_excl := ARRAY(SELECT unnest(COALESCE(p.marcas_excluidas,'{}')) INTERSECT SELECT unnest(v_marcas));
  IF cardinality(v_excl) > 0 THEN
    b := b || to_jsonb(('Marca excluida por el cliente: ' || array_to_string(v_excl, ', '))::text);
  END IF;
  IF COALESCE(p.no_quiere_ofertas, false) THEN
    b := b || to_jsonb('El cliente no quiere ofertas'::text);
  END IF;
  BEGIN
    SELECT ARRAY(SELECT jsonb_array_elements_text(value::jsonb)) INTO v_patrones FROM public.app_settings WHERE key = 'ofertas_patrones_prohibicion';
  EXCEPTION WHEN others THEN v_patrones := '{}'; END;
  IF NULLIF(btrim(c.prohibicion_venta),'') IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(COALESCE(v_patrones,'{}')) pt
      WHERE btrim(pt) <> '' AND public.normalizar_texto(c.prohibicion_venta) LIKE '%'||public.normalizar_texto(btrim(pt))||'%') THEN
    b := b || to_jsonb(('Prohibición de venta: ' || c.prohibicion_venta)::text);
  END IF;
  BEGIN
    SELECT ARRAY(SELECT jsonb_array_elements_text(value::jsonb)) INTO v_efectos FROM public.app_settings WHERE key = 'ofertas_efectos_bloqueo';
  EXCEPTION WHEN others THEN v_efectos := '{}'; END;
  IF cardinality(COALESCE(v_efectos,'{}')) > 0 AND EXISTS (
      SELECT 1 FROM public.situaciones_cliente s WHERE s.cod_cliente = _cod AND s.activo
        AND s.desde <= CURRENT_DATE AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE) AND s.efecto = ANY(v_efectos)) THEN
    b := b || to_jsonb('Situación activa que impide contactar'::text);
  END IF;
  IF (NULLIF(btrim(c.extra->>'Estado'),'') IS NOT NULL AND upper(btrim(c.extra->>'Estado')) <> 'ACTIVO')
     OR NULLIF(btrim(c.extra->>'Fecha de baja'),'') IS NOT NULL THEN
    b := b || to_jsonb(('Cliente de baja en ISI' || COALESCE(' (' || NULLIF(btrim(c.extra->>'Motivo de baja'),'') || ')', ''))::text);
  END IF;
  RETURN jsonb_build_object('bloqueos', b, 'avisos', a);
END $$;
REVOKE ALL ON FUNCTION public.oferta_evaluar_cliente(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oferta_evaluar_cliente(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.ofertas_para_cliente(_cod_cliente integer)
RETURNS TABLE(oferta_id uuid, titulo text, descripcion text, mensaje text, token text, vigente_hasta date,
  bloqueos jsonb, avisos jsonb, ultimo_envio timestamptz, ultimo_envio_por text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.puede_enviar_ofertas(auth.uid()) OR NOT public.can_view_cliente(auth.uid(), _cod_cliente) THEN
    RAISE EXCEPTION 'Sin permiso para este cliente' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.titulo, o.descripcion, o.mensaje, o.token, o.vigente_hasta,
    ev->'bloqueos', ev->'avisos', u.abierto_en, u.comercial_nombre
  FROM public.ofertas o
  CROSS JOIN LATERAL public.oferta_evaluar_cliente(o.id, _cod_cliente) ev
  LEFT JOIN LATERAL (SELECT e.abierto_en, e.comercial_nombre FROM public.ofertas_envios e
    WHERE e.oferta_id = o.id AND e.cod_cliente = _cod_cliente AND e.estado = 'enviado'
    ORDER BY e.abierto_en DESC LIMIT 1) u ON true
  WHERE o.estado = 'publicada' AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= CURRENT_DATE)
    AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE)
  ORDER BY o.vigente_hasta NULLS LAST, o.titulo;
END $$;
REVOKE ALL ON FUNCTION public.ofertas_para_cliente(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_para_cliente(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ofertas_vigentes_envio()
RETURNS TABLE(oferta_id uuid, titulo text, vigente_hasta date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.id, o.titulo, o.vigente_hasta FROM public.ofertas o
  WHERE public.puede_enviar_ofertas(auth.uid()) AND o.estado = 'publicada'
    AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= CURRENT_DATE)
    AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE)
  ORDER BY o.vigente_hasta NULLS LAST, o.titulo;
$$;
REVOKE ALL ON FUNCTION public.ofertas_vigentes_envio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_vigentes_envio() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ofertas_destinatarios(_oferta_id uuid)
RETURNS TABLE(cod_cliente integer, cliente text, localidad text, ruta text, persona_contacto text,
  telefono_whatsapp text, telefono text, telefono2 text, bloqueos jsonb, avisos jsonb, ultimo_envio timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.puede_enviar_ofertas(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.cod_cliente, c.cliente, c.localidad, c.ruta, c.persona_contacto,
    p.telefono_whatsapp, c.telefono, c.telefono2, ev->'bloqueos', ev->'avisos',
    (SELECT max(e.abierto_en) FROM public.ofertas_envios e WHERE e.oferta_id = _oferta_id AND e.cod_cliente = c.cod_cliente AND e.estado = 'enviado')
  FROM public.clientes c
  LEFT JOIN public.cliente_preferencias_ofertas p ON p.cod_cliente = c.cod_cliente
  CROSS JOIN LATERAL public.oferta_evaluar_cliente(_oferta_id, c.cod_cliente) ev
  WHERE public.can_view_cliente(auth.uid(), c.cod_cliente)
  ORDER BY c.ruta NULLS LAST, c.cliente;
END $$;
REVOKE ALL ON FUNCTION public.ofertas_destinatarios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_destinatarios(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_envio_oferta(_oferta_id uuid, _cod_cliente integer, _telefono text,
  _mensaje text, _guardar_telefono boolean DEFAULT false, _tanda_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ev jsonb;
  v_id uuid;
  v_nombre text;
  v_email text;
BEGIN
  IF NOT public.puede_enviar_ofertas(v_uid) OR NOT public.can_view_cliente(v_uid, _cod_cliente) THEN
    RAISE EXCEPTION 'Sin permiso para este cliente' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(_telefono,'') !~ '^34[67][0-9]{8}$' THEN
    RAISE EXCEPTION 'El teléfono debe ser un móvil español' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(_mensaje,'')) = 0 OR length(_mensaje) > 4000 THEN
    RAISE EXCEPTION 'Mensaje no válido' USING ERRCODE = '22023';
  END IF;
  v_ev := public.oferta_evaluar_cliente(_oferta_id, _cod_cliente);
  IF jsonb_array_length(v_ev->'bloqueos') > 0 THEN
    RAISE EXCEPTION 'No se puede enviar: %', v_ev->'bloqueos'->>0 USING ERRCODE = '42501';
  END IF;
  SELECT full_name, email INTO v_nombre, v_email FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.ofertas_envios(oferta_id, cod_cliente, user_id, comercial_nombre, telefono, mensaje, tanda_id)
  VALUES (_oferta_id, _cod_cliente, v_uid, v_nombre, _telefono, _mensaje, _tanda_id)
  RETURNING id INTO v_id;
  IF _guardar_telefono THEN
    INSERT INTO public.cliente_preferencias_ofertas(cod_cliente, telefono_whatsapp)
    VALUES (_cod_cliente, '+' || _telefono)
    ON CONFLICT (cod_cliente) DO UPDATE SET telefono_whatsapp = EXCLUDED.telefono_whatsapp;
  END IF;
  INSERT INTO public.auditoria_eventos(user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_uid, v_email, 'oferta_envio', 'ok', 'ofertas_envios', v_id::text,
    jsonb_build_object('oferta_id', _oferta_id, 'cod_cliente', _cod_cliente, 'estado', 'abierto'));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.registrar_envio_oferta(uuid, integer, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_oferta(uuid, integer, text, text, boolean, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirmar_envio_oferta(_envio_id uuid, _enviado boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_n int;
BEGIN
  IF NOT public.puede_enviar_ofertas(v_uid) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ofertas_envios SET estado = CASE WHEN _enviado THEN 'enviado' ELSE 'no_enviado' END, confirmado_en = now()
  WHERE id = _envio_id AND user_id = v_uid AND estado IN ('abierto','sin_confirmar');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.auditoria_eventos(user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_uid, v_email, 'oferta_envio', 'ok', 'ofertas_envios', _envio_id::text,
    jsonb_build_object('estado', CASE WHEN _enviado THEN 'enviado' ELSE 'no_enviado' END));
END $$;
REVOKE ALL ON FUNCTION public.confirmar_envio_oferta(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_envio_oferta(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.caducar_envios_ofertas()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.ofertas_envios SET estado = 'sin_confirmar'
  WHERE estado = 'abierto' AND abierto_en < now() - interval '7 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.caducar_envios_ofertas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caducar_envios_ofertas() TO service_role;

INSERT INTO public.app_settings(key, value, description) VALUES
  ('ofertas_efectos_bloqueo', '[]', 'Efectos de situación de cliente que impiden enviar ofertas')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.user_dashboard_access(user_id, dashboard_key)
SELECT DISTINCT ur.user_id, 'ofertas' FROM public.user_roles ur
WHERE ur.role IN ('jefe_de_zona','comercial','admin')
  AND NOT EXISTS (SELECT 1 FROM public.user_dashboard_access a WHERE a.user_id = ur.user_id AND a.dashboard_key = 'ofertas');

SELECT cron.schedule('caducar-envios-ofertas', '15 4 * * *', 'SELECT public.caducar_envios_ofertas();');
