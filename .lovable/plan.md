# Exigir aprobación en las reglas de acceso que hoy no la comprueban

## Comprobado antes de proponer
He consultado las reglas de acceso de la base (esquemas public y storage) y las funciones con privilegios.

**Mi lista coincide con la tuya.** Estas reglas dan acceso por rol o por ser dueño, sin is_approved en todas sus ramas:
- visita_bloques: las 4 políticas (ver, crear, editar, borrar)
- visitas: «Users update own visitas» y «Users delete own visitas»
- objetivos: «Direccion gestiona objetivos» (FOR ALL)
- situaciones_cliente: situaciones_insert, situaciones_update y situaciones_delete
- profiles: «Directors can view all profiles» y «Jefes can view zone profiles»
- storage.objects: «Adjuntos visita: ver propios o revisores», «actualizar propios» y «borrar propios o admin»
- visitas_planificadas: «Update own planificadas» y «Delete own planificadas»
- perfil_atributos: perfil_atributos_select_auth (USING true)
- Funciones: objetivos_propuesta y refrescar_documentos_resumen

Además salen las cinco excepciones de «NO tocar» (perfil propio, rol propio, acceso propio a paneles). dispositivos y sesiones_activas no aparecen porque no tienen políticas de lectura que cumplan el criterio.

**Única diferencia:** la consulta de funciones también devuelve `puede_ver_bloque`, que usa has_role sin is_approved. Es la función de apoyo de las reglas de visita_bloques. Como pides, no la toco: la guarda va en las políticas, y eso basta para cerrar el acceso por la API. Quien la llamara directamente solo sabría si puede ver una visita concreta (sí o no); no recibiría datos.

## Cambio (una migración: `drizzle/migrations/0014_rls_exigir_aprobacion.sql`)
- Para cada política de la lista: DROP POLICY IF EXISTS y CREATE POLICY con el mismo nombre, tabla, comando y rol. La condición se copia literal de pg_policies con `(SELECT public.is_approved(auth.uid())) AND ( … )` delante, en USING y en WITH CHECK (en WITH CHECK solo si ya lo tenía).
- perfil_atributos_select_auth: `USING ((SELECT public.is_approved(auth.uid())))`.
- objetivos_propuesta y refrescar_documentos_resumen: CREATE OR REPLACE, misma firma y tipo de retorno, mismo cuerpo. Solo cambia la guarda: `is_admin(auth.uid()) OR (is_approved(auth.uid()) AND has_role(auth.uid(), 'director_comercial'))`.
- No se tocan las excepciones, has_role, puede_ver_bloque, puede_editar_bloque ni los permisos de ejecución de ninguna función.

## Pruebas
- Antes y después: condiciones de cada política afectada y número de políticas por tabla, que no debe cambiar. Repetir la consulta del punto 1: solo deben quedar las excepciones.
- Comparar el cuerpo de las dos funciones antes y después: solo cambia la guarda.
- Con la sesión de Bautista, solo lectura: abrir fichas y ver visitas, bloques, perfil y adjuntos. Medir el tiempo de la pestaña Visitas antes y después. Sin crear, cambiar ni borrar nada.

Si al aplicar algo no sale como aquí, me detengo y te lo explico.
