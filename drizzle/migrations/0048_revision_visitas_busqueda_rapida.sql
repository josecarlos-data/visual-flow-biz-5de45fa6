-- 0048 Revisión de visitas: búsqueda y filtro de jefe sin coste por fila.
-- Mismos resultados que 0046; las listas de ids se cruzan por subconsulta (hash), no elemento a elemento.

-- Ids de visitas cuyos bloques visibles cumplen las condiciones (independientes entre sí).
-- Solo ids, nunca contenido. Misma regla de visibilidad que puede_ver_bloque, evaluada una vez.
CREATE OR REPLACE FUNCTION public.revision_visitas_filtro_bloques(_motivo text DEFAULT NULL, _dudas boolean DEFAULT false)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  u uuid := auth.uid();
  _todo boolean;
  _jefe boolean;
  _cods int[];
BEGIN
  IF NOT public.puede_revisar_visitas(u) THEN RETURN; END IF;
  _todo := public.is_admin(u) OR public.has_role(u, 'director_comercial'::app_role);
  _jefe := public.has_role(u, 'jefe_de_zona'::app_role);
  IF NOT _todo AND _jefe THEN
    _cods := ARRAY(SELECT cp.cod_cliente FROM public.clientes_permitidos(u) cp(cod_cliente));
  END IF;
  RETURN QUERY
  SELECT b.visita_id
  FROM public.visita_bloques b
  JOIN public.visitas v ON v.id = b.visita_id
  WHERE _todo
     OR v.user_id = u
     OR (_jefe AND v.cod_cliente IN (SELECT unnest(_cods)))
  GROUP BY b.visita_id
  HAVING (_motivo IS NULL OR bool_or(b.motivo_key = _motivo))
     AND (NOT coalesce(_dudas, false) OR bool_or(EXISTS (
           SELECT 1 FROM jsonb_each(COALESCE(b.campos_meta, '{}'::jsonb)) e
           WHERE e.key <> '_origen' AND jsonb_typeof(e.value) = 'object'
             AND lower(trim(e.value->>'confianza')) IN ('baja', 'media'))));
END $function$;
REVOKE ALL ON FUNCTION public.revision_visitas_filtro_bloques(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revision_visitas_filtro_bloques(text, boolean) TO authenticated;

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
  _con_motivo uuid[]; _con_bloques uuid[]; _con_dudas uuid[];
  _cods int[]; _mkeys text[]; _coms text[]; _sin_motivo boolean; _exts text[];
BEGIN
  IF NOT public.puede_revisar_visitas(auth.uid()) THEN
    RETURN jsonb_build_object('filas', '[]'::jsonb, 'total', 0, 'pendientes', 0, 'pagina', 1, 'siguiente_id', NULL);
  END IF;

  IF _motivo IS NOT NULL THEN
    _con_motivo := ARRAY(SELECT public.revision_visitas_filtro_bloques(_motivo, false));
    _con_bloques := ARRAY(SELECT public.revision_visitas_filtro_bloques(NULL, false));
  END IF;
  IF coalesce(_dudas, false) THEN
    _con_dudas := ARRAY(SELECT public.revision_visitas_filtro_bloques(NULL, true));
  END IF;
  IF _term IS NOT NULL THEN
    _cods := ARRAY(SELECT c.cod_cliente FROM public.clientes c WHERE public.normalizar_texto(c.cliente) LIKE '%' || _term || '%');
    _mkeys := ARRAY(SELECT m.key FROM public.motivos_visita m WHERE public.normalizar_texto(m.nombre) LIKE '%' || _term || '%');
    _coms := ARRAY(SELECT x.n FROM (SELECT DISTINCT v.comercial_nombre n FROM public.visitas v WHERE v.comercial_nombre IS NOT NULL) x
                   WHERE public.normalizar_texto(x.n) LIKE '%' || _term || '%');
    _sin_motivo := public.normalizar_texto('Sin motivo') LIKE '%' || _term || '%';
    _exts := ARRAY(SELECT x.n FROM (SELECT DISTINCT v.cliente_externo n FROM public.visitas v WHERE v.cliente_externo IS NOT NULL) x
                   WHERE public.normalizar_texto(x.n) LIKE '%' || _term || '%');
    _mkeys := _mkeys || ARRAY(SELECT x.k FROM (SELECT DISTINCT v.motivo_key k FROM public.visitas v WHERE v.motivo_key IS NOT NULL) x
                   WHERE NOT EXISTS (SELECT 1 FROM public.motivos_visita m WHERE m.key = x.k)
                     AND public.normalizar_texto(x.k) LIKE '%' || _term || '%');
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
           OR v.id IN (SELECT unnest(_con_motivo))
           OR (v.motivo_key = _motivo AND v.id NOT IN (SELECT unnest(_con_bloques))))
      AND (NOT coalesce(_dudas, false) OR v.id IN (SELECT unnest(_con_dudas)))
      AND (NOT coalesce(_respuestas, false) OR v.id IN (SELECT public.revision_respuestas_nuevas_ids()))
      AND (_term IS NULL
           OR c.cod_cliente IN (SELECT unnest(_cods))
           OR (c.cod_cliente IS NULL AND v.cliente_externo IN (SELECT unnest(_exts)))
           OR v.comercial_nombre IN (SELECT unnest(_coms))
           OR v.motivo_key IN (SELECT unnest(_mkeys))
           OR (v.motivo_key IS NULL AND _sin_motivo))
  ) x;

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