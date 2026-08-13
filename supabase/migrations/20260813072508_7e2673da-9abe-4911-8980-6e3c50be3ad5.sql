CREATE OR REPLACE FUNCTION public.promover_perfil_desde_bloque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fuente text;
  _claves text[];
BEGIN
  -- SECURITY DEFINER es intencionado: la vista v_visita_bloques_campos se creó
  -- con security_invoker = true, por lo que aplicaría las políticas RLS del
  -- usuario que guarda la visita. El trigger necesita leer el bloque completo
  -- (y su visita) sin filtro de RLS para poder promover los hechos de perfil.
  BEGIN
    _fuente := CASE
      WHEN (NEW.campos_meta -> '_origen' ->> 'fuente') = 'texto_externo' THEN 'importacion'
      ELSE 'voz'
    END;

    WITH origen AS (
      SELECT
        c.cod_cliente,
        c.visita_id,
        c.bloque_id,
        c.fecha,
        c.vendedor,
        mc.perfil_atributo_key AS atributo_key,
        c.valor_texto,
        CASE WHEN pa.tipo = 'numero' THEN c.valor_num END AS valor_num,
        c.confianza,
        c.cita
      FROM public.v_visita_bloques_campos c
      JOIN public.motivo_campos mc
        ON mc.motivo_key = c.motivo_key
       AND mc.campo_key = c.campo_key
       AND mc.perfil_atributo_key IS NOT NULL
       AND mc.is_active
      JOIN public.perfil_atributos pa
        ON pa.key = mc.perfil_atributo_key
      WHERE c.bloque_id = NEW.id
        AND c.cod_cliente IS NOT NULL
    ), ins AS (
      INSERT INTO public.cliente_perfil_datos (
        cod_cliente, atributo_key, valor_texto, valor_num,
        visita_id, bloque_id, comercial_nombre, observado_en,
        confianza, cita, fuente, estado
      )
      SELECT
        o.cod_cliente, o.atributo_key, o.valor_texto, o.valor_num,
        o.visita_id, o.bloque_id, o.vendedor, o.fecha,
        o.confianza, o.cita, _fuente, 'sin_confirmar'
      FROM origen o
      ON CONFLICT (bloque_id, atributo_key) DO UPDATE SET
        cod_cliente      = EXCLUDED.cod_cliente,
        valor_texto      = EXCLUDED.valor_texto,
        valor_num        = EXCLUDED.valor_num,
        visita_id        = EXCLUDED.visita_id,
        comercial_nombre = EXCLUDED.comercial_nombre,
        observado_en     = EXCLUDED.observado_en,
        confianza        = EXCLUDED.confianza,
        cita             = EXCLUDED.cita,
        fuente           = EXCLUDED.fuente,
        estado = CASE
          WHEN EXCLUDED.valor_texto IS DISTINCT FROM public.cliente_perfil_datos.valor_texto
            THEN 'sin_confirmar'
          ELSE public.cliente_perfil_datos.estado
        END,
        confirmado_por = CASE
          WHEN EXCLUDED.valor_texto IS DISTINCT FROM public.cliente_perfil_datos.valor_texto
            THEN NULL
          ELSE public.cliente_perfil_datos.confirmado_por
        END,
        confirmado_en = CASE
          WHEN EXCLUDED.valor_texto IS DISTINCT FROM public.cliente_perfil_datos.valor_texto
            THEN NULL
          ELSE public.cliente_perfil_datos.confirmado_en
        END,
        updated_at = now()
      WHERE public.cliente_perfil_datos.fuente <> 'manual'
      RETURNING 1
    )
    SELECT coalesce(array_agg(o.atributo_key), '{}'::text[]) INTO _claves FROM origen o;

    DELETE FROM public.cliente_perfil_datos d
    WHERE d.bloque_id = NEW.id
      AND d.fuente <> 'manual'
      AND NOT (d.atributo_key = ANY (_claves));

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'promover_perfil_desde_bloque: bloque % no promovido (%)', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promover_perfil_desde_bloque ON public.visita_bloques;

CREATE TRIGGER promover_perfil_desde_bloque
AFTER INSERT OR UPDATE OF campos, campos_meta, motivo_key
ON public.visita_bloques
FOR EACH ROW
EXECUTE FUNCTION public.promover_perfil_desde_bloque();

REVOKE ALL ON FUNCTION public.promover_perfil_desde_bloque() FROM PUBLIC, anon, authenticated;