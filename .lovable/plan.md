# Cerrar el bucle Agenda → Visita

Sin migraciones: `visitas_planificadas` ya tiene `visita_id`, `estado` y `notas`.

## A) Planificar → Visitar

1. `useCrm.ts`: `useAgendaMutations().update` acepta además `visita_id?: string | null` (el patch ya es parcial; se amplía el tipo explícitamente).
2. `useCrm.ts`: nueva función exportada `marcarPlanificadaRealizada(userId, codCliente, fecha, visitaId)`:
   - Busca la parada con ese usuario, cliente y **fecha exacta**, con estado distinto de "realizada".
   - Si existe: la pasa a "realizada" con `visita_id` y devuelve `true`; si no, devuelve `false`.
   - Nunca lanza: cualquier error se registra en consola y devuelve `false`.
3. `NuevaVisita.tsx`: tras guardar la visita y crear los bloques con éxito, llamada envuelta en try/catch. Si devuelve `true`, el toast de éxito añade "Marcada como realizada en tu agenda."
4. `Agenda.tsx`: cada parada pendiente incorpora un botón "Registrar visita" con icono Mic que enlaza a `/visitas/nueva?cliente={cod}&volver=%2Fagenda&volverTxt=Agenda` (el formulario ya preselecciona el cliente). El botón general del final solo se muestra si el día no tiene ninguna parada pendiente... y si todas están hechas, no se muestra.
5. Paradas con `visita_id`: enlace pequeño "Ver visita registrada" bajo el nombre. Ruta comprobada en `Visitas.tsx`: no existe pantalla de detalle de visita; el listado abre la ficha del cliente con `/clientes/{cod}?volver=…&volverTxt=…`, así que se usa esa misma ruta con volver a Agenda.
6. El check manual sigue igual y permite desmarcar; al volver a "pendiente" no se toca `visita_id`, solo desaparecen el tachado y el badge "Hecha".

## B) Notas del motivo en la parada

1. Si `notas` tiene texto, se muestra bajo la localidad en un bloque `text-xs` con icono StickyNote, fondo `rounded bg-muted/50 px-2 py-1` y `break-words`. Vacío o null: no se renderiza.
2. Botón de lápiz por parada que abre un diálogo con un textarea de 3 filas precargado y botón Guardar → `update.mutate({ id, notas })`. Textarea vacío guarda `null`.

## Fuera de alcance

Optimización de recorrido, TramosMapaDialog, diálogo de añadir cliente y ficha de cliente quedan intactos. El contexto comercial de la parada y la vista semanal van en otra tanda.

## Verificación

Typecheck y build limpios; prueba manual del ciclo agendar → registrar → parada tachada con enlace → desmarcar conservando el enlace.
