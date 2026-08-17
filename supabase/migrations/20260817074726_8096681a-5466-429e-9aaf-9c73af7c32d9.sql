CREATE TABLE IF NOT EXISTS public._diag_qv(k text, v text);
TRUNCATE public._diag_qv;
INSERT INTO public._diag_qv
SELECT 'dias', count(*)::text FROM public._diag_qd;
INSERT INTO public._diag_qv
SELECT 'diferencias', count(*)::text FROM public._diag_qd d WHERE d.q <> public.quincena_de(d.f);
INSERT INTO public._diag_qv
SELECT 'muestra', string_agg(f::text||'->'||public.quincena_de(f)::text, ' | ' ORDER BY f)
FROM unnest(ARRAY['2026-01-01','2026-01-15','2026-01-16','2026-02-15','2026-02-16','2026-02-28','2026-03-01','2026-06-30','2026-07-01','2026-12-15','2026-12-16','2026-12-31']::date[]) f;
INSERT INTO public._diag_qv
SELECT 'plan', string_agg(l, E'\n')
FROM (
  SELECT (jsonb_array_elements_text(to_jsonb(x))) AS l FROM (
    SELECT 1
  ) x LIMIT 0
) z;
DO $$
DECLARE r text; acc text := '';
BEGIN
  FOR r IN EXECUTE 'EXPLAIN (COSTS OFF) SELECT public.quincena_de(v.fecha), sum(v.importe) FROM public.ventas_diarias v WHERE v.fecha >= ''2025-01-01'' AND v.fecha < ''2027-01-01'' GROUP BY 1'
  LOOP acc := acc || r || E'\n'; END LOOP;
  UPDATE public._diag_qv SET v = acc WHERE k='plan';
END $$;