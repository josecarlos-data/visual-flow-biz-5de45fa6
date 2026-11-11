# Revisión de visitas: análisis IA (A) y corrección de bloques por el revisor (B)

## Diagnóstico propio (comprobado en base de datos y código)

**Parte A**
- El análisis pide las 8 últimas filas de visitas. En el cliente 10833, las 20 últimas filas son unas 11 visitas reales: Gespromo crea una fila por motivo, el mismo día y comercial.
- El nombre del comercial cambia según el origen («23 - Jose antonio Bautista» en Gespromo, «Bautista» en la app). Agrupar por nombre solo junta filas del mismo origen, y eso es lo correcto.
- Las visitas de la app ya son una fila con varios bloques. Agruparlas por día y comercial juntaría dos visitas distintas del mismo día.
- Las observaciones solo se envían cuando la visita no tiene bloques visibles.
- PERFIL DEL TALLER sale de la vista del perfil vigente: un valor por dato, el más reciente y no descartado. Hoy no indica si está confirmado (estados reales: `confirmado` y `sin_confirmar`).
- La visita de la app del 16/10 tiene 2 bloques, pero no se ve ninguno en el texto. Hay que comprobar si son «No correcto» o están vacíos antes de dar el formato por bueno.

**Parte B**
- `visita_bloques` **no está auditada**: no tiene el disparador `auditar_cambio`.
- Hoy un revisor ya puede cambiar los campos de un bloque **validado** con una escritura directa. La regla de permisos lo permite (`puede_editar_bloque`) y el guardián de 0035 solo frena al comercial: al revisor le respeta la firma y no toca campos ni validación. No hay control de versión ni registro del cambio.
- El jefe de zona solo llega a bloques de su ámbito (`puede_ver_bloque` sobre los clientes que tiene permitidos). El director y el admin llegan a todos.
- La función `visita_bloques_guard_revision` existe, pero ningún disparador la usa. Es código muerto: no la toco.
- Perfil: el disparador `promover_perfil_desde_bloque` se lanza al cambiar `campos`. Si el valor cambia, el dato queda **`sin_confirmar`**, se borra quién lo confirmó y la fuente pasa a «voz». No pisa los datos con fuente `manual`. Además, solo cambia lo que se ve en el perfil si esa visita es la observación más reciente de ese dato.

## Comparación con la propuesta de Claude

| Punto | Acuerdo | Discrepancia |
|---|---|---|
| A1: 20 filas | Sí, con origen y user_id | Pedir 40 filas y quitar el último grupo si se llega al límite, para no enviar una visita a medias |
| A2: agrupar por día y comercial | Sí | Agrupar **solo las filas de Gespromo**; las de la app quedan como están |
| A3: observaciones de la app aunque haya bloques | Sí | Sin cambios |
| A4: quitar del bloque los campos que pasan al perfil | Parcial | Quitarlos solo si el dato vigente del perfil sale **de ese mismo bloque**. Si el perfil tiene un valor más reciente o manual, el dato antiguo del bloque es historia útil y se queda |
| A5: «(sin confirmar)» | Sí | Sin cambios |
| A6: no enviar los mensajes | Sí | Sin cambios |
| B1: botón «Editar datos» | Sí | Mismos controles que en completar el bloque |
| B2: nueva función con control de versión | Sí | La comprobación de permisos usa `puede_editar_bloque` + `puede_revisar_visitas` (no solo «puede ver») y solo admite los campos de la plantilla. También anota en los datos internos del bloque que lo cambió el revisor |
| B2: bloques ya validados | — | La base de datos ya lo permite. Propongo dejarlo así para el revisor: la validación se mantiene y el cambio queda auditado |
| B3: auditoría dentro de la función | Parcial | Mejor un **disparador en la tabla de bloques** que guarde el antes → después de los campos que cambian, con cliente y motivo. Así también cubre las escrituras directas y completar_bloque (sin modificarlo), cada uno dentro de su propio BEGIN…EXCEPTION |
| B4: perfil | Confirmado | Queda `sin_confirmar`. Lo dejo así salvo que decidas otra cosa (ver pregunta) |
| B5: una sola migración 0043 | Sí | Sin cambios |

## Plan final

### Parte A (solo `cliente-insights`, sin migración)
1. Pedir 40 filas con `origen` y `user_id`.
2. Agrupar las filas de Gespromo por día y comercial, y dejar las de la app como están. Ordenar por fecha, quitar el último grupo si puede estar incompleto y enviar como máximo 10 visitas.
3. En las visitas de la app, añadir siempre «Observaciones: …» si hay texto.
4. En el bloque, ocultar los campos que pasan al perfil solo cuando el dato vigente del perfil sale de ese bloque. Si el bloque se queda sin campos, no se escribe.
5. En PERFIL DEL TALLER, añadir «(sin confirmar)» a los datos cuyo estado no sea `confirmado`.
6. Prueba: pegarte «ÚLTIMAS VISITAS» y «PERFIL DEL TALLER» del cliente 10833 (vista sin reglas de acceso) y explicarte qué pasa con los 2 bloques de la visita del 16/10.

### Parte B (migración 0043 + Revisión de visitas)
1. Migración `0043`:
   - Función `editar_bloque_revision(_bloque_id uuid, _campos jsonb, _updated_at text)`. Exige ser revisor (`puede_revisar_visitas`) y tener acceso al bloque (`puede_editar_bloque`), y bloquea la fila. Usa el mismo aviso de versión que completar_bloque («Este bloque ha cambiado mientras lo editabas. Vuelve a abrirlo.»). Solo admite los campos de la plantilla. Recalcula `completo`, anota «revisor» en los datos internos de los campos que cambian y no toca la validación. Lleva `REVOKE` para el público y `GRANT EXECUTE` para los usuarios con sesión.
   - Disparador de auditoría AFTER UPDATE OF campos en `visita_bloques`. Guarda un evento `dato_cambio` con, por cada campo cambiado, el valor antes → después, más el cliente, el motivo y el ID de la visita. Todo va dentro de BEGIN…EXCEPTION.
2. En la pantalla de Revisión, botón «Editar datos» por bloque, para quien puede revisar. Abre un diálogo con los mismos controles que el comercial, envía la versión, avisa si hay conflicto y recarga.
3. En Auditoría, mostrar el antes → después de los bloques (mismo formato que el perfil).
4. Pruebas en una transacción que se deshace, con identidades simuladas: las cinco que pides y, además, «el revisor edita un bloque ya validado: la validación sigue igual».

## Detalles técnicos
- La comparación de versión usa `updated_at` como texto, igual que en 0034.
- La lista de campos permitidos es la de completar_bloque: los campos activos de la plantilla más `<clave>_nombre` en los adjuntos.
- Sin cambios en registrar_visita, completar_bloque, la conversación, el formato de salida, los modelos ni el modo prueba.
