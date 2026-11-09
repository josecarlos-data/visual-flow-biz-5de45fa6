-- 1) Delegación de un comercial: la de su perfil si tiene usuario; si no, la de la mayoría de sus clientes.
CREATE OR REPLACE FUNCTION public.delegacion_vendedor(_vendedor text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(p.delegacion), '') FROM public.profiles p
      WHERE p.employee_code = _vendedor AND p.estado <> 'baja'
      ORDER BY p.created_at LIMIT 1),
    (SELECT c.delegacion FROM public.clientes c
      WHERE c.vendedor = _vendedor AND COALESCE(btrim(c.delegacion), '') <> ''
      GROUP BY c.delegacion ORDER BY COUNT(*) DESC, c.delegacion LIMIT 1)
  )
$$;
REVOKE ALL ON FUNCTION public.delegacion_vendedor(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delegacion_vendedor(text) TO service_role;

CREATE OR REPLACE FUNCTION public.puede_ver_asignacion_objetivo(_user_id uuid, _vendedor text, _asig_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_approved(_user_id) AND (
    public.puede_gestionar_objetivos(_user_id)
    OR _asig_user = _user_id
    OR (COALESCE(public.get_user_employee_code(_user_id), '') <> '' AND _vendedor = public.get_user_employee_code(_user_id))
    OR (public.has_role(_user_id, 'jefe_de_zona')
        AND COALESCE(public.get_user_delegacion(_user_id), '') <> ''
        AND public.delegacion_vendedor(_vendedor) = public.get_user_delegacion(_user_id))
  )
$$;

-- 2) Auditoría: la foto de cartera no se anota cliente a cliente.
DROP TRIGGER IF EXISTS auditar_objetivo_clientes ON public.objetivo_clientes;
CREATE TRIGGER auditar_objetivo_clientes_iu AFTER INSERT OR UPDATE ON public.objetivo_clientes
  FOR EACH ROW WHEN (NEW.origen IS DISTINCT FROM 'foto_cartera') EXECUTE FUNCTION public.auditar_cambio();
CREATE TRIGGER auditar_objetivo_clientes_d AFTER DELETE ON public.objetivo_clientes
  FOR EACH ROW WHEN (OLD.origen IS DISTINCT FROM 'foto_cartera') EXECUTE FUNCTION public.auditar_cambio();

CREATE OR REPLACE FUNCTION public.objetivo_tomar_foto(_objetivo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  INSERT INTO public.objetivo_clientes (objetivo_id, asignacion_id, cod_cliente, origen, titular_vendedor)
  SELECT oa.objetivo_id, oa.id, c.cod_cliente, 'foto_cartera', c.vendedor
  FROM public.objetivo_asignaciones oa
  JOIN public.objetivos_v2 o ON o.id = oa.objetivo_id AND o.tipo = 'cartera' AND o.atribucion = 'foto_cartera'
  JOIN public.clientes c ON c.vendedor = oa.vendedor
  WHERE oa.objetivo_id = _objetivo_id
    AND NOT EXISTS (SELECT 1 FROM public.objetivo_clientes x WHERE x.asignacion_id = oa.id AND x.origen = 'foto_cartera')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 AND auth.uid() IS NOT NULL THEN
    BEGIN
      INSERT INTO public.auditoria_eventos (user_id, tipo, resultado, entidad, entidad_id, detalle)
      VALUES (auth.uid(), 'dato_alta', 'ok', 'objetivo_clientes', _objetivo_id::text,
              jsonb_build_object('resumen', 'foto de ' || v_n || ' clientes', 'clientes', v_n, 'origen', 'foto_cartera'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.objetivo_tomar_foto(uuid) FROM PUBLIC, anon, authenticated;