# Revisión de visitas: el bloque es la unidad de revisión

## Lo comprobado
- La función de cálculo actual da prioridad a NO CORRECTO sobre pendiente (confirmado).
- `enviar()` vuelve a escribir en la visita el estado que tenía al abrir el diálogo (confirmado en el código).
- Hoy hay **13 visitas** cuyo estado no cuadra con el de sus bloques, y **27 visitas de la app** sin comercial (las 27 tienen usuario, así que se pueden rellenar todas). El número exacto de filas que cambian se dará después de aplicar.

## 1. Migración (una sola, en drizzle/migrations)
a. `recalcular_validacion_visita()` con CREATE OR REPLACE y la misma firma: primero pendiente, después NO CORRECTO y si no, CORRECTO. El trigger no se toca.
b. Un UPDATE de reajuste de `visitas.validacion` en las visitas con bloques donde no coincida (unas 13; entre ellas TALLERES PEREZ GOMEZ y CALEROTRUCKS).
c. Nueva función `SECURITY DEFINER` (search_path fijo) y trigger BEFORE INSERT en visitas: si `comercial_nombre` es NULL y hay `user_id`, se rellena con `profiles.full_name`. REVOKE EXECUTE a PUBLIC, anon y authenticated. Relleno de las visitas de origen 'app' que lo tengan NULL (27). `visitas_dedupe_idx` no se ve afectado.
Nota: el reajuste (b) pasa por el trigger de auditoría `auditar_cambio`, y como no hay usuario, ese trigger lo ignora (comportamiento actual). Si en algo hiciera falta otro enfoque, me detengo y lo explico.

## 2. Diálogo (RevisionVisitas.tsx, sm:max-w-2xl)
- En cada bloque, botones «Correcto» y «No correcto» que se ven marcados; pulsar el que está marcado lo devuelve a pendiente. Debajo, la «Nota para el comercial» propia de cada bloque.
- Campos con la etiqueta de la plantilla y en el orden de `sort_order`; los que no estén en la plantilla van al final con su clave.
- Los cambios se guardan en el diálogo y los bloques modificados llevan la marca «sin guardar». En el pie: «Marcar pendientes como correctos» (solo los pendientes), «Guardar» y «Guardar y siguiente» (la siguiente de la lista filtrada). Si cierras con cambios, pide confirmación.
- Al guardar: solo se actualizan los bloques que han cambiado (validacion y nota_revision); en la visita solo observaciones y, si toca, la situación de «Justificar caída». En visitas con bloques nunca se escribe `visitas.validacion`.
- Se quitan la «Nota de revisión» de la visita y los botones «Validar»/«Marcar no correcta». En visitas sin bloques se queda como ahora.

## 3. Lista
- Filtro «Comercial» junto a Motivo, con los nombres de las visitas cargadas, en orden alfabético.
- En cada fila, el comercial y el estado junto a cada motivo: ✓ correcto, ✗ no correcto y sin marca si está pendiente.

## No se toca
`visita_bloques_guard_revision`, las políticas, Reanalizar, ClienteDetalle ni el registro de visitas. No se usa drizzle-kit push ni generate.

## Prueba (como admin)
- Comprobar que TALLERES PEREZ GOMEZ y CALEROTRUCKS ya no salen en Pendientes.
- Crear una visita de prueba propia en un domingo, con dos bloques, y comprobar:
  - Correcto + nota y No correcto + otra nota: al guardar, cada bloque conserva su nota y la visita sale en No correctas.
  - No correcto + pendiente: la visita sigue en Pendientes.
  - «Marcar pendientes como correctos» no cambia el bloque que está en No correcto.
- Comprobar que se ve el comercial y que el filtro funciona. Al terminar, borrar la visita de prueba y sus bloques, y no tocar ninguna visita real.
