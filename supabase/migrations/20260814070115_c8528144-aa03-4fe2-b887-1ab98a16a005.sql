-- Comprobaciones de acceso a bloques de visita.
-- SECURITY DEFINER intencionado: la lectura interna de public.visitas no debe
-- reaplicar la RLS de visitas (que arrastra clientes y get_user_* fila a fila).
-- Al recibir el id como parametro, el EXISTS se resuelve por visitas_pkey y el
-- planificador ya no puede convertir la qual en un "hashed SubPlan" sobre visitas.
-- La condicion evaluada es identica a la que contenian las politicas.

CREATE OR REPLACE FUNCTION public.puede_ver_bloque(_visita_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.visitas v
    WHERE v.id = _visita_id
      AND (
        public.is_admin(auth.uid())
        OR public.has_role(auth.uid(), 'director_comercial'::app_role)
        OR v.user_id = auth.uid()
        OR (
          public.has_role(auth.uid(), 'jefe_de_zona'::app_role)
          AND v.cod_cliente IN (
            SELECT cp.cod_cliente FROM public.clientes_permitidos(auth.uid()) cp(cod_cliente)
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.puede_editar_bloque(_visita_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.visitas v
    WHERE v.id = _visita_id
      AND (
        v.user_id = auth.uid()
        OR public.is_admin(auth.uid())
        OR public.puede_revisar_visitas(auth.uid())
      )
  )
$$;

REVOKE ALL ON FUNCTION public.puede_ver_bloque(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_editar_bloque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_bloque(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_editar_bloque(uuid) TO authenticated;

-- Politicas reescritas (misma semantica)
DROP POLICY IF EXISTS "ver bloques de visitas visibles" ON public.visita_bloques;
CREATE POLICY "ver bloques de visitas visibles"
ON public.visita_bloques
FOR SELECT
TO authenticated
USING (public.puede_ver_bloque(visita_id));

DROP POLICY IF EXISTS "crear bloques en visitas propias" ON public.visita_bloques;
CREATE POLICY "crear bloques en visitas propias"
ON public.visita_bloques
FOR INSERT
TO authenticated
WITH CHECK (public.puede_editar_bloque(visita_id));

DROP POLICY IF EXISTS "editar bloques propios o revisables" ON public.visita_bloques;
CREATE POLICY "editar bloques propios o revisables"
ON public.visita_bloques
FOR UPDATE
TO authenticated
USING (public.puede_editar_bloque(visita_id))
WITH CHECK (public.puede_editar_bloque(visita_id));

DROP POLICY IF EXISTS "borrar bloques propios o admin" ON public.visita_bloques;
CREATE POLICY "borrar bloques propios o admin"
ON public.visita_bloques
FOR DELETE
TO authenticated
USING (public.puede_editar_bloque(visita_id));

-- Temporal, solo para medir el plan bajo rol authenticated.
GRANT authenticated TO sandbox_exec;