# Director comercial gestiona plantillas de visita (sin borrar)

## Estado comprobado
- Las tres tablas tienen una política `ALL` "Admins manage…" y una de `SELECT` para aprobados (ambas PERMISSIVE).
- `/admin/visitas` es `adminOnly` (App.tsx:269); `/admin/objetivos` usa `adminOnly allowedRoles={["director_comercial"]}`.
- `auditar_cambio()` toma `entidad_id` de `id` (o `key` solo en app_settings). En `motivos_visita` (sin `id`) el evento se registra igual, pero con `entidad_id` vacío: se sabe qué cambió (campos y tabla), no qué plantilla. No falla. Como no se puede modificar la función, lo dejo así; si queréis la clave de la plantilla en Auditoría, sería un cambio aparte en la función. Además, la función ignora cambios sin usuario (correcto aquí, todo pasa por la app).

## Cambios
1. Migración nueva en `drizzle/migrations/` (vía la herramienta de migraciones):
   - DROP de "Admins manage motivos/motivo_campos/catalogos".
   - Por tabla, tres políticas PERMISSIVE para `authenticated`:
     - INSERT (WITH CHECK) y UPDATE (USING + WITH CHECK): `(SELECT public.is_approved(auth.uid())) AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'director_comercial'::app_role))`
     - DELETE: `(SELECT public.is_approved(auth.uid())) AND public.is_admin(auth.uid())`
   - Políticas de SELECT intactas; sin cambios de GRANT ni estructura.
   - Triggers `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio()` en las tres tablas (`DROP TRIGGER IF EXISTS` previo).
2. `App.tsx`: `/admin/visitas` con `adminOnly allowedRoles={["director_comercial"]}`, igual que objetivos. Sin filas en dashboards.
3. `AppSidebar.tsx`: "Plantillas de visita" añadido a los ítems de `esDireccion`.
4. `AdminVisitas.tsx`:
   - `<RevisionDatosVisitas />` solo si admin.
   - "Eliminar plantilla" y "Eliminar" de campo solo para admin, cada uno con AlertDialog: «Los datos ya registrados con este campo/plantilla se quedarán sin etiqueta. Para retirarlo sin perder información, usa "En uso" / "Disponible para los comerciales".»
   - Revisar que la etiqueta de entidad nueva salga traducida en Auditoría (solo texto en `AdminAuditoria.tsx` si hace falta).

## Prueba
- Sesión de un usuario director_comercial de prueba (pediré cuál si hay varios): menú visible, crear plantilla, añadir/editar campo, retirar con "En uso", añadir opción de catálogo; sin botones de eliminar ni revisión.
- Bautista (comercial): sin menú y `/admin/visitas` redirige.
- Comprobar eventos `dato_alta`/`dato_cambio` en Auditoría; borrar después las filas de prueba creadas (como admin vía consulta).

## No se toca
Estructura de tablas, `visita-voz`, `useMotivos`, `auditar_cambio()`. Sin drizzle-kit push/generate.
