# 0047: filtros rápidos en Revisión de visitas + pantalla paginada

## Migración 0047 (única además de 0046)
- Nueva `revision_visitas_filtro_bloques(_motivo text, _dudas boolean)` → solo ids de visita.
  - SECURITY DEFINER, `search_path = public`, sale vacía si no `puede_revisar_visitas(auth.uid())`.
  - Aplica la regla de `puede_ver_bloque` una vez por consulta (admin/director todo; jefe: `clientes_permitidos`; autor: sus visitas), no bloque a bloque.
  - Motivo: algún bloque con ese motivo. Dudas: confianza baja/media en `campos_meta` (sin `_origen`).
  - REVOKE a PUBLIC y anon; GRANT EXECUTE solo a authenticated.
- `visitas_revision_lista`: CREATE OR REPLACE con misma firma y misma respuesta, sigue INVOKER.
  - Motivo/dudas: `v.id IN (ids de la auxiliar)`, cruzado con las visitas que el usuario ve por RLS. Motivo en visitas sin bloques sigue por `motivo_key`.
  - Búsqueda: primero clientes, motivos y comerciales que coinciden (sin acentos, una pasada), luego cruce con visitas. Sigue cubriendo cliente, cliente externo, comercial y nombre de motivo.
  - GRANT EXECUTE se repite.

## Pruebas (usuarios ficticios, todo deshecho)
- Admin, director y jefe de zona: mismos ids exactos antes (resultado de 0046) y después en motivo, dudas y búsqueda (con y sin acentos, p. ej. «malaga»/«málaga», un cliente externo, un comercial, un nombre de motivo). Si el jefe difiere en una visita, me detengo.
- Tiempos con origen «todas»: objetivo < 1 s; si alguno no baja de 2 s, me detengo antes de la pantalla.

## Pantalla (según plan aprobado; diálogo sin cambios)
- `useCrm.ts`: `useVisitasRevision` llama a la lista con filtros y página; `useComercialesRevision`.
- `RevisionVisitas.tsx`: página en la URL, filtro nuevo → página 1, buscador con espera de 300 ms, paginador móvil, contadores reales, bloques solo de las 50 visibles, nombre de cliente desde la fila, «Guardar y siguiente» pide la siguiente después de guardar con el cursor.

## Al terminar
Ficheros cambiados, confirmación de solo 0046 y 0047, tiempos medidos y lo no probado en pantalla.
