-- 0046 Revisión de visitas: lista paginada en servidor.

-- 1) Cabecera al borrar el último bloque: solo visitas de la app vuelven a pendiente.
CREATE OR REPLACE FUNCTION public.recalcular_validacion_visita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _visita uuid := COALESCE(NEW.visita_id, OLD.visita_id);
  _estado text;
BEGIN
  SELECT CASE
           WHEN count(*) = 0 THEN NULL
           WHEN bool_or(COALESCE(b.validacion,'pendiente') = 'pendiente') THEN 'pendiente'
           WHEN bool_or(b.validacion = 'NO CORRECTO') THEN 'NO CORRECTO'
           ELSE 'CORRECTO'
         END
    INTO _estado
  FROM public.visita_bloques b
  WHERE b.visita_id = _visita;

  IF _estado IS NOT NULL THEN
    UPDATE public.visitas v
       SET validacion = _estado
     WHERE v.id = _visita AND v.validacion IS DISTINCT FROM _estado;
  ELSE
    UPDATE public.visitas v
       SET validacion = 'pendiente'
     WHERE v.id = _visita AND v.origen = 'app'
       AND v.validacion IS DISTINCT FROM 'pendiente';
  END IF;

  RETURN NULL;
END;
$function$;

-- 2) Ids con respuesta nueva: misma regla que revision_respuestas_nuevas, sin tope.
CREATE OR REPLACE FUNCTION public.revision_respuestas_nuevas_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE u uuid := auth.uid();
BEGIN
  IF NOT public.puede_revisar_visitas(u) THEN RETURN; END IF;
  RETURN QUERY
  SELECT DISTINCT m.visita_id
  FROM public.visita_mensajes m
  JOIN public.visitas v ON v.id = m.visita_id
  LEFT JOIN public.visita_lecturas l ON l.visita_id = v.id AND l.user_id = u
  WHERE m.autor_id IS NOT NULL AND m.autor_id = v.user_id AND v.user_id <> u
    AND m.created_at > coalesce(l.leido_en, '-infinity'::timestamptz)
    AND public.puede_ver_bloque(v.id);
END $function$;
REVOKE ALL ON FUNCTION public.revision_respuestas_nuevas_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revision_respuestas_nuevas_ids() TO authenticated;

