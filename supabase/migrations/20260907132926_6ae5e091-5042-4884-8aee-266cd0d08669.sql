CREATE TABLE public.auditoria_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NULL,
  tipo text NOT NULL,
  resultado text NOT NULL CHECK (resultado IN ('ok','denegado','fallo')),
  entidad text NULL,
  entidad_id text NULL,
  ruta text NULL,
  detalle jsonb NULL,
  ip inet NULL,
  user_agent text NULL,
  dispositivo_id text NULL
);

CREATE INDEX idx_auditoria_ocurrido_en ON public.auditoria_eventos (ocurrido_en DESC);
CREATE INDEX idx_auditoria_user_ocurrido ON public.auditoria_eventos (user_id, ocurrido_en DESC);
CREATE INDEX idx_auditoria_tipo_ocurrido ON public.auditoria_eventos (tipo, ocurrido_en DESC);

REVOKE ALL ON public.auditoria_eventos FROM authenticated, anon;
GRANT SELECT ON public.auditoria_eventos TO authenticated;
GRANT ALL ON public.auditoria_eventos TO service_role;

ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pueden consultar la auditoria"
ON public.auditoria_eventos
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.auditoria_listado(
  _desde timestamptz DEFAULT NULL,
  _hasta timestamptz DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _tipo text DEFAULT NULL,
  _resultado text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  ocurrido_en timestamptz,
  user_id uuid,
  email text,
  tipo text,
  resultado text,
  entidad text,
  entidad_id text,
  ruta text,
  detalle jsonb,
  ip text,
  user_agent text,
  dispositivo_id text,
  full_name text,
  total_filas bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtrado AS (
    SELECT a.*
    FROM public.auditoria_eventos a
    WHERE (_desde IS NULL OR a.ocurrido_en >= _desde)
      AND (_hasta IS NULL OR a.ocurrido_en <= _hasta)
      AND (_user_id IS NULL OR a.user_id = _user_id)
      AND (_tipo IS NULL OR a.tipo = _tipo)
      AND (_resultado IS NULL OR a.resultado = _resultado)
  ), total AS (
    SELECT count(*)::bigint AS n FROM filtrado
  )
  SELECT f.id, f.ocurrido_en, f.user_id, f.email, f.tipo, f.resultado,
         f.entidad, f.entidad_id, f.ruta, f.detalle, host(f.ip)::text,
         f.user_agent, f.dispositivo_id, p.full_name, t.n
  FROM filtrado f
  CROSS JOIN total t
  LEFT JOIN public.profiles p ON p.user_id = f.user_id
  ORDER BY f.ocurrido_en DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 0)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.auditoria_listado(timestamptz, timestamptz, uuid, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auditoria_listado(timestamptz, timestamptz, uuid, text, text, int, int) TO authenticated;

INSERT INTO public.app_settings (key, value, description)
VALUES ('auditoria_retencion_dias', '90', 'Dias de retencion del registro de auditoria de seguridad')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purgar_auditoria()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dias int;
  _borradas int;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::int, 90) INTO _dias
  FROM public.app_settings WHERE key = 'auditoria_retencion_dias';
  _dias := COALESCE(_dias, 90);

  DELETE FROM public.auditoria_eventos
  WHERE ocurrido_en < now() - make_interval(days => _dias);

  GET DIAGNOSTICS _borradas = ROW_COUNT;
  RETURN _borradas;
END;
$$;

REVOKE ALL ON FUNCTION public.purgar_auditoria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_auditoria() TO service_role;