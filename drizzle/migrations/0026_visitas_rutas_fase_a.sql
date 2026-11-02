ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS latitud_propuesta numeric, ADD COLUMN IF NOT EXISTS longitud_propuesta numeric, ADD COLUMN IF NOT EXISTS coords_propuestas_visitas integer;

UPDATE public.clientes c SET latitud_propuesta = x.lat, longitud_propuesta = x.lon, coords_propuestas_visitas = x.n
FROM (
  SELECT cod_cliente, avg(latitud) lat, avg(longitud) lon, count(*)::int n
  FROM public.visitas WHERE cod_cliente IS NOT NULL AND latitud IS NOT NULL AND longitud IS NOT NULL
  GROUP BY cod_cliente
  HAVING count(*) >= 2
     AND (max(latitud)-min(latitud)) * 111000 <= 600
     AND (max(longitud)-min(longitud)) * 111000 * cos(radians(avg(latitud))) <= 600
) x
WHERE c.cod_cliente = x.cod_cliente AND c.latitud IS NULL;

CREATE OR REPLACE FUNCTION public.aceptar_coordenadas_propuestas(_cods integer[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.clientes SET latitud = latitud_propuesta, longitud = longitud_propuesta,
    latitud_propuesta = NULL, longitud_propuesta = NULL, coords_propuestas_visitas = NULL
  WHERE cod_cliente = ANY(_cods) AND latitud_propuesta IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.aceptar_coordenadas_propuestas(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_coordenadas_propuestas(integer[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.cerrar_planificada_con_visita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cod_cliente IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    UPDATE public.visitas_planificadas SET estado = 'realizada', visita_id = NEW.id, updated_at = now()
    WHERE user_id = NEW.user_id AND cod_cliente = NEW.cod_cliente AND fecha = NEW.fecha
      AND estado = 'pendiente' AND visita_id IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cerrar_planificada_con_visita() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER visitas_cierra_planificada AFTER INSERT ON public.visitas
FOR EACH ROW EXECUTE FUNCTION public.cerrar_planificada_con_visita();

CREATE OR REPLACE FUNCTION public.visitas_revision_datos()
RETURNS TABLE(id uuid, fecha date, comercial text, cliente_externo text, titulo text, problema text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT v.id, v.fecha, coalesce(v.comercial_nombre, v.vendedor), v.cliente_externo, v.titulo,
    CASE WHEN v.fecha > current_date THEN 'fecha_futura' ELSE 'sin_cliente' END
  FROM public.visitas v
  WHERE (v.fecha > current_date OR (v.cod_cliente IS NULL AND v.tipo <> 'interna'))
  ORDER BY v.fecha DESC LIMIT 1000;
END $$;
REVOKE ALL ON FUNCTION public.visitas_revision_datos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitas_revision_datos() TO authenticated;