-- 3) Lista paginada. INVOKER: manda la RLS de visitas, clientes y bloques.
CREATE OR REPLACE FUNCTION public.visitas_revision_lista(
  _origen text DEFAULT 'app',
  _estado text DEFAULT 'pendiente',
  _q text DEFAULT NULL,
  _motivo text DEFAULT NULL,
  _comercial text DEFAULT NULL,
  _dudas boolean DEFAULT false,
  _respuestas boolean DEFAULT false,
  _desde date DEFAULT NULL,
  _hasta date DEFAULT NULL,
  _pagina integer DEFAULT 1,
  _por_pagina integer DEFAULT 50,
  _tras_fecha date DEFAULT NULL,
  _tras_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pp int := least(greatest(coalesce(_por_pagina, 50), 1), 100);
  _pag int := greatest(coalesce(_pagina, 1), 1);
  _term text := nullif(public.normalizar_texto(trim(coalesce(_q, ''))), '');
  _total int; _pend int; _sig uuid; _filas jsonb;
  _ids uuid[]; _fechas date[];
BEGIN
  IF NOT public.puede_revisar_visitas(auth.uid()) THEN
    RETURN jsonb_build_object('filas', '[]'::jsonb, 'total', 0, 'pendientes', 0, 'pagina', 1, 'siguiente_id', NULL);
  END IF;

  SELECT COALESCE(array_agg(x.id ORDER BY x.fecha DESC, x.id DESC), '{}'),
         COALESCE(array_agg(x.fecha ORDER BY x.fecha DESC, x.id DESC), '{}'),
         count(*), count(*) FILTER (WHERE COALESCE(x.validacion, 'pendiente') = 'pendiente')
    INTO _ids, _fechas, _total, _pend
  FROM (
    SELECT v.id, v.fecha, v.validacion
    FROM public.visitas v
    LEFT JOIN public.clientes c ON c.cod_cliente = v.cod_cliente
    WHERE (_origen = 'todas' OR v.origen = _origen)
      AND (coalesce(_estado, 'todas') = 'todas' OR COALESCE(v.validacion, 'pendiente') = _estado)
      AND (_desde IS NULL OR v.fecha >= _desde)
      AND (_hasta IS NULL OR v.fecha <= _hasta)
      AND (_comercial IS NULL OR v.comercial_nombre = _comercial)
      AND (_motivo IS NULL
           OR EXISTS (SELECT 1 FROM public.visita_bloques b WHERE b.visita_id = v.id AND b.motivo_key = _motivo)
           OR (v.motivo_key = _motivo AND NOT EXISTS (SELECT 1 FROM public.visita_bloques b WHERE b.visita_id = v.id)))
      AND (NOT coalesce(_dudas, false) OR EXISTS (
            SELECT 1 FROM public.visita_bloques b, jsonb_each(COALESCE(b.campos_meta, '{}'::jsonb)) e
            WHERE b.visita_id = v.id AND e.key <> '_origen' AND jsonb_typeof(e.value) = 'object'
              AND lower(trim(e.value->>'confianza')) IN ('baja', 'media')))
      AND (NOT coalesce(_respuestas, false) OR v.id IN (SELECT public.revision_respuestas_nuevas_ids()))
      AND (_term IS NULL
           OR public.normalizar_texto(COALESCE(c.cliente, v.cliente_externo, '')) LIKE '%' || _term || '%'
           OR public.normalizar_texto(v.comercial_nombre) LIKE '%' || _term || '%'
           OR public.normalizar_texto(COALESCE((SELECT m.nombre FROM public.motivos_visita m WHERE m.key = v.motivo_key), v.motivo_key, 'Sin motivo')) LIKE '%' || _term || '%')
  ) x;

  -- Cursor: primera visita posterior a la indicada en el mismo orden (fecha desc, id desc) y su página.
  IF _tras_fecha IS NOT NULL AND _tras_id IS NOT NULL THEN
    FOR i IN 1 .. coalesce(array_length(_ids, 1), 0) LOOP
      IF (_fechas[i], _ids[i]) < (_tras_fecha, _tras_id) THEN
        _sig := _ids[i]; _pag := ((i - 1) / _pp) + 1; EXIT;
      END IF;
    END LOOP;
  END IF;

  _pag := least(_pag, greatest(((_total - 1) / _pp) + 1, 1));

  SELECT COALESCE(jsonb_agg(to_jsonb(v) || jsonb_build_object(
           'cliente_nombre', COALESCE(c.cliente, v.cliente_externo),
           'motivos', (SELECT COALESCE(jsonb_agg(b.motivo_key ORDER BY b.orden), '[]'::jsonb)
                         FROM public.visita_bloques b WHERE b.visita_id = v.id))
         ORDER BY p.n), '[]'::jsonb)
    INTO _filas
  FROM unnest(_ids[(_pag - 1) * _pp + 1 : _pag * _pp]) WITH ORDINALITY AS p(id, n)
  JOIN public.visitas v ON v.id = p.id
  LEFT JOIN public.clientes c ON c.cod_cliente = v.cod_cliente;

  RETURN jsonb_build_object('filas', _filas, 'total', _total, 'pendientes', _pend,
                            'pagina', _pag, 'por_pagina', _pp, 'siguiente_id', _sig);
END $function$;
REVOKE ALL ON FUNCTION public.visitas_revision_lista(text, text, text, text, text, boolean, boolean, date, date, integer, integer, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitas_revision_lista(text, text, text, text, text, boolean, boolean, date, date, integer, integer, date, uuid) TO authenticated;

-- 4) Comerciales para el desplegable.
CREATE OR REPLACE FUNCTION public.visitas_revision_comerciales(_origen text DEFAULT 'app')
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT v.comercial_nombre
  FROM public.visitas v
  WHERE public.puede_revisar_visitas(auth.uid())
    AND v.comercial_nombre IS NOT NULL
    AND (_origen = 'todas' OR v.origen = _origen)
  ORDER BY 1
$function$;
REVOKE ALL ON FUNCTION public.visitas_revision_comerciales(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitas_revision_comerciales(text) TO authenticated;