# Registrar visita: dictar, corregir, crear bloques y borrador

## 1. Diagnóstico propio (confirmado en el código)

- **Extracción automática** (`procesarVisita`, línea ~325): tras transcribir llama a `analizarTranscripcion` sin esperar al comercial. El texto se puede editar después, pero los bloques ya no cambian.
- **Volver a dictar** sustituye la transcripción y todos los bloques (`setBloques(propuestos)`, línea 285), también los de la foto y los escritos a mano. Además, si la IA no devuelve nada, mete un bloque vacío.
- **Resultado cambiado por la IA** (línea 270). El micrófono y el texto solo aparecen dentro de `esEfectiva &&` (línea 703). Si la IA pone «cliente ausente», el dictado desaparece de la pantalla. La transcripción sí se guarda, pero Observaciones queda vacía.
- **«Reintentar el análisis»** (líneas 769-788) copia la llamada. No guarda modelo ni versión, ignora el resultado y no actualiza `clienteAnalizado`.
- **Sin borrador**: solo hay un aviso `beforeunload`. Hay otro riesgo: cuando el control de sesión expulsa al usuario, el cierre es local y se pierde todo. Justo ese caso es el que debe conservar el borrador.
- **Fecha**: `usuarioExtraccion(transcripcion, clienteNombre)` no recibe la fecha de la visita.
- **VoiceRecorder** desactivado dice «Selecciona primero un motivo de visita», pero lo que falta es el cliente.
- **Origen de los bloques**: ya existe la marca `manual: boolean`. Los bloques de voz y los de documento usan los dos `manual:false`, así que hoy no se distinguen.
- **visita-voz no tiene «modo prueba»**. Lo que existe es el banco de pruebas `scripts/bench-visita-voz/`, que usa el prompt compartido.

## 2. Comparación con la propuesta de Claude

| Punto | Acuerdo | Discrepancia / matiz |
|---|---|---|
| A. Texto primero + «Crear bloques» | Sí | Mientras se transcribe, el botón queda deshabilitado. Si la IA no devuelve bloques, no se crea un bloque vacío: aparece un aviso y el botón «Añadir bloque». |
| A. «Actualizar bloques» solo sustituye los de voz | Sí | Un bloque de voz corregido a mano también se sustituye; si no, saldría duplicado. Antes, una sola confirmación: «Se perderán tus cambios en N bloques». Para saberlo se marca `editado` al tocar un campo. |
| A. Preguntar al guardar con texto cambiado | Sí | Es un diálogo de un toque: «Actualizar bloques» (después hay que pulsar Guardar otra vez) o «Guardar así». |
| A. Reintentar = misma función | Sí | Además guarda modelo, versión y cliente analizado. |
| B. Añadir / Sustituir | Sí | Si no hay texto previo no se pregunta nada. «Añadir» une los textos con un salto de línea. |
| C. Micrófono siempre visible | Sí | Si la visita no es efectiva, el texto dictado se añade a Observaciones (sin pisar lo que ya haya) y no se muestra «Crear bloques». |
| C. La IA no cambia el resultado | Sí | Si la IA propone «no efectiva», ese aviso sustituye al de bloques. Si el comercial acepta, se quitan los bloques de voz y se conservan los de documento y los manuales, que no se guardarían con una visita no efectiva. Por eso se avisa si los hay. |
| C. Prompt fase4.5 | Sí | Se sube `VERSION_PROMPT`. |
| D. Fecha en el mensaje de usuario | Sí | Formato «Fecha de la visita: martes 10/11/2026». Se calcula en la pantalla con la fecha elegida y se envía como `fecha_visita`. Si no llega, la función funciona como hoy. |
| E. Borrador en localStorage | Sí | **No se borra cuando el sistema cierra la sesión** (expulsión o caducidad): es el caso que protege. Solo se borra al cerrar sesión a mano, al guardar bien o al pulsar «Descartar». La clave incluye el usuario y un usuario no ve el borrador de otro. Se guarda con un pequeño retardo para no escribir en cada tecla. También se guardan los nombres de las fotos, para poder avisar de cuáles faltan. |
| F. Texto del micrófono | Sí | «Selecciona primero un cliente». |

## 3. Plan final

**Pantalla (NuevaVisita.tsx)**
1. Cada bloque lleva su origen (`voz`, `documento`, `manual`) y una marca `editado`. La marca `manual` actual se sigue usando para la vista.
2. Al terminar de dictar solo se transcribe. Si ya había texto, se pregunta «Añadir / Sustituir».
3. Se muestra un único botón principal «Crear bloques» o, si el texto cambió desde la última extracción, «Actualizar bloques». La extracción se lanza solo desde ahí y desde «Reintentar».
4. Al guardar con el texto cambiado, diálogo «Actualizar bloques / Guardar así».
5. El micrófono y el texto se ven siempre. Si la visita no es efectiva, el dictado va a Observaciones.
6. La propuesta de resultado de la IA aparece como aviso de un toque, sin cambiar nada por su cuenta.
7. Borrador: se recupera al abrir con «Recuperar / Descartar» y se avisa de las fotos que hay que volver a añadir. Se reutiliza el mismo `visitaId`, así que guardar sigue sin duplicar.

**Utilidades nuevas, con pruebas**
- `src/lib/borradorVisita.ts`: guardar, leer (caduca a los 3 días), borrar y borrar los del usuario. Todo dentro de try/catch.
- `src/lib/bloquesVoz.ts`: decide qué bloques se sustituyen al actualizar y cuántos editados se perderían.

**Cierre de sesión manual** (`useAuth.signOut`): borra los borradores del usuario. La expulsión (`cerrarSesionDenegada`) no los toca.

**Función visita-voz y prompt**: recibe `fecha_visita` opcional en el mensaje de usuario. Nueva regla en el prompt: si no se trató nada con el cliente, no se crean bloques. `VERSION_PROMPT = "fase4.5"`. No cambia nada más (transcripción, documentos, modelos).

**VoiceRecorder**: cambia el texto del micrófono desactivado.

## 4. Pruebas
- Unitarias de las dos utilidades nuevas.
- Banco `scripts/bench-visita-voz` con dos narraciones nuevas, llamando al servicio de IA sin cuentas reales:
  - «no estaba, vuelvo mañana»: debe devolver 0 bloques y un resultado no efectivo.
  - «le llamo el martes» con fecha de visita conocida: debe devolver la fecha correcta.
- No se podrá probar en pantalla con micrófono real ni la recarga en un móvil. Lo diré al terminar.

## No se toca
`registrar_visita` y la migración 0042, la revisión, la conversación, cliente-insights ni la lectura de documentos (solo se marca el origen de sus bloques). No hay migraciones.
