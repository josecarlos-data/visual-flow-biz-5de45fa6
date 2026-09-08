-- =====================  TABLAS  =====================
CREATE TABLE public.dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispositivo_id text NOT NULL,
  nombre text NULL,
  user_agent text NULL,
  bloqueado boolean NOT NULL DEFAULT false,
  primera_vez timestamptz NOT NULL DEFAULT now(),
  ultima_vez timestamptz NOT NULL DEFAULT now(),
  ip_alta inet NULL,
  UNIQUE (user_id, dispositivo_id)
);
CREATE INDEX idx_dispositivos_user_ultima ON public.dispositivos (user_id, ultima_vez DESC);

REVOKE ALL ON public.dispositivos FROM authenticated, anon;
GRANT SELECT ON public.dispositivos TO authenticated;
GRANT ALL ON public.dispositivos TO service_role;
ALTER TABLE public.dispositivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver dispositivos propios o admin" ON public.dispositivos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TABLE public.sesiones_activas (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sesion_id text NOT NULL,
  dispositivo_id text NULL,
  iniciada_en timestamptz NOT NULL DEFAULT now(),
  ultima_actividad timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sesion_id)
);
CREATE INDEX idx_sesiones_user_actividad ON public.sesiones_activas (user_id, ultima_actividad);

REVOKE ALL ON public.sesiones_activas FROM authenticated, anon;
GRANT SELECT ON public.sesiones_activas TO authenticated;
GRANT ALL ON public.sesiones_activas TO service_role;
ALTER TABLE public.sesiones_activas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver sesiones propias o admin" ON public.sesiones_activas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TABLE public.codigos_alta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_por uuid NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  usos int NOT NULL DEFAULT 0,
  ultimo_uso_en timestamptz NULL,
  dispositivo_id text NULL
);
CREATE INDEX idx_codigos_alta_user ON public.codigos_alta (user_id, creado_en DESC);

REVOKE ALL ON public.codigos_alta FROM authenticated, anon;
GRANT ALL ON public.codigos_alta TO service_role;
ALTER TABLE public.codigos_alta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo admin consulta codigos" ON public.codigos_alta
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- =====================  PROFILES  =====================
ALTER TABLE public.profiles
  ADD COLUMN sesiones_max int NOT NULL DEFAULT 1,
  ADD COLUMN dispositivos_max int NOT NULL DEFAULT 2;

CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN RAISE EXCEPTION 'Cannot modify is_approved'; END IF;
  IF NEW.ver_margen IS DISTINCT FROM OLD.ver_margen THEN RAISE EXCEPTION 'Cannot modify ver_margen'; END IF;
  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN RAISE EXCEPTION 'Cannot modify employee_code'; END IF;
  IF NEW.delegacion IS DISTINCT FROM OLD.delegacion THEN RAISE EXCEPTION 'Cannot modify delegacion'; END IF;
  IF NEW.zone_id IS DISTINCT FROM OLD.zone_id THEN RAISE EXCEPTION 'Cannot modify zone_id'; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Cannot modify user_id'; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'Cannot modify email'; END IF;
  IF NEW.sesiones_max IS DISTINCT FROM OLD.sesiones_max THEN RAISE EXCEPTION 'Cannot modify sesiones_max'; END IF;
  IF NEW.dispositivos_max IS DISTINCT FROM OLD.dispositivos_max THEN RAISE EXCEPTION 'Cannot modify dispositivos_max'; END IF;
  RETURN NEW;
END;
$function$;

-- =====================  AJUSTES  =====================
INSERT INTO public.app_settings (key, value, description) VALUES
  ('control_acceso_modo', 'observacion', 'Modo de control de acceso: observacion | bloqueo'),
  ('control_dispositivos_activo', 'true', 'Activa el control de dispositivos y sesiones'),
  ('alta_dispositivo_modo', 'auto', 'Alta de dispositivo: auto | codigo')
ON CONFLICT (key) DO NOTHING;

