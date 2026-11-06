# Conversación de revisión: arreglar lo roto para la prueba con un comercial

## 1. Mi diagnóstico (revisado en el código)

- **Fallos 1, 2 y 3 — misma causa, confirmada.** `useVisitaMensajes.ts` guarda `supabase.rpc` en una constante y la llama suelta; pierde `this` y supabase-js revienta en `this.rest`. Es el único sitio del proyecto con ese patrón (he buscado asignaciones de `supabase.rpc/from/functions/storage/auth`; las otras dos que salen son llamadas normales).
  - En `useMarcarLeida` el error es síncrono dentro de un `useEffect` → tumba `/visitas/revision` (1).
  - En las consultas el error se guarda y las pantallas lo pintan como vacío: la ficha no enseña el mensaje recién enviado (2), «Mis revisiones» vacía y menú sin contadores (3).
- **El envío sí funciona** (insert directo). Los mensajes de prueba ya están guardados; hay que localizarlos.
- **Fallo 4:** el menú solo añade «Mis revisiones» con `role === "comercial"`. La función del servidor ya filtra por el dueño de la visita, sirve para cualquiera.
- **Fallo 5:** la vista previa ya no lee las notas antiguas; la publicada es anterior y sigue escribiendo la nota del bloque (aún hay código que la envía en `useCrm.ts`). Lo confirmo en el Build comparando con la versión publicada; no hay forma de que ambas convivan sin perder notas mientras no se publique.
- **Hallazgos adicionales míos:**
  - La ficha decide «quién puede escribir» con una regla del front que no coincide con la del servidor (deja escribir a jefe de zona en visitas que el servidor quizá rechace, y viceversa).
  - En el servidor, «esperando» y los contadores ya ignoran mensajes sin autor (importados de Gespromo). El fallo de «Esperando al comercial» es **solo del front** (`RevisionVisitas.tsx`), no de SQL.
  - Mientras se siga usando la versión publicada, cada nota escrita allí no llega al comercial. Conviene publicar pronto tras la prueba.

## 2. Comparación con la propuesta de Claude

| Punto | ¿Coincido? | Comentario |
|---|---|---|
| 1. Llamar sin desligar; marcar leída nunca tumba | Sí | Además quito el cast: los tipos ya existen. |
| 2. Error visible con Reintentar | Sí | Aplicarlo en Mis revisiones, ficha, diálogo de revisión y contadores (estos, en silencio: sin número, sin romper). |
| 3. Para todos los que registran visitas; nombre | Sí | Propongo **«Mis visitas revisadas»**: deja claro que son las propias. |
| 4. Una RPC por ficha | Sí, la mejor solución | Quita hasta 100 llamadas fallidas y la regla duplicada. Solo matiz: limitar a 50 ids y sin reintentos en error de permiso. |
| 5. «Esperando» con autor y dueño | Sí, pero se queda corto en el diagnóstico | El servidor ya lo hace bien; solo hay que corregir el front. |
| 6. Icono con número en la cabecera | Sí | Si tiene ambos contadores (revisor que también registra visitas), suma y lleva al que tenga novedades. |
| 7. Listado de datos, solo lectura | Sí | Detección de notas posteriores: fecha de aplicación de la 0029 (registro de migraciones) frente a `revisado_en` del bloque/visita, y que el texto no exista ya como mensaje. |
| 8. Repasar otras llamadas desligadas | Hecho ya | No hay más. |

No veo errores en la propuesta de Claude; solo el punto 5 apunta al sitio equivocado (SQL ya está bien).

## 3. Plan final

### Imprescindible para la prueba
1. Corregir las llamadas en `useVisitaMensajes.ts`; `useMarcarLeida` con try/catch y sin reintentos.
2. Estados de error con «No se han podido cargar… Reintentar» en Mis visitas revisadas, diálogo de revisión y ficha.
3. Menú: «Mis visitas revisadas» con contador para todo el que tenga acceso a visitas.
4. Migración **0032**: nueva función `mensajes_visitas(_ids uuid[])` (SECURITY DEFINER, `search_path` fijo, máx. 50 ids) que devuelve solo visitas donde `puede_conversar_visita` es cierto, con mensajes, `es_dueno` y `puede_escribir` calculado en servidor. REVOKE a público/anon, GRANT EXECUTE a authenticated. Es función nueva: no hay DROP.
5. Ficha del cliente: una sola llamada; quitar la regla duplicada de `ClienteDetalle.tsx`.
6. Revisión: «Esperando al comercial» solo si el último mensaje tiene autor y la visita tiene dueño.
7. Cabecera (móvil y escritorio): icono de mensajes con número, que lleva a Mis visitas revisadas o a Revisión con «Solo con respuesta nueva».

### Recomendable (antes de publicar)
8. Listado de solo lectura de mensajes con autor y notas escritas tras la 0029 desde la versión publicada. No borro ni paso nada: decides tú.
9. Publicar en cuanto aprueben la prueba, para que no se escriban más notas por el camino antiguo.

### Pruebas (en el Build)
- Visita de prueba de Bautista, cliente externo «PRUEBA», en domingo; se borra al final. Nunca la sesión de Fran.
- Recorrido completo: revisor marca No correcto y pregunta → Bautista ve contador en menú y cabecera y la visita en su lista → contesta → revisor ve «Respuesta nueva» → `/visitas/revision` abre sin errores → la ficha enseña el hilo.
- Yo compruebo en base de datos: permisos de la nueva función (otro comercial no recibe nada), contadores y lecturas. Pantalla con Playwright como Bautista.
- Tú en pantalla: como admin y como director en móvil real.

Fuera de alcance: orden B, visor de adjuntos, biblioteca e importación de Gespromo.
