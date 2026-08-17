CREATE TABLE IF NOT EXISTS public._diag_q(fase text, ms numeric, filas int);
TRUNCATE public._diag_q;

DO $$
DECLARE t0 timestamptz; n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','28f5caa7-bae6-4137-872e-a044a06848b0', true);
  PERFORM set_config('request.jwt.claims','{"sub":"28f5caa7-bae6-4137-872e-a044a06848b0","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.objetivos_seguimiento(2026);
  INSERT INTO public._diag_q VALUES ('antes', extract(epoch from clock_timestamp()-t0)*1000, n);
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.objetivos_seguimiento(2026);
  INSERT INTO public._diag_q VALUES ('antes_2', extract(epoch from clock_timestamp()-t0)*1000, n);
  RESET ROLE;
END $$;

-- snapshot de valores previos para comparar
CREATE TABLE IF NOT EXISTS public._diag_qd AS
SELECT d::date AS f, public.quincena_de(d::date) AS q
FROM generate_series('2026-01-01'::date,'2026-12-31'::date,'1 day') d;

CREATE OR REPLACE FUNCTION public.quincena_de(_f date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT (EXTRACT(MONTH FROM _f)::int - 1) * 2 + CASE WHEN EXTRACT(DAY FROM _f)::int <= 15 THEN 1 ELSE 2 END;
$function$;

DO $$
DECLARE t0 timestamptz; n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','28f5caa7-bae6-4137-872e-a044a06848b0', true);
  PERFORM set_config('request.jwt.claims','{"sub":"28f5caa7-bae6-4137-872e-a044a06848b0","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.objetivos_seguimiento(2026);
  INSERT INTO public._diag_q VALUES ('despues', extract(epoch from clock_timestamp()-t0)*1000, n);
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.objetivos_seguimiento(2026);
  INSERT INTO public._diag_q VALUES ('despues_2', extract(epoch from clock_timestamp()-t0)*1000, n);
  RESET ROLE;
END $$;