-- =====================  FUNCIONES  =====================
CREATE OR REPLACE FUNCTION public.registrar_sesion(
  _dispositivo_id text,
  _sesion_id text,
  _user_agent text DEFAULT NULL,
  _codigo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_modo text;
  v_activo text;
  v_alta_modo text;
  v_disp public.dispositivos%ROWTYPE;
  v_disp_max int;
  v_ses_max int;
  v_num_disp int;
  v_motivo text := NULL;
  v_denegar boolean := false;
  v_permitido boolean := true;
  v_codigo public.codigos_alta%ROWTYPE;
  v_alta_ok boolean := false;
BEGIN
  IF v_uid IS NULL OR _dispositivo_id IS NULL OR _sesion_id IS NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', NULL, 'modo', 'observacion');
  END IF;

  SELECT value INTO v_modo FROM public.app_settings WHERE key = 'control_acceso_modo';
  SELECT value INTO v_activo FROM public.app_settings WHERE key = 'control_dispositivos_activo';
  SELECT value INTO v_alta_modo FROM public.app_settings WHERE key = 'alta_dispositivo_modo';
  v_modo := COALESCE(v_modo, 'observacion');
  v_activo := COALESCE(v_activo, 'true');
  v_alta_modo := COALESCE(v_alta_modo, 'auto');

  SELECT COALESCE(dispositivos_max, 2), COALESCE(sesiones_max, 1)
    INTO v_disp_max, v_ses_max
    FROM public.profiles WHERE user_id = v_uid;
  v_disp_max := COALESCE(v_disp_max, 2);
  v_ses_max := COALESCE(v_ses_max, 1);

  SELECT * INTO v_disp FROM public.dispositivos
    WHERE user_id = v_uid AND dispositivo_id = _dispositivo_id;

  IF FOUND THEN
    UPDATE public.dispositivos
      SET ultima_vez = now(), user_agent = COALESCE(_user_agent, user_agent)
      WHERE id = v_disp.id;
    IF v_disp.bloqueado THEN
      v_motivo := 'dispositivo_bloqueado';
      v_denegar := true;
    END IF;
  ELSE
    SELECT count(*) INTO v_num_disp FROM public.dispositivos WHERE user_id = v_uid;

    IF v_num_disp >= v_disp_max THEN
      v_motivo := 'dispositivo_no_autorizado';
      v_denegar := true;
    ELSIF v_alta_modo = 'codigo' THEN
      IF _codigo IS NULL OR btrim(_codigo) = '' THEN
        v_motivo := 'codigo_requerido';
        v_denegar := true;
      ELSE
        SELECT * INTO v_codigo FROM public.codigos_alta
          WHERE codigo = upper(btrim(_codigo))
            AND user_id = v_uid
            AND expira_en > now();
        IF FOUND THEN
          v_alta_ok := true;
          v_motivo := 'dispositivo_nuevo';
          UPDATE public.codigos_alta
            SET usos = usos + 1, ultimo_uso_en = now(), dispositivo_id = _dispositivo_id
            WHERE id = v_codigo.id;
        ELSE
          v_motivo := 'codigo_invalido';
          v_denegar := true;
        END IF;
      END IF;
    ELSE
      v_alta_ok := true;
      v_motivo := 'dispositivo_nuevo';
    END IF;

    -- En observacion o para admin, el alta se hace igualmente salvo que se supere el maximo
    IF NOT v_alta_ok
       AND v_motivo IN ('codigo_requerido', 'codigo_invalido')
       AND (v_modo <> 'bloqueo' OR v_activo <> 'true' OR public.is_admin(v_uid)) THEN
      v_alta_ok := true;
    END IF;

    IF v_alta_ok THEN
      INSERT INTO public.dispositivos (user_id, dispositivo_id, user_agent)
        VALUES (v_uid, _dispositivo_id, _user_agent)
        ON CONFLICT (user_id, dispositivo_id) DO UPDATE
          SET ultima_vez = now(), user_agent = COALESCE(EXCLUDED.user_agent, public.dispositivos.user_agent);
    END IF;
  END IF;

  v_permitido := true;
  IF v_denegar AND v_modo = 'bloqueo' AND v_activo = 'true' AND NOT public.is_admin(v_uid) THEN
    v_permitido := false;
  END IF;

  IF v_permitido THEN
    DELETE FROM public.sesiones_activas
      WHERE user_id = v_uid AND ultima_actividad < now() - interval '12 hours';

    INSERT INTO public.sesiones_activas (user_id, sesion_id, dispositivo_id)
      VALUES (v_uid, _sesion_id, _dispositivo_id)
      ON CONFLICT (user_id, sesion_id) DO UPDATE
        SET ultima_actividad = now(), dispositivo_id = EXCLUDED.dispositivo_id;

    IF v_ses_max > 0 THEN
      DELETE FROM public.sesiones_activas s
        WHERE s.user_id = v_uid
          AND s.sesion_id IN (
            SELECT sesion_id FROM public.sesiones_activas
              WHERE user_id = v_uid
              ORDER BY ultima_actividad DESC
              OFFSET v_ses_max
          );
    END IF;
  END IF;

  RETURN jsonb_build_object('permitido', v_permitido, 'motivo', v_motivo, 'modo', v_modo);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_sesion(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.verificar_sesion(_sesion_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ultima timestamptz;
BEGIN
  IF v_uid IS NULL OR _sesion_id IS NULL THEN
    RETURN jsonb_build_object('vigente', true);
  END IF;

  SELECT ultima_actividad INTO v_ultima FROM public.sesiones_activas
    WHERE user_id = v_uid AND sesion_id = _sesion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('vigente', false);
  END IF;

  IF v_ultima < now() - interval '5 minutes' THEN
    UPDATE public.sesiones_activas SET ultima_actividad = now()
      WHERE user_id = v_uid AND sesion_id = _sesion_id;
  END IF;

  RETURN jsonb_build_object('vigente', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verificar_sesion(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispositivos_usuario(_user_id uuid)
RETURNS TABLE (
  id uuid,
  dispositivo_id text,
  nombre text,
  user_agent text,
  bloqueado boolean,
  primera_vez timestamptz,
  ultima_vez timestamptz,
  sesiones_abiertas bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT d.id, d.dispositivo_id, d.nombre, d.user_agent, d.bloqueado,
           d.primera_vez, d.ultima_vez,
           (SELECT count(*) FROM public.sesiones_activas s
              WHERE s.user_id = d.user_id AND s.dispositivo_id = d.dispositivo_id)
      FROM public.dispositivos d
      WHERE d.user_id = _user_id
      ORDER BY d.ultima_vez DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dispositivos_usuario(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_gestionar_dispositivo(_id uuid, _accion text, _nombre text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_disp text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT user_id, dispositivo_id INTO v_uid, v_disp FROM public.dispositivos WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispositivo no encontrado';
  END IF;

  IF _accion = 'bloquear' THEN
    UPDATE public.dispositivos SET bloqueado = true WHERE id = _id;
    DELETE FROM public.sesiones_activas WHERE user_id = v_uid AND dispositivo_id = v_disp;
  ELSIF _accion = 'desbloquear' THEN
    UPDATE public.dispositivos SET bloqueado = false WHERE id = _id;
  ELSIF _accion = 'renombrar' THEN
    UPDATE public.dispositivos SET nombre = NULLIF(btrim(COALESCE(_nombre, '')), '') WHERE id = _id;
  ELSIF _accion = 'eliminar' THEN
    DELETE FROM public.sesiones_activas WHERE user_id = v_uid AND dispositivo_id = v_disp;
    DELETE FROM public.dispositivos WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'Accion no valida';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_gestionar_dispositivo(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_generar_codigo(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_i int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.codigos_alta SET expira_en = now()
    WHERE user_id = _user_id AND expira_en > now();

  LOOP
    v_codigo := '';
    FOR v_i IN 1..8 LOOP
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.codigos_alta WHERE codigo = v_codigo);
  END LOOP;

  INSERT INTO public.codigos_alta (codigo, user_id, creado_por)
    VALUES (v_codigo, _user_id, auth.uid());

  RETURN v_codigo;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_generar_codigo(uuid) TO authenticated;