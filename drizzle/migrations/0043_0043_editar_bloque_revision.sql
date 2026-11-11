-- Corrección de datos de un bloque por el revisor, con control de versión.
CREATE OR REPLACE FUNCTION public.editar_bloque_revision(_bloque_id uuid, _campos jsonb, _updated_at text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.visita_bloques%ROWTYPE;
  _permitidas text[];
  _nuevos jsonb := '{}'::jsonb;
  _meta jsonb;
  _cambiadas text[] := ARRAY[]::text[];
  _k text;
  _v jsonb;
  _final jsonb;
  _completo boolean;
  _nuevo_updated timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.puede_revisar_visitas(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO _b FROM public.visita_bloques WHERE id = _bloque_id FOR UPDATE;
  IF NOT FOUND OR NOT public.puede_editar_bloque(_b.visita_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF _updated_at IS NULL OR _b.updated_at <> _updated_at::timestamptz THEN
    RAISE EXCEPTION 'Este bloque ha cambiado mientras lo editabas. Vuelve a abrirlo.';
  END IF;

  SELECT array_agg(k) INTO _permitidas FROM (
    SELECT mc.campo_key AS k FROM public.motivo_campos mc
     WHERE mc.motivo_key = _b.motivo_key AND mc.is_active
    UNION
    SELECT mc.campo_key || '_nombre' FROM public.motivo_campos mc
     WHERE mc.motivo_key = _b.motivo_key AND mc.is_active AND mc.tipo = 'adjunto'
  ) s;

  FOR _k, _v IN SELECT key, value FROM jsonb_each(COALESCE(_campos, '{}'::jsonb)) LOOP
    IF _k = ANY(COALESCE(_permitidas, ARRAY[]::text[]))
       AND (_b.campos -> _k) IS DISTINCT FROM _v
       AND NOT ((_b.campos -> _k) IS NULL AND _v = '""'::jsonb) THEN
      _nuevos := _nuevos || jsonb_build_object(_k, _v);
      _cambiadas := _cambiadas || _k;
    END IF;
  END LOOP;

  IF cardinality(_cambiadas) = 0 THEN
    RETURN jsonb_build_object('cambiados', 0, 'updated_at', _b.updated_at::text, 'validacion', _b.validacion);
  END IF;

  _final := COALESCE(_b.campos, '{}'::jsonb) || _nuevos;
  _meta := COALESCE(_b.campos_meta, '{}'::jsonb);
  FOREACH _k IN ARRAY _cambiadas LOOP
    _meta := _meta || jsonb_build_object(_k, jsonb_build_object('origen', 'revisor', 'editado_por', auth.uid(), 'editado_en', now()));
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.motivo_campos mc
     WHERE mc.motivo_key = _b.motivo_key AND mc.is_active AND mc.is_required
       AND COALESCE(NULLIF(btrim(_final ->> mc.campo_key), ''), NULLIF(_final -> mc.campo_key, '[]'::jsonb)::text) IS NULL
  ) INTO _completo;

  UPDATE public.visita_bloques
     SET campos = _final,
         campos_meta = _meta,
         completo = _completo
   WHERE id = _bloque_id
   RETURNING updated_at INTO _nuevo_updated;

  RETURN jsonb_build_object(
    'cambiados', cardinality(_cambiadas),
    'updated_at', _nuevo_updated::text,
    'validacion', _b.validacion
  );
END;
$$;

REVOKE ALL ON FUNCTION public.editar_bloque_revision(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_bloque_revision(uuid, jsonb, text) TO authenticated;

-- Auditoría de cambios de campos en bloques: valor antes -> después.
-- No se registra lo que hace un admin sobre visitas que no son de la app (importaciones por tandas).
CREATE OR REPLACE FUNCTION public.auditar_campos_bloque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origen text;
  v_cod integer;
  v_cambios jsonb := '{}'::jsonb;
  k text;
  v_h jsonb;
  v_ip inet;
  v_ua text;
BEGIN
  BEGIN
    IF v_uid IS NULL OR NEW.campos IS NOT DISTINCT FROM OLD.campos THEN
      RETURN NEW;
    END IF;

    SELECT v.origen, v.cod_cliente INTO v_origen, v_cod FROM public.visitas v WHERE v.id = NEW.visita_id;
    IF public.is_admin(v_uid) AND v_origen IS DISTINCT FROM 'app' THEN
      RETURN NEW;
    END IF;

    FOR k IN SELECT key FROM jsonb_object_keys(COALESCE(OLD.campos, '{}'::jsonb) || COALESCE(NEW.campos, '{}'::jsonb)) AS t(key) LOOP
      IF (OLD.campos -> k) IS DISTINCT FROM (NEW.campos -> k) THEN
        v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_object('antes', OLD.campos -> k, 'despues', NEW.campos -> k));
      END IF;
    END LOOP;

    BEGIN
      v_h := nullif(current_setting('request.headers', true), '')::jsonb;
      v_ip := coalesce(nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
                       nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''))::inet;
      v_ua := left(v_h ->> 'user-agent', 500);
    EXCEPTION WHEN OTHERS THEN
      v_ip := NULL; v_ua := NULL;
    END;

    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle, ip, user_agent)
    VALUES (v_uid, 'dato_cambio', 'ok', 'visita_bloques', NEW.id::text,
      jsonb_build_object(
        'campos', (SELECT to_jsonb(array_agg(x)) FROM jsonb_object_keys(v_cambios) x),
        'cod_cliente', v_cod,
        'motivo', NEW.motivo_key,
        'visita_id', NEW.visita_id,
        'origen_visita', v_origen,
        'bloque', v_cambios
      ), v_ip, v_ua);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auditar_campos_bloque: bloque % sin auditar (%)', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_campos_bloque() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_visita_bloques_auditar_campos
AFTER UPDATE OF campos ON public.visita_bloques
FOR EACH ROW EXECUTE FUNCTION public.auditar_campos_bloque();