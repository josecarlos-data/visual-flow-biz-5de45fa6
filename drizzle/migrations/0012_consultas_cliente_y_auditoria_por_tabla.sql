-- 1) auditar_cambio: añade cod_cliente y, para el perfil de cliente, atributo y valores antes/después.
CREATE OR REPLACE FUNCTION public.auditar_cambio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_campos text[] := ARRAY[]::text[];
  v_detalle jsonb;
  v_entidad_id text;
  v_tipo text;
  v_cod text;
  v_perfil jsonb := '{}'::jsonb;
  k text;
BEGIN
  IF v_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_tipo := 'dato_alta';
  ELSIF TG_OP = 'UPDATE' THEN
    v_tipo := 'dato_cambio';
  ELSE
    v_tipo := 'dato_baja';
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF TG_TABLE_NAME = 'app_settings' THEN
    v_entidad_id := COALESCE(v_new ->> 'key', v_old ->> 'key');
  ELSE
    v_entidad_id := COALESCE(v_new ->> 'id', v_old ->> 'id');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR k IN
      SELECT key FROM jsonb_object_keys(v_old || v_new) AS t(key)
      WHERE key NOT IN ('updated_at', 'created_at')
    LOOP
      IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_campos := v_campos || k;
      END IF;
    END LOOP;

    IF array_length(v_campos, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_detalle := jsonb_build_object('campos', to_jsonb(v_campos));

  v_cod := COALESCE(v_new ->> 'cod_cliente', v_old ->> 'cod_cliente');
  IF v_cod IS NOT NULL THEN
    v_detalle := v_detalle || jsonb_build_object('cod_cliente', v_cod::int);
  END IF;

  IF TG_TABLE_NAME = 'app_settings' THEN
    IF v_old IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object('antes', v_old -> 'value');
    END IF;
    IF v_new IS NOT NULL THEN
      v_detalle := v_detalle || jsonb_build_object('despues', v_new -> 'value');
    END IF;
  ELSIF TG_TABLE_NAME = 'cliente_perfil_datos' THEN
    v_detalle := v_detalle || jsonb_build_object('atributo', COALESCE(v_new ->> 'atributo_key', v_old ->> 'atributo_key'));
    FOREACH k IN ARRAY ARRAY['valor_texto', 'estado', 'motivo_descarte'] LOOP
      IF TG_OP <> 'UPDATE' OR (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_perfil := v_perfil || jsonb_build_object(k,
          jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k));
      END IF;
    END LOOP;
    v_detalle := v_detalle || jsonb_build_object('perfil', v_perfil);
  END IF;

  BEGIN
    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle)
    VALUES (v_uid, v_tipo, 'ok', TG_TABLE_NAME, v_entidad_id, v_detalle);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE TRIGGER auditar_cliente_perfil_datos
AFTER INSERT OR UPDATE OR DELETE ON public.cliente_perfil_datos
FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio();

-- 2) Registro de consultas
CREATE TABLE public.consultas_cliente (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  cod_cliente integer NOT NULL,
  pestana text NOT NULL
);
REVOKE ALL ON public.consultas_cliente FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.consultas_cliente TO service_role;
ALTER TABLE public.consultas_cliente ENABLE ROW LEVEL SECURITY;
CREATE INDEX consultas_cliente_usuario_idx ON public.consultas_cliente (user_id, ocurrido_en);
CREATE INDEX consultas_cliente_cliente_idx ON public.consultas_cliente (cod_cliente, ocurrido_en);
COMMENT ON TABLE public.consultas_cliente IS 'Registro de consultas de fichas de cliente. Solo para investigar fugas de información; nunca para evaluar rendimiento.';

