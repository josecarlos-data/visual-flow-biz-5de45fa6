# Corrección de esquema: `cliente_perfil_datos` antes de la fase 2

Modo Build. Solo migración SQL. No se tocan componentes, páginas ni edge functions.

## Correcciones a aplicar

1. Eliminar la vista dependiente primero, sin `CASCADE`:
   - `DROP VIEW IF EXISTS public.v_cliente_perfil_vigente;`
   - Si otra cosa dependiera de la vista, la migración fallará en lugar de borrar en silencio.

2. Modificar `public.cliente_perfil_datos`:
   - `ALTER COLUMN confianza TYPE text` (la tabla está vacía, no hay conversión de datos).
   - `ADD COLUMN IF NOT EXISTS cita text`.

3. Añadir CHECK obligatorio sobre `confianza`:
   - `ADD CONSTRAINT cliente_perfil_datos_confianza_check`
   - `CHECK (confianza IS NULL OR confianza IN ('alta','media','baja'))`.

4. Recrear la vista de valor vigente:
   - `CREATE VIEW public.v_cliente_perfil_vigente`
   - `WITH (security_invoker = true) AS`
   - `SELECT DISTINCT ON (cod_cliente, atributo_key) *`
   - `FROM public.cliente_perfil_datos`
   - `WHERE estado <> 'descartado'`
   - `ORDER BY cod_cliente, atributo_key, observado_en DESC, created_at DESC;`
   - Reaplicar `GRANT SELECT` para `authenticated` y `service_role`.

5. Triggers de `updated_at`:
   - Comprobar primero en `pg_trigger` si ya existen en `cliente_perfil_datos` y `perfil_atributos`.
   - Si existen, no hacer nada.
   - Si faltan, crearlos con `DROP TRIGGER IF EXISTS ...` antes para idempotencia.

No se inserta ningún dato. No se toca ninguna otra tabla ni vista.