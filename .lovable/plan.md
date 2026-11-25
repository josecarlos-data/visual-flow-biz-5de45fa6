# Dictado pendiente: aplicar una sola vez

## Diagnóstico (confirmado en el código)
- En el diálogo «Ya tenías texto dictado», «Sustituir» y «Añadir a lo dictado» aplican el dictado y después el diálogo se cierra.
- Al cerrarse, `onOpenChange(false)` todavía ve el dictado pendiente (el estado no se ha vaciado aún en ese render) y lo añade otra vez.
- Resultado: Añadir duplica el texto nuevo; Sustituir deja el dictado nuevo dos veces.
- En visitas no efectivas no hay diálogo, así que no les afecta.

## Cambios
1. **NuevaVisita.tsx**
   - Guardar el dictado pendiente también en un ref (`dictadoPendienteRef`), que se rellena al abrir el diálogo.
   - Una única función `resolverDictadoPendiente(modo)`: lee el ref, lo vacía de inmediato y, solo si tenía texto, llama a `aplicarDictado` y cierra el diálogo. La segunda llamada no encuentra nada y no hace nada.
   - «Sustituir» → `resolverDictadoPendiente("sustituir")`; «Añadir a lo dictado» → `"anadir"`; cerrar sin elegir (Esc / clic fuera) → `"anadir"`, como ahora.
   - Título: «Ya tenías texto dictado» → «Ya tenías texto». Ningún otro texto cambia.
2. **Prueba** en `src/lib/bloquesVoz.test.ts`: simula la secuencia real (botón y luego cierre) con un pendiente de un solo uso y `unirDictado`, comprobando que:
   - Añadir: el texto previo + el nuevo aparece una vez.
   - Sustituir: queda solo el nuevo, una vez.
   - Cerrar sin elegir: se añade una vez.

## Punto a decidir
Para que la prueba ejercite la lógica real (no una copia), lo limpio es poner el pequeño consumidor de un solo uso (`crearPendienteUnaVez`, ~10 líneas) en `src/lib/bloquesVoz.ts` y usarlo desde la pantalla. Eso toca un fichero más de los indicados. Si prefieres solo NuevaVisita.tsx + test, la prueba reproducirá la secuencia con `unirDictado` y un ref local, pero no probaría el código de la pantalla. Por defecto aplicaré la primera opción salvo que digas lo contrario.

Sin migraciones ni cambios en edge functions.
