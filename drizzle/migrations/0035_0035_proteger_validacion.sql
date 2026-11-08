CREATE OR REPLACE FUNCTION public.puede_editar_bloque(_visita_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.visitas v
    WHERE v.id = _visita_id
      AND (
        v.user_id = auth.uid()
        OR public.is_admin(auth.uid())
        OR (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), 'director_comercial'::app_role))
        OR (public.puede_revisar_visitas(auth.uid()) AND public.puede_ver_bloque(_visita_id))
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.visita_bloques_guard_comercial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean;
  _dueno uuid;
BEGIN
  -- Sin sesión (migraciones, tareas de sistema): sin restricciones.
  IF _uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _admin := public.is_admin(_uid);

  IF _admin OR public.puede_revisar_visitas(_uid) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    SELECT v.user_id INTO _dueno FROM public.visitas v WHERE v.id = NEW.visita_id;

    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.validacion, 'pendiente') = 'pendiente' THEN
        NEW.validacion := 'pendiente';
        NEW.revisado_por := NULL;
        NEW.revisado_en := NULL;
      ELSE
        IF NOT _admin AND _dueno = _uid THEN
          RAISE EXCEPTION 'No puedes validar tus propias visitas' USING ERRCODE = 'P0001';
        END IF;
        NEW.revisado_por := _uid;
        NEW.revisado_en := now();
      END IF;
      RETURN NEW;
    END IF;

    -- UPDATE por revisor/admin: la firma la pone el servidor
    IF NEW.validacion IS DISTINCT FROM OLD.validacion
       OR NEW.nota_revision IS DISTINCT FROM OLD.nota_revision THEN
      IF NEW.validacion = 'pendiente' THEN
        NEW.revisado_por := NULL;
        NEW.revisado_en := NULL;
      ELSE
        IF NOT _admin AND _dueno = _uid AND NEW.validacion IS DISTINCT FROM OLD.validacion THEN
          RAISE EXCEPTION 'No puedes validar tus propias visitas' USING ERRCODE = 'P0001';
        END IF;
        NEW.revisado_por := _uid;
        NEW.revisado_en := now();
      END IF;
    ELSE
      NEW.revisado_por := OLD.revisado_por;
      NEW.revisado_en := OLD.revisado_en;
    END IF;
    RETURN NEW;
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

  -- UPDATE por comercial
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
$function$;

CREATE OR REPLACE FUNCTION public.visitas_guard_validacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean;
  _director boolean;
  _revisor boolean;
  _validada boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Derivación desde los bloques (recalcular_validacion_visita): solo limpia la firma al volver a pendiente.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'UPDATE' AND COALESCE(NEW.validacion, 'pendiente') = 'pendiente'
       AND NEW.validacion IS DISTINCT FROM OLD.validacion THEN
      NEW.revisado_por := NULL;
      NEW.revisado_en := NULL;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  _admin := public.is_admin(_uid);
  _director := public.is_approved(_uid) AND public.has_role(_uid, 'director_comercial'::app_role);
  _revisor := _admin OR _director OR public.puede_revisar_visitas(_uid);

  IF _revisor THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.validacion, 'pendiente') = 'pendiente' THEN
        NEW.revisado_por := NULL;
        NEW.revisado_en := NULL;
      ELSE
        IF NOT _admin AND NEW.user_id = _uid THEN
          RAISE EXCEPTION 'No puedes validar tus propias visitas' USING ERRCODE = 'P0001';
        END IF;
        NEW.revisado_por := _uid;
        NEW.revisado_en := now();
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.validacion IS DISTINCT FROM OLD.validacion
       OR NEW.nota_revision IS DISTINCT FROM OLD.nota_revision THEN
      IF NOT _admin AND NOT _director AND NOT public.puede_ver_bloque(OLD.id) THEN
        RAISE EXCEPTION 'No puedes revisar visitas de otra delegación' USING ERRCODE = 'P0001';
      END IF;
      IF COALESCE(NEW.validacion, 'pendiente') = 'pendiente' THEN
        NEW.revisado_por := NULL;
        NEW.revisado_en := NULL;
      ELSE
        IF NOT _admin AND OLD.user_id = _uid AND NEW.validacion IS DISTINCT FROM OLD.validacion THEN
          RAISE EXCEPTION 'No puedes validar tus propias visitas' USING ERRCODE = 'P0001';
        END IF;
        NEW.revisado_por := _uid;
        NEW.revisado_en := now();
      END IF;
    ELSE
      NEW.revisado_por := OLD.revisado_por;
      NEW.revisado_en := OLD.revisado_en;
    END IF;
    RETURN NEW;
  END IF;

  -- Comercial y resto de roles
  IF TG_OP = 'INSERT' THEN
    NEW.validacion := 'pendiente';
    NEW.nota_revision := NULL;
    NEW.revisado_por := NULL;
    NEW.revisado_en := NULL;
    RETURN NEW;
  END IF;

  _validada := COALESCE(OLD.validacion, 'pendiente') IN ('CORRECTO', 'NO CORRECTO')
    OR EXISTS (SELECT 1 FROM public.visita_bloques b
               WHERE b.visita_id = OLD.id AND b.validacion IN ('CORRECTO', 'NO CORRECTO'));

  IF TG_OP = 'DELETE' THEN
    IF _validada THEN
      RAISE EXCEPTION 'Esta visita está validada y no se puede borrar' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.validacion IS DISTINCT FROM OLD.validacion
     OR NEW.nota_revision IS DISTINCT FROM OLD.nota_revision
     OR NEW.revisado_por IS DISTINCT FROM OLD.revisado_por
     OR NEW.revisado_en IS DISTINCT FROM OLD.revisado_en THEN
    RAISE EXCEPTION 'La validación solo la puede cambiar un revisor' USING ERRCODE = 'P0001';
  END IF;

  IF _validada AND (
       NEW.fecha IS DISTINCT FROM OLD.fecha
    OR NEW.cod_cliente IS DISTINCT FROM OLD.cod_cliente
    OR NEW.cliente_externo IS DISTINCT FROM OLD.cliente_externo
    OR NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.resultado_visita IS DISTINCT FROM OLD.resultado_visita
    OR NEW.motivo_key IS DISTINCT FROM OLD.motivo_key
    OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Esta visita ya está revisada y no se puede cambiar' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.visitas_guard_validacion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_visitas_guard_validacion
BEFORE INSERT OR UPDATE OR DELETE ON public.visitas
FOR EACH ROW EXECUTE FUNCTION public.visitas_guard_validacion();