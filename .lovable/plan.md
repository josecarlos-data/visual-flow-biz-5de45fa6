# Carga repetible del export de visitas de Gespromo

## Datos de hoy (consultados)
- 21.484 visitas de Gespromo, y **todas tienen bloque**: 21.507 bloques, con estas validaciones: pendiente 11.030, CORRECTO 10.211 y NO CORRECTO 266.
- Visitas con mensajes: 1.311. Visitas enlazadas a datos de perfil de cliente: 644. Visitas de cliente externo, sin código: 488.
- Estados: Realizada 17.876, Pendiente 3.587 y Cancelada 21.
- Solo 2 cabeceras y 3 bloques tienen revisor.
- Validación de las cabeceras: pendiente 11.026, CORRECTO 10.192 y NO CORRECTO 266.
- Ya existe un **índice único** para Gespromo (cliente, o −1 si es externo + fecha + hora + comercial). No hay ninguna clave duplicada.

## Mi diagnóstico, punto por punto con el de Claude
1. **Borrado con `_reset`**: de acuerdo, y es más grave de lo que dice. Como todas las visitas tienen bloque, se perderían los 21.507 bloques, los mensajes de 1.311 visitas y los enlaces de 644 datos de perfil.
2. **Duplicados**: **difiero**. Sin el borrado no se duplicaría nada. `ON CONFLICT DO NOTHING` ya choca con el índice único de Gespromo, que compara contra toda la base de datos y no solo dentro de cada tanda. Lo que falta es poder **actualizar** las que han cambiado.
3. **Validación en minúscula**: de acuerdo, pero el arreglo correcto es otro. En la carga de julio la cabecera se insertaba como pendiente. Después `repartir_observaciones_gespromo` sacaba de las observaciones el veredicto y la nota y los ponía en el bloque. Por último, la cabecera se recalculaba a partir del bloque. El veredicto que calcula hoy la pantalla no debe llegar a la base de datos.
4. **La firma de quien importa**: de acuerdo, y afecta también a los **bloques**. Su guardián (0035) firma igual cualquier bloque CORRECTO o NO CORRECTO que inserte un admin.
5. **Fechas con `toISOString()`**: de acuerdo. Lo corrijo igual que en `maestroIsi.ts`, y también la hora.
6. **Riesgo nuevo**: `repartir_observaciones_gespromo` no filtra por origen. Ahora mismo pasaría por las 35 visitas de la app, que tienen `observaciones_repartidas=false`, y sobrescribiría sus bloques. La nueva carga **no la usará**. Recomiendo corregirla en otra entrega.
7. **Índice para buscar por (cliente, fecha)**: no hace falta uno nuevo. El índice único de Gespromo ya sirve para encontrar cada visita.

## Propuesta final
**A. Nunca borrar.** Los argumentos de `importar_visitas_historicas(jsonb, boolean)` no cambian. Si llega `_reset = true`, da el error «El borrado de visitas de Gespromo está desactivado». La pantalla deja de enviarlo.
- Para devolver un recuento en vez de un número, hay que cambiar el tipo de respuesta. Eso obliga a borrar la función y crearla otra vez, restaurando los mismos permisos.

**B. Clave de cada visita**: la del índice único que ya existe (cliente o −1, fecha, hora o 00:00, comercial). No uso la de Claude, que incluye el nombre del cliente externo, porque haría falta un índice nuevo y las claves podrían dejar de coincidir con las de julio.

**C. Visitas nuevas**, dentro de la función:
- La cabecera se inserta con validación pendiente, el texto íntegro en `observaciones_original` y `observaciones_repartidas=true`.
- Se crea **un bloque** con el motivo y con el veredicto (CORRECTO, NO CORRECTO o pendiente) que sale del mismo análisis de observaciones de julio. Ese análisis se copia en una función auxiliar nueva, sin tocar `repartir_observaciones_gespromo`.
- La nota de revisión **no** va al bloque. Se guarda como mensaje «Gespromo (importado)», igual que las 1.312 notas que se migraron antes.
- La cabecera se recalcula sola a partir del bloque.

**D. Visitas que ya existen** (todas tienen bloque):
- **Estado** (Pendiente, Realizada o Cancelada): se actualiza siempre que cambie. Es un dato operativo y no toca ninguna validación.
- **Observaciones cambiadas**: se aplican solo si el bloque sigue pendiente, sin revisor y sin mensajes de la app. En ese caso se reanalizan el texto, el veredicto y la nota. Si no se cumplen esas condiciones, no se toca nada y se cuentan como «cambio ignorado por estar revisada en la app».
- No se tocan nunca: bloques revisados, mensajes, lecturas, datos de perfil ni visitas de la app.

**E. Sin la firma de quien importa, y sin cambiar ningún guardián.** Tras comprobar que quien llama es admin, la función deja vacía la identidad solo durante esa transacción. Los dos guardianes ya dejan pasar sin firmar cuando no hay usuario, como ocurre en las cargas del sistema. Así `revisado_por` y `revisado_en` quedan vacíos y las visitas de la app conservan su protección.
- Inconveniente: el registro de cambios fila a fila ignora las escrituras sin usuario.
- Para compensarlo, la función registra **un evento de auditoría por tanda**, a nombre del admin, con los recuentos.
- Si prefieres no vaciar la identidad, la alternativa es añadir a los guardianes una excepción limitada a `origen='gespromo'` y activada solo por la función. Tú decides.

**F. Pantalla**:
- Cada tanda devuelve nuevas, estado actualizado, observaciones actualizadas, cambios ignorados y sin cambios, y la pantalla los suma.
- Si alguna tanda falla, el mensaje dice «Carga incompleta: X de Y tandas aplicadas; puedes repetirla sin duplicar».
- `validacionDesde` deja de usarse para la carga. La vista previa muestra el estado.

**G.** Una sola migración en `drizzle/migrations`, sin cambios en tablas ni índices, y la corrección de fechas en `visitasHistorico.ts`.

## Prueba (en una transacción que se deshace, con un admin simulado, sin cargar el fichero real)
1. Una visita nueva se inserta con su bloque y su veredicto, y `revisado_por` queda vacío.
2. Repetir la misma tanda no duplica nada: 0 nuevas y todo «sin cambios».
3. Una visita existente pasa de Pendiente a Realizada.
4. Una con el bloque revisado y observaciones cambiadas no cambia, y se cuenta como ignorada.
5. `_reset=true` da el error.
6. El número de visitas de la app, sus bloques y sus mensajes no varía.

## Decisión que necesito
- Punto E: vaciar la identidad dentro de la función (es mi recomendación) o añadir la excepción en los guardianes.
- Punto D: confirmar que el estado se actualiza aunque la visita tenga bloque. Con la regla de Claude, «con bloques no se toca», no se actualizaría ninguna, porque todas tienen bloque.
