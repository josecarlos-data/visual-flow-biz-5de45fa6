-- Cierre de Ofertas y Comunicaciones: interruptor único ofertas_activo (apagado por defecto)
INSERT INTO public.app_settings(key, value, description)
VALUES ('ofertas_activo','false','Activa la sección Ofertas y Comunicaciones (envíos, recomendaciones y enlace público)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ofertas_activo()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT value = 'true' FROM public.app_settings WHERE key = 'ofertas_activo'), false) $$;
REVOKE ALL ON FUNCTION public.ofertas_activo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ofertas_activo() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sincronizar_paneles_ofertas()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.key = 'ofertas_activo' THEN
    UPDATE public.dashboards SET is_active = (NEW.value = 'true'), updated_at = now()
    WHERE key IN ('ofertas','comunicaciones') AND is_active IS DISTINCT FROM (NEW.value = 'true');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sincronizar_paneles_ofertas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sincronizar_paneles_ofertas ON public.app_settings;
CREATE TRIGGER trg_sincronizar_paneles_ofertas AFTER INSERT OR UPDATE OF value ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_paneles_ofertas();

UPDATE public.dashboards SET is_active = public.ofertas_activo(), updated_at = now()
WHERE key IN ('ofertas','comunicaciones');

CREATE OR REPLACE FUNCTION public.registrar_envio_oferta(_oferta_id uuid, _cod_cliente integer, _telefono text, _mensaje text, _guardar_telefono boolean DEFAULT false, _tanda_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ev jsonb;
  v_id uuid;
  v_nombre text;
  v_email text;
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.confirmar_envio_oferta(_envio_id uuid, _enviado boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_email text; v_n int;
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.ofertas_para_cliente(_cod_cliente integer)
 RETURNS TABLE(oferta_id uuid, titulo text, descripcion text, mensaje text, token text, vigente_hasta date, bloqueos jsonb, avisos jsonb, ultimo_envio timestamp with time zone, ultimo_envio_por text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.ofertas_destinatarios(_oferta_id uuid)
 RETURNS TABLE(cod_cliente integer, cliente text, localidad text, ruta text, persona_contacto text, telefono_whatsapp text, telefono text, telefono2 text, bloqueos jsonb, avisos jsonb, ultimo_envio timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.ofertas_recomendados(_oferta_id uuid, _vendedor text DEFAULT NULL::text, _limite integer DEFAULT 200)
 RETURNS TABLE(cod_cliente integer, cliente text, localidad text, ruta text, vendedor text, persona_contacto text, telefono_whatsapp text, telefono text, telefono2 text, grupo text, motivo text, ultima_compra date, importe_12m numeric, saturado_dias integer, avisos jsonb, excluidos integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.ofertas%ROWTYPE;
  v_marcas text[]; v_meses int; v_sat int; v_excl int := 0; v_lim int;
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.puede_enviar_ofertas(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ofertas WHERE id = _oferta_id AND estado = 'publicada';
  IF o.id IS NULL THEN RETURN; END IF;
  v_lim := LEAST(GREATEST(COALESCE(_limite,200),1),500);
  SELECT NULLIF(value,'')::int INTO v_meses FROM public.app_settings WHERE key='recomendaciones_meses_abandono';
  SELECT NULLIF(value,'')::int INTO v_sat FROM public.app_settings WHERE key='recomendaciones_dias_saturacion';
  v_meses := COALESCE(v_meses,6); v_sat := COALESCE(v_sat,7);
  v_marcas := ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT pr.marca FROM public.productos pr WHERE pr.referencia = ANY(o.referencias)) x WHERE m IS NOT NULL AND m <> '');

  DROP TABLE IF EXISTS _vis; DROP TABLE IF EXISTS _rec; DROP TABLE IF EXISTS _rec2;
  CREATE TEMP TABLE _vis ON COMMIT DROP AS
  SELECT c.cod_cliente AS cod FROM public.clientes_permitidos(auth.uid()) cp
  JOIN public.clientes c ON c.cod_cliente = cp.cod_cliente
  WHERE (_vendedor IS NULL OR COALESCE(c.vendedor,'') = _vendedor)
    AND (cardinality(o.delegaciones) = 0 OR COALESCE(c.delegacion,'') = ANY(o.delegaciones))
    AND (cardinality(o.tipos_cliente) = 0 OR COALESCE(c.cod_tipo_cliente,'') = ANY(o.tipos_cliente))
    AND NOT EXISTS (SELECT 1 FROM public.ofertas_envios e WHERE e.oferta_id = _oferta_id AND e.cod_cliente = c.cod_cliente AND e.estado IN ('abierto','enviado'))
    AND NOT EXISTS (SELECT 1 FROM public.ofertas_descartes d WHERE d.cod_cliente = c.cod_cliente
       AND (d.oferta_id = _oferta_id OR (d.alcance = 'familia' AND d.familias && o.familias AND (d.hasta IS NULL OR d.hasta >= CURRENT_DATE))));
  ALTER TABLE _vis ADD PRIMARY KEY (cod);

  CREATE TEMP TABLE _rec(cod integer PRIMARY KEY, grupo text, ultima date, imp numeric, orden numeric) ON COMMIT DROP;
  IF cardinality(o.referencias) > 0 OR cardinality(o.familias) > 0 OR cardinality(v_marcas) > 0 THEN
    INSERT INTO _rec
    SELECT v.cod_cliente,
      CASE WHEN max(v.fecha) >= CURRENT_DATE - make_interval(months => v_meses) THEN 'habitual' ELSE 'recuperar' END,
      max(v.fecha),
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha >= CURRENT_DATE - interval '12 months'),0), 0
    FROM public.ventas_diarias v JOIN _vis ON _vis.cod = v.cod_cliente
    WHERE v.fecha >= CURRENT_DATE - interval '24 months'
      AND (v.referencia = ANY(o.referencias) OR v.familia = ANY(o.familias) OR v.marca = ANY(v_marcas))
    GROUP BY v.cod_cliente;
  END IF;
  INSERT INTO _rec
  SELECT k.cod_cliente, 'potencial', k.ultima_compra, k.importe_anio_actual, k.dias_sin_comprar
  FROM public.cliente_kpis k JOIN _vis ON _vis.cod = k.cod_cliente
  WHERE k.dias_sin_comprar IS NOT NULL AND k.dias_sin_comprar <= 365
  ON CONFLICT (cod) DO NOTHING;

  CREATE TEMP TABLE _rec2 ON COMMIT DROP AS
  SELECT r.cod, r.grupo, r.ultima, r.imp, r.orden, public.oferta_evaluar_cliente(_oferta_id, r.cod) AS ev
  FROM (SELECT * FROM _rec r
        ORDER BY CASE r.grupo WHEN 'habitual' THEN 1 WHEN 'recuperar' THEN 2 ELSE 3 END,
          CASE WHEN r.grupo = 'potencial' THEN r.orden ELSE -r.imp END
        LIMIT v_lim * 2) r;
  SELECT count(*) INTO v_excl FROM _rec2 WHERE jsonb_array_length(_rec2.ev->'bloqueos') > 0;
  DELETE FROM _rec2 WHERE jsonb_array_length(_rec2.ev->'bloqueos') > 0;

  RETURN QUERY
  SELECT c.cod_cliente, c.cliente, c.localidad, c.ruta, c.vendedor, c.persona_contacto,
    p.telefono_whatsapp, c.telefono, c.telefono2, r.grupo,
    CASE r.grupo
      WHEN 'habitual' THEN 'Compra lo ofertado; última compra ' || to_char(r.ultima,'DD/MM/YYYY')
      WHEN 'recuperar' THEN 'Lo compraba y lo ha dejado; última compra ' || to_char(r.ultima,'DD/MM/YYYY')
      ELSE 'Cliente activo que aún no compra lo ofertado' END,
    r.ultima, r.imp, s.dias, r.ev->'avisos', v_excl
  FROM _rec2 r
  JOIN public.clientes c ON c.cod_cliente = r.cod
  LEFT JOIN public.cliente_preferencias_ofertas p ON p.cod_cliente = r.cod
  LEFT JOIN LATERAL (
    SELECT (CURRENT_DATE - max(e.abierto_en)::date)::int AS dias FROM public.ofertas_envios e
    WHERE e.cod_cliente = r.cod AND e.oferta_id <> _oferta_id AND e.estado IN ('abierto','enviado')
      AND e.abierto_en >= now() - make_interval(days => v_sat)) s ON true
  ORDER BY CASE r.grupo WHEN 'habitual' THEN 1 WHEN 'recuperar' THEN 2 ELSE 3 END,
    (s.dias IS NOT NULL),
    CASE WHEN r.grupo = 'potencial' THEN r.orden ELSE -r.imp END
  LIMIT v_lim;
END $function$;

CREATE OR REPLACE FUNCTION public.descartar_recomendacion(_oferta_id uuid, _cod_cliente integer, _motivo text, _nota text DEFAULT NULL::text, _toda_familia boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_dias int; v_fam text[]; v_email text;
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.puede_enviar_ofertas(v_uid) OR NOT public.can_view_cliente(v_uid, _cod_cliente) THEN
    RAISE EXCEPTION 'Sin permiso para este cliente' USING ERRCODE = '42501';
  END IF;
  IF _motivo NOT IN ('no_interesa','ya_lo_tiene','otro') THEN
    RAISE EXCEPTION 'Motivo no válido' USING ERRCODE = '22023';
  END IF;
  SELECT familias INTO v_fam FROM public.ofertas WHERE id = _oferta_id;
  IF v_fam IS NULL THEN RAISE EXCEPTION 'Oferta no encontrada' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(NULLIF(value,'')::int,90) INTO v_dias FROM public.app_settings WHERE key='recomendaciones_dias_descarte_familia';
  INSERT INTO public.ofertas_descartes(oferta_id, cod_cliente, user_id, motivo, nota, alcance, familias, hasta)
  VALUES (_oferta_id, _cod_cliente, v_uid, _motivo, NULLIF(btrim(COALESCE(_nota,'')),''),
    CASE WHEN _toda_familia AND cardinality(v_fam) > 0 THEN 'familia' ELSE 'oferta' END,
    CASE WHEN _toda_familia THEN v_fam ELSE '{}' END,
    CASE WHEN _toda_familia AND cardinality(v_fam) > 0 THEN CURRENT_DATE + COALESCE(v_dias,90) END)
  RETURNING id INTO v_id;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.auditoria_eventos(user_id, email, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_uid, v_email, 'oferta_descarte', 'ok', 'ofertas_descartes', v_id::text,
    jsonb_build_object('oferta_id', _oferta_id, 'cod_cliente', _cod_cliente, 'motivo', _motivo, 'toda_familia', _toda_familia));
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.oferta_publica(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT CASE
      WHEN NOT public.ofertas_activo() THEN jsonb_build_object('estado','no_disponible')
      WHEN o.estado <> 'publicada' THEN jsonb_build_object('estado','no_disponible')
      WHEN o.vigente_hasta IS NOT NULL AND o.vigente_hasta < CURRENT_DATE THEN jsonb_build_object('estado','vencida')
      WHEN o.vigente_desde IS NOT NULL AND o.vigente_desde > CURRENT_DATE THEN jsonb_build_object('estado','no_disponible')
      ELSE jsonb_build_object('estado','vigente','titulo',o.titulo,'descripcion',o.descripcion,
        'vigente_hasta',o.vigente_hasta,'adjuntos',o.adjuntos)
    END
    FROM public.ofertas o WHERE o.token = _token AND length(_token) >= 20
  ), jsonb_build_object('estado','no_disponible'));
$function$;

CREATE OR REPLACE FUNCTION public.archivo_oferta_visible(_path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.ofertas_activo() AND EXISTS (
    SELECT 1 FROM public.ofertas o, jsonb_array_elements(o.adjuntos) a
    WHERE a->>'path' = _path AND o.estado = 'publicada'
      AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= CURRENT_DATE)
      AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE));
$function$;

DROP FUNCTION public.comunicaciones_listado(date, date, uuid, uuid, text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.comunicaciones_listado(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _oferta_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid, _delegacion text DEFAULT NULL::text, _estado text DEFAULT NULL::text, _origen text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, abierto_en timestamp with time zone, estado text, cod_cliente integer, cliente text, delegacion text, oferta_id uuid, oferta_titulo text, comercial_nombre text, telefono text, mensaje text, origen text, ventas_antes numeric, ventas_despues numeric, pendiente_datos boolean, fecha_corte date, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_corte date := public.fecha_corte_datos();
BEGIN
  IF NOT public.is_approved(v_uid) OR NOT (public.puede_gestionar_ofertas(v_uid) OR public.puede_enviar_ofertas(v_uid)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT e.*, c.cliente AS c_cliente, c.delegacion AS c_deleg, o.titulo, count(*) OVER () AS n
    FROM public.ofertas_envios e
    JOIN public.clientes c ON c.cod_cliente = e.cod_cliente
    JOIN public.ofertas o ON o.id = e.oferta_id
    WHERE public.comunicaciones_ve(v_uid, e.cod_cliente)
      AND (_desde IS NULL OR e.abierto_en::date >= _desde)
      AND (_hasta IS NULL OR e.abierto_en::date <= _hasta)
      AND (_oferta_id IS NULL OR e.oferta_id = _oferta_id)
      AND (_user_id IS NULL OR e.user_id = _user_id)
      AND (_delegacion IS NULL OR c.delegacion = _delegacion)
      AND (_estado IS NULL OR e.estado = _estado)
      AND (_origen IS NULL OR e.origen = _origen)
    ORDER BY e.abierto_en DESC
    LIMIT LEAST(GREATEST(COALESCE(_limit,50),1),5000) OFFSET GREATEST(COALESCE(_offset,0),0))
  SELECT b.id, b.abierto_en, b.estado, b.cod_cliente, b.c_cliente, b.c_deleg, b.oferta_id, b.titulo,
    b.comercial_nombre, b.telefono, b.mensaje, b.origen,
    public.oferta_ventas_cliente(b.oferta_id, b.cod_cliente, b.abierto_en::date - 30, b.abierto_en::date - 1),
    CASE WHEN b.abierto_en::date + 30 <= v_corte
      THEN public.oferta_ventas_cliente(b.oferta_id, b.cod_cliente, b.abierto_en::date + 1, b.abierto_en::date + 30) END,
    b.abierto_en::date + 30 > v_corte, v_corte, b.n
  FROM base b ORDER BY b.abierto_en DESC;
END $function$;
REVOKE ALL ON FUNCTION public.comunicaciones_listado(date, date, uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicaciones_listado(date, date, uuid, uuid, text, text, text, integer, integer) TO authenticated, service_role;

DROP FUNCTION public.comunicaciones_resumen_oferta(date, date);
CREATE OR REPLACE FUNCTION public.comunicaciones_resumen_oferta(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date)
 RETURNS TABLE(oferta_id uuid, titulo text, enviados bigint, no_enviados bigint, pendientes bigint, clientes bigint, medibles bigint, compradores_despues bigint, ventas_antes numeric, ventas_despues numeric, control_clientes bigint, control_antes numeric, control_despues numeric, bajas_tras_envio bigint, fecha_corte date, enviados_manual bigint, enviados_recomendacion bigint, confirmados_manual bigint, confirmados_recomendacion bigint, compradores_manual bigint, compradores_recomendacion bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_corte date := public.fecha_corte_datos();
BEGIN
  IF NOT public.is_approved(v_uid) OR NOT (public.puede_gestionar_ofertas(v_uid) OR public.puede_enviar_ofertas(v_uid)) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH e AS (
    SELECT x.* FROM public.ofertas_envios x
    WHERE public.comunicaciones_ve(v_uid, x.cod_cliente)
      AND (_desde IS NULL OR x.abierto_en::date >= _desde) AND (_hasta IS NULL OR x.abierto_en::date <= _hasta)),
  conf AS (  -- primer envío confirmado por oferta y cliente
    SELECT DISTINCT ON (oferta_id, cod_cliente) oferta_id, cod_cliente, abierto_en::date d, origen
    FROM e WHERE estado = 'enviado' ORDER BY oferta_id, cod_cliente, abierto_en),
  med AS (
    SELECT c.oferta_id, c.cod_cliente, c.origen,
      public.oferta_ventas_cliente(c.oferta_id, c.cod_cliente, c.d - 30, c.d - 1) antes,
      public.oferta_ventas_cliente(c.oferta_id, c.cod_cliente, c.d + 1, c.d + 30) despues
    FROM conf c WHERE c.d + 30 <= v_corte),
  ref AS (  -- fecha de referencia del grupo de control: mediana de envíos medibles
    SELECT c.oferta_id, (min(c.d) + ((max(c.d) - min(c.d)) / 2))::date d
    FROM conf c WHERE c.d + 30 <= v_corte GROUP BY c.oferta_id),
  ctrl AS (
    SELECT r.oferta_id, count(DISTINCT v.cod_cliente) n,
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha BETWEEN r.d - 30 AND r.d - 1), 0) antes,
      COALESCE(sum(v.importe) FILTER (WHERE v.fecha BETWEEN r.d + 1 AND r.d + 30), 0) despues
    FROM ref r
    JOIN public.ofertas o ON o.id = r.oferta_id
    CROSS JOIN LATERAL (SELECT ARRAY(SELECT DISTINCT m FROM (SELECT unnest(o.marcas) m UNION SELECT p.marca FROM public.productos p WHERE p.referencia = ANY(o.referencias)) z WHERE m <> '') marcas) mk
    JOIN public.ventas_diarias v ON v.fecha BETWEEN r.d - 30 AND r.d + 30
      AND (v.referencia = ANY(o.referencias) OR v.marca = ANY(mk.marcas) OR v.familia = ANY(o.familias))
    WHERE NOT EXISTS (SELECT 1 FROM public.ofertas_envios s WHERE s.oferta_id = r.oferta_id AND s.cod_cliente = v.cod_cliente)
      AND public.comunicaciones_ve(v_uid, v.cod_cliente)
    GROUP BY r.oferta_id),
  bajas AS (
    SELECT c.oferta_id, count(*) n FROM conf c
    JOIN public.cliente_preferencias_ofertas p ON p.cod_cliente = c.cod_cliente
    WHERE p.no_quiere_ofertas AND p.updated_at::date >= c.d GROUP BY c.oferta_id)
  SELECT o.id, o.titulo,
    count(*) FILTER (WHERE e.estado = 'enviado'),
    count(*) FILTER (WHERE e.estado = 'no_enviado'),
    count(*) FILTER (WHERE e.estado IN ('abierto','sin_confirmar')),
    count(DISTINCT e.cod_cliente) FILTER (WHERE e.estado = 'enviado'),
    (SELECT count(*) FROM med m WHERE m.oferta_id = o.id),
    (SELECT count(*) FROM med m WHERE m.oferta_id = o.id AND m.despues > 0),
    (SELECT COALESCE(sum(m.antes),0) FROM med m WHERE m.oferta_id = o.id),
    (SELECT COALESCE(sum(m.despues),0) FROM med m WHERE m.oferta_id = o.id),
    COALESCE((SELECT k.n FROM ctrl k WHERE k.oferta_id = o.id), 0),
    (SELECT k.antes FROM ctrl k WHERE k.oferta_id = o.id),
    (SELECT k.despues FROM ctrl k WHERE k.oferta_id = o.id),
    COALESCE((SELECT b.n FROM bajas b WHERE b.oferta_id = o.id), 0),
    v_corte,
    count(*) FILTER (WHERE e.origen = 'manual'),
    count(*) FILTER (WHERE e.origen = 'recomendacion'),
    count(*) FILTER (WHERE e.origen = 'manual' AND e.estado = 'enviado'),
    count(*) FILTER (WHERE e.origen = 'recomendacion' AND e.estado = 'enviado'),
    (SELECT count(*) FROM med m WHERE m.oferta_id = o.id AND m.despues > 0 AND m.origen = 'manual'),
    (SELECT count(*) FROM med m WHERE m.oferta_id = o.id AND m.despues > 0 AND m.origen = 'recomendacion')
  FROM e JOIN public.ofertas o ON o.id = e.oferta_id
  GROUP BY o.id, o.titulo
  ORDER BY max(e.abierto_en) DESC;
END $function$;
REVOKE ALL ON FUNCTION public.comunicaciones_resumen_oferta(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comunicaciones_resumen_oferta(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ofertas_recomendados_resumen(_oferta_id uuid)
 RETURNS TABLE(vendedor text, grupo text, clientes bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_deleg text;
BEGIN
  IF NOT public.ofertas_activo() THEN
    RAISE EXCEPTION 'Ofertas desactivado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_approved(v_uid) OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'director_comercial') OR public.has_role(v_uid,'jefe_de_zona')) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'director_comercial')) THEN
    v_deleg := public.get_user_delegacion(v_uid);
  END IF;
  RETURN QUERY
  SELECT COALESCE(r.vendedor,'Sin comercial'), r.grupo, count(*)
  FROM public.ofertas_recomendados(_oferta_id, NULL, 1000) r
  JOIN public.clientes c ON c.cod_cliente = r.cod_cliente
  WHERE r.grupo IS NOT NULL AND (v_deleg IS NULL OR c.delegacion = v_deleg)
  GROUP BY 1, 2 ORDER BY 1, 2;
END $function$;
REVOKE ALL ON FUNCTION public.ofertas_recomendados_resumen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ofertas_recomendados_resumen(uuid) TO authenticated, service_role;