CREATE OR REPLACE FUNCTION public.auditar_cambio_ajustes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_campos text[] := ARRAY[]::text[];
  v_detalle jsonb;
  v_tipo text;
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_tipo := 'dato_alta';
  ELSIF TG_OP = 'UPDATE' THEN v_tipo := 'dato_cambio';
  ELSE v_tipo := 'dato_baja';
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

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

  v_detalle := jsonb_build_object('campos', to_jsonb(v_campos),
    'origen', CASE WHEN v_uid IS NULL THEN 'sistema' ELSE 'usuario' END);
  IF v_old IS NOT NULL THEN v_detalle := v_detalle || jsonb_build_object('antes', v_old -> 'value'); END IF;
  IF v_new IS NOT NULL THEN v_detalle := v_detalle || jsonb_build_object('despues', v_new -> 'value'); END IF;

  BEGIN
    INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle)
    VALUES (v_uid, v_tipo, 'ok', 'app_settings', COALESCE(v_new ->> 'key', v_old ->> 'key'), v_detalle);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auditar_cambio_ajustes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auditar_app_settings ON public.app_settings;
CREATE TRIGGER auditar_app_settings
AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_ajustes();