CREATE OR REPLACE FUNCTION public.registrar_consulta(_cod integer, _pestana text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _cod IS NULL THEN RETURN; END IF;
  IF COALESCE((SELECT value FROM public.app_settings WHERE key = 'registro_consultas_activo'), 'false') <> 'true' THEN
    RETURN;
  END IF;
  IF _pestana IS NULL OR _pestana NOT IN ('resumen', 'visitas', 'productos', 'documentos', 'perfil', 'ia') THEN RETURN; END IF;
  IF NOT public.is_approved(v_uid) THEN RETURN; END IF;
  IF NOT public.can_view_cliente(v_uid, _cod) THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.consultas_cliente
    WHERE user_id = v_uid AND cod_cliente = _cod AND pestana = _pestana
      AND ocurrido_en > now() - interval '5 minutes'
  ) THEN RETURN; END IF;
  INSERT INTO public.consultas_cliente (user_id, cod_cliente, pestana) VALUES (v_uid, _cod, _pestana);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.registrar_consulta(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_consulta(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.consultas_por_usuario(_user_id uuid, _desde timestamptz, _hasta timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_len interval;
  v_base_desde timestamptz;
  v_primera timestamptz;
  v_suficiente boolean;
  v_factor numeric;
  v_resultado jsonb;
  v_dias_periodo numeric;
  v_clientes_dia numeric;
  v_clientes_dia_media numeric;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RETURN NULL; END IF;
  IF _user_id IS NULL OR _desde IS NULL OR _hasta IS NULL OR _hasta <= _desde THEN
    RAISE EXCEPTION 'periodo_no_valido';
  END IF;
  IF _hasta - _desde > interval '90 days' THEN
    RAISE EXCEPTION 'periodo_maximo_90_dias';
  END IF;

  v_len := _hasta - _desde;
  v_base_desde := _desde - interval '90 days';
  SELECT min(ocurrido_en) INTO v_primera FROM public.consultas_cliente WHERE user_id = _user_id;
  v_suficiente := v_primera IS NOT NULL AND v_primera <= v_base_desde;
  -- Número de periodos de la misma duración que caben en los 90 días anteriores.
  v_factor := extract(epoch FROM interval '90 days') / extract(epoch FROM v_len);
  v_dias_periodo := greatest(extract(epoch FROM v_len) / 86400, 1);

  SELECT count(DISTINCT (cod_cliente, date_trunc('day', ocurrido_en)))::numeric / v_dias_periodo INTO v_clientes_dia
  FROM public.consultas_cliente WHERE user_id = _user_id AND ocurrido_en >= _desde AND ocurrido_en < _hasta;
  SELECT count(DISTINCT (cod_cliente, date_trunc('day', ocurrido_en)))::numeric / 90 INTO v_clientes_dia_media
  FROM public.consultas_cliente WHERE user_id = _user_id AND ocurrido_en >= v_base_desde AND ocurrido_en < _desde;

  WITH periodo AS (
    SELECT cod_cliente, pestana, ocurrido_en FROM public.consultas_cliente
    WHERE user_id = _user_id AND ocurrido_en >= _desde AND ocurrido_en < _hasta
  ), base AS (
    SELECT cod_cliente, count(*) AS n FROM public.consultas_cliente
    WHERE user_id = _user_id AND ocurrido_en >= v_base_desde AND ocurrido_en < _desde
    GROUP BY cod_cliente
  ), pest AS (
    SELECT cod_cliente, pestana, count(*) AS n FROM periodo GROUP BY cod_cliente, pestana
  ), agg AS (
    SELECT p.cod_cliente, count(*) AS veces, count(DISTINCT date_trunc('day', p.ocurrido_en)) AS dias,
           min(p.ocurrido_en) AS primera, max(p.ocurrido_en) AS ultima
    FROM periodo p GROUP BY p.cod_cliente
  ), fin AS (
    SELECT a.*, c.cliente,
      round(COALESCE(b.n, 0) / v_factor, 2) AS media,
      (SELECT jsonb_object_agg(x.pestana, x.n) FROM pest x WHERE x.cod_cliente = a.cod_cliente) AS pestanas,
      (SELECT x.pestana FROM pest x WHERE x.cod_cliente = a.cod_cliente ORDER BY x.n DESC, x.pestana LIMIT 1) AS pestana_principal,
      COALESCE(b.n, 0) AS base_n
    FROM agg a
    LEFT JOIN base b ON b.cod_cliente = a.cod_cliente
    LEFT JOIN public.clientes c ON c.cod_cliente = a.cod_cliente
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'cod_cliente', f.cod_cliente, 'cliente', f.cliente, 'veces', f.veces, 'dias', f.dias,
      'primera', f.primera, 'ultima', f.ultima, 'media', f.media, 'pestanas', f.pestanas,
      'pestana_principal', f.pestana_principal,
      'destacado', v_suficiente AND (f.base_n = 0 OR (f.veces >= 3 AND f.veces >= 3 * (f.base_n / v_factor))),
      'motivo', CASE
        WHEN NOT v_suficiente THEN NULL
        WHEN f.base_n = 0 THEN 'nuevo'
        WHEN f.veces >= 3 AND f.veces >= 3 * (f.base_n / v_factor) THEN 'triple'
        ELSE NULL END
    ) ORDER BY f.veces DESC, f.cod_cliente), '[]'::jsonb)
  INTO v_resultado FROM fin f;

  INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_admin, 'consulta_actividad', 'ok', 'usuario', _user_id::text,
    jsonb_build_object('vista', 'por_usuario', 'desde', _desde, 'hasta', _hasta));

  RETURN jsonb_build_object(
    'primera_consulta', v_primera,
    'historial_suficiente', v_suficiente,
    'clientes_dia', round(COALESCE(v_clientes_dia, 0), 2),
    'clientes_dia_media', round(COALESCE(v_clientes_dia_media, 0), 2),
    'clientes', v_resultado);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.consultas_por_usuario(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultas_por_usuario(uuid, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.consultas_por_cliente(_cod integer, _desde timestamptz, _hasta timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_resultado jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN RETURN NULL; END IF;
  IF _cod IS NULL OR _desde IS NULL OR _hasta IS NULL OR _hasta <= _desde THEN
    RAISE EXCEPTION 'periodo_no_valido';
  END IF;
  IF _hasta - _desde > interval '90 days' THEN
    RAISE EXCEPTION 'periodo_maximo_90_dias';
  END IF;

  WITH periodo AS (
    SELECT user_id, pestana, ocurrido_en FROM public.consultas_cliente
    WHERE cod_cliente = _cod AND ocurrido_en >= _desde AND ocurrido_en < _hasta
  ), pest AS (
    SELECT user_id, pestana, count(*) AS n FROM periodo GROUP BY user_id, pestana
  ), agg AS (
    SELECT user_id, count(*) AS veces, count(DISTINCT date_trunc('day', ocurrido_en)) AS dias,
           min(ocurrido_en) AS primera, max(ocurrido_en) AS ultima
    FROM periodo GROUP BY user_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'nombre', COALESCE(p.full_name, p.email), 'veces', a.veces, 'dias', a.dias,
      'primera', a.primera, 'ultima', a.ultima,
      'pestanas', (SELECT jsonb_object_agg(x.pestana, x.n) FROM pest x WHERE x.user_id = a.user_id)
    ) ORDER BY a.veces DESC), '[]'::jsonb)
  INTO v_resultado
  FROM agg a LEFT JOIN public.profiles p ON p.user_id = a.user_id;

  INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle)
  VALUES (v_admin, 'consulta_actividad', 'ok', 'cliente', _cod::text,
    jsonb_build_object('vista', 'por_cliente', 'cod_cliente', _cod, 'desde', _desde, 'hasta', _hasta));

  RETURN jsonb_build_object('usuarios', v_resultado);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.consultas_por_cliente(integer, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultas_por_cliente(integer, timestamptz, timestamptz) TO authenticated;

-- 3) Limpieza
CREATE OR REPLACE FUNCTION public.purgar_consultas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _dias int;
  _borradas int;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::int, 180) INTO _dias
  FROM public.app_settings WHERE key = 'consultas_retencion_dias';
  _dias := COALESCE(_dias, 180);

  DELETE FROM public.consultas_cliente
  WHERE ocurrido_en < now() - make_interval(days => _dias);

  GET DIAGNOSTICS _borradas = ROW_COUNT;
  RETURN _borradas;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.purgar_consultas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_consultas() TO service_role;
REVOKE EXECUTE ON FUNCTION public.purgar_auditoria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_auditoria() TO service_role;

-- 4) Ajustes
INSERT INTO public.app_settings (key, value, description) VALUES
  ('registro_consultas_activo', 'false', 'Registro de consultas de fichas de cliente (solo investigación de fugas)'),
  ('consultas_retencion_dias', '180', 'Días de conservación del registro de consultas')
ON CONFLICT (key) DO NOTHING;

UPDATE public.app_settings SET value = '365'
WHERE key = 'auditoria_retencion_dias' AND value = '90';