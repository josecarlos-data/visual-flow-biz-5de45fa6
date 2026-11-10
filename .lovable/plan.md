# Actualizar modelos de IA del CRM (sin migraciones)

## Mi plan propio
1. **Paso 0 – comprobar el catálogo real** (con el listado del gateway, antes de tocar nada): IDs exactos de GPT Transcribe, gpt-6-luna, gpt-6.1-terra y gpt-6.1-sol; superficies admitidas; si aceptan `temperature`, qué `reasoning_effort` admiten y si transcripción acepta `language`, `languages`, `prompt` y `keywords`. Si algún ID o parámetro no cuadra, me detengo y lo explico.
2. **Transcripción** (`visita-voz`): cambiar al ID confirmado de GPT Transcribe. Mantener el vocabulario en `prompt`. Enviar el idioma solo con el campo que el gateway acepte (`language` o `languages`). Añadir `keywords` solo si se admite.
3. **Extracción**: `MODELO_EXTRACCION` pasa a gpt-6-luna. Prompt, esquema, `VERSION_PROMPT` y `reasoning_effort: "none"` no cambian (si luna no admite "none", me detengo). Añadir una línea de historial.
4. **Temperatura**: cambiar el reintento ciego por una decisión fija según el modelo. Si el modelo no admite temperatura, no se envía. El reintento con 400 desaparece, así un 400 real ya no se oculta.
5. **Informe de cliente**: modelo por defecto gpt-6.1-terra con `reasoning_effort: "low"` explícito. Lista: gpt-6.1-sol, gpt-6.1-terra, gpt-6-luna y gpt-5.5 (temporal).
6. **Una sola lista**: crear `supabase/functions/_shared/modelosInsights.ts` (sin APIs de Deno). La función la usa y el comparador de la ficha la importa con una ruta relativa, igual que el banco de pruebas importa `visita-voz-prompt.ts`. Si Vite no lo resuelve, el plan B es copiar la lista con un test que compruebe que ambas son iguales.
7. **Banco de pruebas**: confirmar que `bench.ts` sigue importando el modelo nuevo y comprobar sus tipos. No se ejecuta contra datos reales sin tu permiso.

## En qué difiero de tu propuesta
- **Política de retención del espacio de trabajo**: ahora solo aparece permitido gpt-6.1-terra entre los modelos OpenAI retenidos. gpt-6-luna y GPT Transcribe podrían quedar bloqueados (403). Lo compruebo en el paso 0 y, si se bloquean, me detengo antes de cambiar de enfoque.
- **Temperatura**: en vez de quitarla solo para luna, la decido por modelo para todos, porque el comparador también usa varios modelos.
- **Lista única**: un fichero compartido en vez de dos copias, con un test como plan B.
- **Llamadas directas al gateway**: mantengo las llamadas que ya existen y no migro al SDK, porque eso cambiaría la arquitectura, que pediste no tocar.
- Por lo demás coincidimos: el modelo de visión no se toca, no hay migraciones y si algo falla me detengo.

## Verificación
- Llamada de prueba a la función de voz con un audio corto sintético: el texto sale en español y `analisis_modelo` vale gpt-6-luna. La nota real grabada desde el móvil la haces tú.
- Revisar los registros de `visita-voz` para confirmar que no hay errores 400 ni avisos de «Reintento sin temperature».
- Informe de cliente: `_meta.modelo` vale gpt-6.1-terra. Con el comparador, probar los 4 modelos.

## Ficheros
`visita-voz/index.ts`, `_shared/visita-voz-prompt.ts`, `cliente-insights/index.ts`, `_shared/modelosInsights.ts` (nuevo), `src/pages/ClienteDetalle.tsx`. Después, desplegar las dos funciones.
