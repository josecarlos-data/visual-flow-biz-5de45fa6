# Revisión de visitas: lista completa con paginación en servidor

## Diagnóstico propio (comprobado hoy)

- `useVisitasRevision` lee `visitas` con `.limit(1000)` ordenado por fecha; todos los filtros, los contadores y el desplegable Comercial se calculan en el navegador sobre esas 1.000.
- Datos reales: **gespromo 26.234 visitas (12.091 pendientes)**, app 59 (42 pendientes). Con «gespromo» o «todas» se ve menos del 4 % y «N visitas · M pendientes» sale muy corto.
- Además se cargan los bloques de las 1.000 visitas (tandas de 300) y **todos** los clientes solo para pintar nombres y buscar.
- Hay visitas gespromo con fecha futura (hasta 03/12/2026); el orden por fecha desc las pone arriba. No es un fallo de esta entrega, solo lo señalo.
- Recalcular cabecera (punto 5): el trigger `trg_visita_bloques_agregado` salta en alta, cambio de validación y borrado. **Hueco**: si se borra el último bloque, `count(*) = 0` devuelve NULL y la cabecera **no se toca**, queda con el estado del bloque borrado. Alta y cambio sí recalculan bien.
- Índices: existen `visitas_validacion_idx (validacion, fecha desc)`, `fecha desc` (dos veces, duplicado) y `idx_visita_bloques_visita_id`. Con ~26.000 filas bastan; no propongo índices nuevos. El duplicado de fecha no lo toco (fuera de alcance).

## Comparación con tu propuesta

1. RPC de lista: de acuerdo, con un cambio: **SECURITY INVOKER** en vez de DEFINER. Así la RLS de `visitas` (y de `clientes`, `visita_bloques`) actúa tal cual y ve exactamente lo mismo que hoy sin reescribir permisos. Coste: con 26.000 filas la política es asumible (medido en la prueba; si superara ~1 s me detengo y lo explico).
   - Motivo: igual que propones (algún bloque, o `motivo_key` si no hay bloques).
   - q: nombre de cliente / `cliente_externo`, comercial y **nombre** del motivo (como hoy), sin distinguir acentos con `normalizar_texto`.
   - Dudas: `campos_meta` de algún bloque con `confianza` baja o media, ignorando `_origen`, igual que `tieneDudas`.
   - Respuestas nuevas: llamar a `revision_respuestas_nuevas` dentro. Matiz: hoy tiene tope de 1.000; dentro de la RPC uso una subconsulta equivalente sin tope en lugar de la función con límite, o la llamo con 1000 y lo documento. Propongo lo primero (misma regla, sin tope).
   - Devuelve también el nombre del cliente y los motivos, para no cargar todos los clientes.
2. Desplegable Comercial: de acuerdo; `visitas_revision_comerciales(_origen)`, INVOKER, `distinct comercial_nombre`.
3. Front: de acuerdo. `pagina` en la URL, filtro nuevo → página 1, espera de 300 ms en el buscador, paginador «‹ Anterior · Página X de Y · Siguiente ›» que en móvil cabe en una línea. Bloques solo de las 50 de la página.
4. «Guardar y siguiente»: tu propuesta de «primera de la siguiente página» falla en Pendientes, porque al guardar la visita desaparece y todo se corre una posición (se saltaría una). Propongo decidir la siguiente **por posición en el orden** (fecha desc, id), no por página: la RPC acepta un cursor opcional `_tras (fecha, id)` y devuelve la siguiente visita que cumple los filtros y en qué página cae. Funciona igual en Pendientes y en Todas, y la lista salta a esa página.
5. Cabecera: incluir el arreglo del borrado del último bloque.
6. Índices: ninguno nuevo, justificado arriba.

## Plan final

**Una migración (0046):**
- `visitas_revision_lista(_origen, _estado, _q, _motivo, _comercial, _dudas, _respuestas, _desde, _hasta, _pagina, _por_pagina default 50, _tras_fecha, _tras_id)` → `jsonb { filas, total, pendientes, pagina }`. INVOKER, `search_path = public`, `_por_pagina` limitado a 1–100. Sale vacía si el usuario no puede revisar (`puede_revisar_visitas`).
- `visitas_revision_comerciales(_origen)` → lista de nombres.
- `recalcular_validacion_visita()`: CREATE OR REPLACE (misma firma, trigger intacto); si ya no quedan bloques, la cabecera vuelve a `pendiente` solo si estaba derivada de bloques. Nota: esto cambia una regla de permisos/estado existente; si prefieres no tocarla en esta entrega, la dejo anotada en el roadmap.
- `REVOKE ... FROM PUBLIC, anon` y `GRANT EXECUTE ... TO authenticated` en las dos nuevas.

**Pantalla (sin tocar el diálogo de revisión):**
- `useCrm.ts`: `useVisitasRevision` pasa a llamar a la RPC con filtros y página; nuevo `useComercialesRevision`.
- `RevisionVisitas.tsx`: quita el filtrado local, `useClientes` y el cálculo de comerciales; añade página en la URL, espera en el buscador, paginador y nueva lógica de «Guardar y siguiente».

**No se toca:** diálogo de revisión, registro de visitas, reglas de 0045.

## Pruebas (identidades simuladas, transacción que se deshace)

- Origen «gespromo», estado todas: `total` = `count(*)` de gespromo (26.234) y aparecen visitas anteriores a las 1.000 más recientes (última página con fechas de 2025).
- Pendientes gespromo = 12.091; filtros de motivo, comercial, fechas, dudas, q (con y sin acentos) coinciden con la consulta directa equivalente.
- Admin, director, jefe de zona (solo su delegación) y comercial: mismo total que `select count(*)` con su identidad sobre la tabla.
- Cursor: en Pendientes, guardar la última de la página 1 devuelve la que antes era la 51.
- Borrar el último bloque de una visita CORRECTO → cabecera vuelve a pendiente; alta y cambio siguen recalculando.
- `anon` no puede ejecutar las funciones.
- Tiempo de respuesta de la lista medido con origen «todas».

## Al terminar
Ficheros cambiados, confirmación de una sola migración nueva y lo no probado en pantalla.
