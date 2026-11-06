CREATE OR REPLACE FUNCTION public.recalcular_validacion_visita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _visita uuid := COALESCE(NEW.visita_id, OLD.visita_id);
  _estado text;
BEGIN
  SELECT CASE
           WHEN count(*) = 0 THEN NULL
           WHEN bool_or(COALESCE(b.validacion,'pendiente') = 'pendiente') THEN 'pendiente'
           WHEN bool_or(b.validacion = 'NO CORRECTO') THEN 'NO CORRECTO'
           ELSE 'CORRECTO'
         END
    INTO _estado
  FROM public.visita_bloques b
  WHERE b.visita_id = _visita;

  IF _estado IS NOT NULL THEN
    UPDATE public.visitas v
       SET validacion = _estado
     WHERE v.id = _visita AND v.validacion IS DISTINCT FROM _estado;
  END IF;

  RETURN NULL;
END;
$function$;

-- Reajuste. Se excluye por indicación expresa la visita de Revisión de seguimiento de CALEROTRUCKS del 06/11.
UPDATE public.visitas v
   SET validacion = c.estado
  FROM (
    SELECT b.visita_id,
           CASE WHEN bool_or(COALESCE(b.validacion,'pendiente') = 'pendiente') THEN 'pendiente'
                WHEN bool_or(b.validacion = 'NO CORRECTO') THEN 'NO CORRECTO'
                ELSE 'CORRECTO' END AS estado
      FROM public.visita_bloques b
     GROUP BY b.visita_id
  ) c
 WHERE c.visita_id = v.id
   AND v.validacion IS DISTINCT FROM c.estado
   AND v.id <> '970ae290-140b-458c-bfb2-92bca8c1ec75';

CREATE OR REPLACE FUNCTION public.visitas_rellenar_comercial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.comercial_nombre IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT p.full_name INTO NEW.comercial_nombre
      FROM public.profiles p WHERE p.user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.visitas_rellenar_comercial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS visitas_rellenar_comercial ON public.visitas;
CREATE TRIGGER visitas_rellenar_comercial
  BEFORE INSERT ON public.visitas
  FOR EACH ROW EXECUTE FUNCTION public.visitas_rellenar_comercial();

UPDATE public.visitas v
   SET comercial_nombre = p.full_name
  FROM public.profiles p
 WHERE p.user_id = v.user_id
   AND v.origen = 'app'
   AND v.comercial_nombre IS NULL
   AND p.full_name IS NOT NULL;