CREATE OR REPLACE FUNCTION public.visita_bloques_guard_comercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Sin sesión (migraciones, tareas de sistema), admin y revisores: sin restricciones.
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) OR public.puede_revisar_visitas(auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.validacion := 'pendiente';
    NEW.nota_revision := NULL;
    NEW.revisado_por := NULL;
    NEW.revisado_en := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.validacion, 'pendiente') IN ('CORRECTO', 'NO CORRECTO') THEN
      IF pg_trigger_depth() > 1 THEN
        RAISE EXCEPTION 'Esta visita tiene motivos validados y no se puede borrar' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'Este motivo ya está revisado y no se puede borrar' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.validacion = 'CORRECTO' THEN
    RAISE EXCEPTION 'Este bloque ya está validado y no se puede cambiar' USING ERRCODE = 'P0001';
  END IF;
  NEW.visita_id := OLD.visita_id;
  NEW.motivo_key := OLD.motivo_key;
  NEW.orden := OLD.orden;
  NEW.validacion := OLD.validacion;
  NEW.nota_revision := OLD.nota_revision;
  NEW.revisado_por := OLD.revisado_por;
  NEW.revisado_en := OLD.revisado_en;
  IF OLD.validacion = 'NO CORRECTO' AND NEW.campos IS DISTINCT FROM OLD.campos THEN
    NEW.validacion := 'pendiente';
    NEW.revisado_por := NULL;
    NEW.revisado_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.visita_bloques_guard_comercial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_visita_bloques_guard_revision ON public.visita_bloques;
COMMENT ON FUNCTION public.visita_bloques_guard_revision() IS 'DEPRECATED: replaced by visita_bloques_guard_comercial (0034)';

CREATE TRIGGER trg_visita_bloques_guard_comercial
BEFORE INSERT OR UPDATE OR DELETE ON public.visita_bloques
FOR EACH ROW EXECUTE FUNCTION public.visita_bloques_guard_comercial();

CREATE OR REPLACE FUNCTION public.completar_bloque(_bloque_id uuid, _campos jsonb, _updated_at text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _b public.visita_bloques%ROWTYPE;
  _dueno uuid;
  _permitidas text[];
  _nuevos jsonb := '{}'::jsonb;
  _meta jsonb;
  _cambiadas text[];
  _etiquetas text;
  _k text;
  _v jsonb;
  _nuevo_updated timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO _b FROM public.visita_bloques WHERE id = _bloque_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT v.user_id INTO _dueno FROM public.visitas v WHERE v.id = _b.visita_id;
  IF _dueno IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  IF _b.validacion = 'CORRECTO' THEN
    RAISE EXCEPTION 'Este bloque ya está validado y no se puede cambiar';
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

  _cambiadas := ARRAY[]::text[];
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

  _meta := COALESCE(_b.campos_meta, '{}'::jsonb);
  FOREACH _k IN ARRAY _cambiadas LOOP
    _meta := _meta || jsonb_build_object(_k, jsonb_build_object('origen', 'comercial', 'editado_en', now()));
  END LOOP;

  UPDATE public.visita_bloques
     SET campos = _b.campos || _nuevos,
         campos_meta = _meta,
         validacion = _b.validacion
   WHERE id = _bloque_id
   RETURNING updated_at INTO _nuevo_updated;

  SELECT string_agg(DISTINCT mc.label, ', ') INTO _etiquetas
    FROM public.motivo_campos mc
   WHERE mc.motivo_key = _b.motivo_key
     AND (mc.campo_key = ANY(_cambiadas) OR mc.campo_key || '_nombre' = ANY(_cambiadas));

  INSERT INTO public.visita_mensajes (visita_id, bloque_id, texto)
  VALUES (_b.visita_id, _bloque_id, 'He completado: ' || COALESCE(_etiquetas, 'datos del bloque'));

  RETURN jsonb_build_object(
    'cambiados', cardinality(_cambiadas),
    'updated_at', _nuevo_updated::text,
    'validacion', (SELECT validacion FROM public.visita_bloques WHERE id = _bloque_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.completar_bloque(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_bloque(uuid, jsonb, text) TO authenticated;