DROP TABLE IF EXISTS public._diag_q;
DROP TABLE IF EXISTS public._diag_qd;
DROP TABLE IF EXISTS public._diag_qv;
COMMENT ON FUNCTION public.quincena_de(date) IS 'Quincena (1-24) de una fecha. SIN SET search_path a proposito: es IMMUTABLE, LANGUAGE sql y su cuerpo solo usa EXTRACT sobre el parametro (no referencia tablas ni funciones), por lo que no hay riesgo de search_path hijacking y el planificador puede inlinearla (critico para el rendimiento de objetivos_seguimiento).';