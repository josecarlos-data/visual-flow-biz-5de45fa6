CREATE OR REPLACE FUNCTION public.cliente_top_productos(_cod integer, _anio integer DEFAULT NULL::integer)
RETURNS TABLE(referencia text, descripcion text, familia text, marca text, unidades numeric, importe numeric, margen numeric, ultima_compra date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_margen boolean;
BEGIN
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  v_margen := public.puede_ver_margen(auth.uid());
  RETURN QUERY
  SELECT v.referencia,
         p.descripcion,
         COALESCE(p.familia_nombre, p.familia, v.familia),
         COALESCE(p.marca_nombre, p.marca, v.marca),
         SUM(v.unidades),
         SUM(v.importe),
         CASE WHEN v_margen THEN SUM(v.margen) ELSE 0 END,
         MAX(v.fecha)
  FROM public.ventas_diarias v
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE v.cod_cliente = _cod
    AND (_anio IS NULL OR (v.fecha >= make_date(_anio,1,1) AND v.fecha < make_date(_anio+1,1,1)))
  GROUP BY v.referencia, p.descripcion, COALESCE(p.familia_nombre, p.familia, v.familia), COALESCE(p.marca_nombre, p.marca, v.marca)
  ORDER BY SUM(v.importe) DESC
  LIMIT 500;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cliente_documento_lineas(_cod integer, _id_documento text)
RETURNS TABLE(referencia text, descripcion text, marca text, familia text, unidades numeric, importe numeric, margen numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_margen boolean;
BEGIN
  IF NOT public.can_view_cliente(auth.uid(), _cod) THEN RETURN; END IF;
  v_margen := public.puede_ver_margen(auth.uid());
  RETURN QUERY
  SELECT v.referencia, COALESCE(NULLIF(v.descripcion_linea,''), p.descripcion),
         COALESCE(p.marca_nombre, v.marca), COALESCE(p.familia_nombre, v.familia),
         v.unidades, v.importe,
         CASE WHEN v_margen THEN v.margen ELSE 0 END
  FROM public.ventas_diarias v
  LEFT JOIN public.productos p ON p.referencia = v.referencia
  WHERE v.cod_cliente = _cod AND v.id_documento = _id_documento
  ORDER BY v.linea NULLS LAST
  LIMIT 300;
END; $function$;