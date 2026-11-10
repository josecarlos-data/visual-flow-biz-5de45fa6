-- Análisis de observaciones de Gespromo: copia exacta de la lógica de repartir_observaciones_gespromo,
-- como función pura (no escribe nada). repartir_observaciones_gespromo no se toca.
CREATE OR REPLACE FUNCTION public.gespromo_partir_observaciones(_texto text, OUT veredicto text, OUT nota text, OUT obs text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $fn$
DECLARE
  lineas text[]; toks text[]; raw1 text; tk text; ntk text; cand text;
  consumidas int := 0; resto1 text; l1 text; letras text; mays text;
  i int := 1; j int; nl int;
BEGIN
  veredicto := 'pendiente'; nota := NULL; obs := NULL;
  IF _texto IS NULL OR btrim(_texto) = '' THEN RETURN; END IF;

  lineas := regexp_split_to_array(replace(_texto, E'\r', ''), E'\n');
  nl := coalesce(array_length(lineas, 1), 0);
  raw1 := btrim(coalesce(lineas[1], ''));
  toks := (SELECT array_agg(t) FROM unnest(regexp_split_to_array(raw1, '\s+')) AS t WHERE t <> '');

  IF coalesce(array_length(toks, 1), 0) > 0 THEN
    ntk := upper(regexp_replace(translate(toks[1],
             'áéíóúàèìòùÁÉÍÓÚÀÈÌÒÙñÑüÜçÇ', 'aeiouaeiouAEIOUAEIOUnNuUcC'), '[^A-Za-z]', '', 'g'));
    IF ntk IN ('NO', 'N') AND array_length(toks, 1) >= 2 THEN
      cand := upper(regexp_replace(translate(toks[2],
                'áéíóúàèìòùÁÉÍÓÚÀÈÌÒÙñÑüÜçÇ', 'aeiouaeiouAEIOUAEIOUnNuUcC'), '[^A-Za-z]', '', 'g'));
      IF cand = 'ES' AND array_length(toks, 1) >= 3 THEN
        cand := upper(regexp_replace(translate(toks[3],
                  'áéíóúàèìòùÁÉÍÓÚÀÈÌÒÙñÑüÜçÇ', 'aeiouaeiouAEIOUAEIOUnNuUcC'), '[^A-Za-z]', '', 'g'));
        IF extensions.levenshtein(cand, 'CORRECTO') <= 3 THEN veredicto := 'NO CORRECTO'; consumidas := 3; END IF;
      ELSIF extensions.levenshtein(cand, 'CORRECTO') <= 3 THEN
        veredicto := 'NO CORRECTO'; consumidas := 2;
      END IF;
    END IF;
    IF consumidas = 0 AND left(ntk, 1) = 'N' AND extensions.levenshtein(ntk, 'NOCORRECTO') <= 3 THEN
      veredicto := 'NO CORRECTO'; consumidas := 1;
    ELSIF consumidas = 0 AND left(ntk, 1) = 'C' AND extensions.levenshtein(ntk, 'CORRECTO') <= 2 THEN
      veredicto := 'CORRECTO'; consumidas := 1;
    END IF;
  END IF;

  IF consumidas > 0 THEN
    j := consumidas + 1;
    WHILE j <= coalesce(array_length(toks, 1), 0) LOOP
      tk := toks[j];
      EXIT WHEN tk <> upper(tk);
      EXIT WHEN tk !~ '[[:alpha:]]' AND nota IS NULL;
      nota := btrim(coalesce(nota || ' ', '') || tk);
      j := j + 1;
    END LOOP;
    resto1 := btrim(array_to_string(toks[j:coalesce(array_length(toks, 1), 0)], ' '));
    IF resto1 = '' THEN resto1 := NULL; END IF;
    i := 2;
    IF resto1 IS NULL THEN
      WHILE i <= nl LOOP
        l1 := btrim(coalesce(lineas[i], ''));
        IF l1 = '' THEN
          EXIT WHEN nota IS NULL;
          i := i + 1;
          CONTINUE;
        END IF;
        letras := regexp_replace(l1, '[^[:alpha:]]', '', 'g');
        mays   := regexp_replace(l1, '[^[:upper:]]', '', 'g');
        EXIT WHEN length(letras) < 8;
        EXIT WHEN length(mays) < 0.9 * length(letras);
        nota := btrim(coalesce(nota || ' ', '') || l1);
        i := i + 1;
      END LOOP;
    END IF;
  END IF;

  obs := btrim(concat_ws(E'\n', nullif(resto1, ''),
           nullif(btrim(array_to_string(lineas[greatest(i, 2):nl], E'\n')), '')));
  IF consumidas = 0 THEN obs := btrim(array_to_string(lineas[1:nl], E'\n')); END IF;
  IF obs = '' THEN obs := NULL; END IF;
  IF nota = '' THEN nota := NULL; END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.gespromo_partir_observaciones(text) FROM PUBLIC, anon, authenticated;

-- Cambia el tipo de respuesta (integer -> jsonb): hay que recrearla. Mismos argumentos.
DROP FUNCTION public.importar_visitas_historicas(jsonb, boolean);

CREATE FUNCTION public.importar_visitas_historicas(_rows jsonb, _reset boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5min'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _sub text := current_setting('request.jwt.claim.sub', true);
  _claims text := current_setting('request.jwt.claims', true);
  _filas int; _nuevas int := 0; _estado int := 0; _obs int := 0; _ignoradas int := 0; _sin int := 0;
BEGIN
  IF NOT (public.is_approved(_uid) AND public.is_admin(_uid)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _reset THEN RAISE EXCEPTION 'El borrado de visitas de Gespromo está desactivado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('importar_visitas_historicas'));

  -- Identidad vacía durante las escrituras: los guardianes no firman las validaciones importadas.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  CREATE TEMP TABLE _tanda ON COMMIT DROP AS
  WITH parsed AS (
    SELECT
      NULLIF(r->>'cod_cliente','')::int AS cod_cliente,
      NULLIF(r->>'cliente_externo','') AS cliente_externo,
      NULLIF(r->>'motivo_key','') AS motivo_key,
      (r->>'fecha')::date AS fecha,
      NULLIF(r->>'hora','')::time AS hora,
      NULLIF(r->>'tipo','') AS tipo,
      NULLIF(r->>'estado','') AS estado,
      NULLIF(btrim(r->>'observaciones'),'') AS texto,
      NULLIF(r->>'comercial','') AS comercial,
      NULLIF(r->>'comercial_nombre','') AS comercial_nombre,
      NULLIF(r->>'ruta','') AS ruta,
      NULLIF(r->>'zona','') AS zona,
      NULLIF(r->>'titulo','') AS titulo,
      NULLIF(r->>'latitud','')::numeric AS latitud,
      NULLIF(r->>'longitud','')::numeric AS longitud
    FROM jsonb_array_elements(_rows) r
    WHERE NULLIF(r->>'fecha','') IS NOT NULL
  )
  SELECT DISTINCT ON (COALESCE(cod_cliente,-1), fecha, COALESCE(hora,'00:00'::time), COALESCE(comercial_nombre,''))
    p.*, COALESCE(p.estado,'realizada') AS estado_final,
    (public.gespromo_partir_observaciones(p.texto)).*,
    NULL::uuid AS visita_id
  FROM parsed p
  ORDER BY COALESCE(cod_cliente,-1), fecha, COALESCE(hora,'00:00'::time), COALESCE(comercial_nombre,''), length(COALESCE(texto,'')) DESC;
  GET DIAGNOSTICS _filas = ROW_COUNT;

  -- Emparejar con lo ya importado por la clave del índice único visitas_dedupe_idx.
  UPDATE _tanda t SET visita_id = v.id
  FROM public.visitas v
  WHERE v.origen = 'gespromo'
    AND COALESCE(v.cod_cliente,-1) = COALESCE(t.cod_cliente,-1)
    AND v.fecha = t.fecha
    AND COALESCE(v.hora,'00:00'::time) = COALESCE(t.hora,'00:00'::time)
    AND COALESCE(v.comercial_nombre,'') = COALESCE(t.comercial_nombre,'');

  -- 1) Nuevas: cabecera pendiente + un bloque con su veredicto + nota como mensaje.
  CREATE TEMP TABLE _nuevas ON COMMIT DROP AS SELECT * FROM _tanda WHERE visita_id IS NULL;
  UPDATE _nuevas SET visita_id = gen_random_uuid();

  INSERT INTO public.visitas (id, cod_cliente, cliente_externo, motivo_key, fecha, hora, tipo, estado,
    validacion, observaciones, observaciones_original, observaciones_repartidas, vendedor, comercial_nombre,
    ruta, zona, titulo, latitud, longitud, campos, origen)
  SELECT visita_id, cod_cliente, cliente_externo, motivo_key, fecha, hora, COALESCE(tipo,'cliente'), estado_final,
    'pendiente', obs, texto, true, comercial, comercial_nombre,
    ruta, zona, titulo, latitud, longitud, '{}'::jsonb, 'gespromo'
  FROM _nuevas
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS _nuevas = ROW_COUNT;

  INSERT INTO public.visita_bloques (visita_id, motivo_key, validacion, orden)
  SELECT n.visita_id, n.motivo_key, n.veredicto, 0
  FROM _nuevas n WHERE EXISTS (SELECT 1 FROM public.visitas v WHERE v.id = n.visita_id);

  INSERT INTO public.visita_mensajes (visita_id, bloque_id, autor_id, autor_nombre, texto, created_at)
  SELECT b.visita_id, b.id, NULL, 'Gespromo (importado)', n.nota, n.fecha::timestamptz
  FROM _nuevas n JOIN public.visita_bloques b ON b.visita_id = n.visita_id
  WHERE n.nota IS NOT NULL;

  -- 2) Existentes: el estado se actualiza siempre que cambie.
  UPDATE public.visitas v SET estado = t.estado_final
  FROM _tanda t
  WHERE t.visita_id = v.id AND v.estado IS DISTINCT FROM t.estado_final;
  GET DIAGNOSTICS _estado = ROW_COUNT;

  -- 3) Existentes con observaciones cambiadas: solo si todos sus bloques siguen pendientes,
  --    sin revisor, y no hay mensajes escritos desde la app.
  CREATE TEMP TABLE _obs ON COMMIT DROP AS
  SELECT t.visita_id, t.texto, t.veredicto, t.nota, t.obs, t.fecha,
    (NOT EXISTS (SELECT 1 FROM public.visita_bloques b WHERE b.visita_id = t.visita_id
                  AND (COALESCE(b.validacion,'pendiente') <> 'pendiente' OR b.revisado_por IS NOT NULL))
     AND NOT EXISTS (SELECT 1 FROM public.visita_mensajes m WHERE m.visita_id = t.visita_id AND m.autor_id IS NOT NULL)
     AND v.revisado_por IS NULL) AS aplicable
  FROM _tanda t JOIN public.visitas v ON v.id = t.visita_id
  WHERE t.visita_id IS NOT NULL
    AND t.visita_id NOT IN (SELECT visita_id FROM _nuevas)
    AND COALESCE(v.observaciones_original, v.observaciones) IS DISTINCT FROM t.texto;

  UPDATE public.visitas v SET observaciones = o.obs, observaciones_original = o.texto, observaciones_repartidas = true
  FROM _obs o WHERE o.aplicable AND v.id = o.visita_id;
  GET DIAGNOSTICS _obs = ROW_COUNT;

  UPDATE public.visita_bloques b SET validacion = o.veredicto
  FROM _obs o WHERE o.aplicable AND b.visita_id = o.visita_id AND b.validacion IS DISTINCT FROM o.veredicto;

  INSERT INTO public.visita_mensajes (visita_id, bloque_id, autor_id, autor_nombre, texto, created_at)
  SELECT o.visita_id, (SELECT b.id FROM public.visita_bloques b WHERE b.visita_id = o.visita_id ORDER BY b.orden, b.created_at LIMIT 1),
         NULL, 'Gespromo (importado)', o.nota, o.fecha::timestamptz
  FROM _obs o
  WHERE o.aplicable AND o.nota IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.visita_mensajes m WHERE m.visita_id = o.visita_id
                    AND m.autor_nombre = 'Gespromo (importado)' AND m.texto = o.nota);

  SELECT count(*) FILTER (WHERE NOT aplicable) INTO _ignoradas FROM _obs;
  SELECT count(*) INTO _sin FROM _tanda t JOIN public.visitas v ON v.id = t.visita_id
  WHERE t.visita_id NOT IN (SELECT visita_id FROM _nuevas)
    AND v.estado IS NOT DISTINCT FROM t.estado_final
    AND t.visita_id NOT IN (SELECT visita_id FROM _obs);

  -- Identidad restaurada: el evento de la tanda queda a nombre de quien importa.
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(_claims, ''), true);

  INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, detalle)
  VALUES (_uid, 'importar_visitas_gespromo', 'ok', 'visitas',
    jsonb_build_object('filas', _filas, 'nuevas', _nuevas, 'estado_actualizado', _estado,
      'observaciones_actualizadas', _obs, 'observaciones_ignoradas', _ignoradas));

  RETURN jsonb_build_object('filas', _filas, 'nuevas', _nuevas, 'estado_actualizado', _estado,
    'observaciones_actualizadas', _obs, 'observaciones_ignoradas', _ignoradas, 'sin_cambios', _sin);
END;
$fn$;

REVOKE ALL ON FUNCTION public.importar_visitas_historicas(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_visitas_historicas(jsonb, boolean) TO authenticated, service_role;