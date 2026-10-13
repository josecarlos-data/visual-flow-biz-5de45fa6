-- IP/navegador en auditar_cambio y consulta_actividad; margen de historial; totales del resumen.
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
  v_h jsonb;
  v_ip inet;
  v_ua text;
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
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := coalesce(nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''))::inet;
    v_ua := left(v_h ->> 'user-agent', 500);
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL; v_ua := NULL;
  END;
  BEGIN
    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle, ip, user_agent)
    VALUES (v_uid, v_tipo, 'ok', TG_TABLE_NAME, v_entidad_id, v_detalle, v_ip, v_ua);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

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
  v_clientes_periodo integer;
  v_clientes_base integer;
  v_h jsonb;
  v_ip inet;
  v_ua text;
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
  v_suficiente := v_primera IS NOT NULL AND v_primera <= v_base_desde + interval '2 days';
  v_factor := extract(epoch FROM interval '90 days') / extract(epoch FROM v_len);
  v_dias_periodo := greatest(extract(epoch FROM v_len) / 86400, 1);

  SELECT count(DISTINCT (cod_cliente, date_trunc('day', ocurrido_en)))::numeric / v_dias_periodo INTO v_clientes_dia
  FROM public.consultas_cliente WHERE user_id = _user_id AND ocurrido_en >= _desde AND ocurrido_en < _hasta;
  SELECT count(DISTINCT (cod_cliente, date_trunc('day', ocurrido_en)))::numeric / 90 INTO v_clientes_dia_media
  FROM public.consultas_cliente WHERE user_id = _user_id AND ocurrido_en >= v_base_desde AND ocurrido_en < _desde;

  SELECT count(DISTINCT cod_cliente) INTO v_clientes_periodo
  FROM public.consultas_cliente WHERE user_id = _user_id AND ocurrido_en >= _desde AND ocurrido_en < _hasta;
  SELECT count(DISTINCT cod_cliente) INTO v_clientes_base
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

  BEGIN
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := coalesce(nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''))::inet;
    v_ua := left(v_h ->> 'user-agent', 500);
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL; v_ua := NULL;
  END;
  INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle, ip, user_agent)
  VALUES (v_admin, 'consulta_actividad', 'ok', 'usuario', _user_id::text,
    jsonb_build_object('vista', 'por_usuario', 'desde', _desde, 'hasta', _hasta), v_ip, v_ua);

  RETURN jsonb_build_object(
    'primera_consulta', v_primera,
    'historial_suficiente', v_suficiente,
    'clientes_dia', round(COALESCE(v_clientes_dia, 0), 2),
    'clientes_dia_media', round(COALESCE(v_clientes_dia_media, 0), 2),
    'clientes_periodo', COALESCE(v_clientes_periodo, 0),
    'clientes_base', COALESCE(v_clientes_base, 0),
    'clientes', v_resultado);
END;
$function$;

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
  v_h jsonb;
  v_ip inet;
  v_ua text;
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

  BEGIN
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := coalesce(nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''))::inet;
    v_ua := left(v_h ->> 'user-agent', 500);
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL; v_ua := NULL;
  END;
  INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle, ip, user_agent)
  VALUES (v_admin, 'consulta_actividad', 'ok', 'cliente', _cod::text,
    jsonb_build_object('vista', 'por_cliente', 'cod_cliente', _cod, 'desde', _desde, 'hasta', _hasta), v_ip, v_ua);

  RETURN jsonb_build_object('usuarios', v_resultado);
END;
$function$;
