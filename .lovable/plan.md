# Actualizar modelos de IA del CRM (sin migraciones)

## Paso 0 ya hecho: datos del catálogo y llamadas mínimas («di ok» y un pitido de 2 s, sin tocar datos)

### Política de retención
- **Dónde está**: en los ajustes del espacio de trabajo (Connectors → AI), no en el código ni en la base de datos. No la cambio.
- **Qué dice**: solo se permiten estos modelos que **conservan datos en el proveedor**: claude-fable-5-1, claude-haiku-4-5, claude-opus-5-5, claude-opus-5, claude-sonnet-5 (en messages), gemini-omni-1.1-flash (en videos) y gpt-6.1-terra (en chat-completions y responses). Los modelos de **retención cero** no necesitan estar en esa lista.
- **Por qué no hay contradicción**: la lista solo afecta a los modelos que retienen datos. Por eso los modelos que usas hoy funcionan.

| Modelo | Retención (catálogo) | Estado | Obsoleto |
|---|---|---|---|
| gpt-4o-transcribe | cero | permitido, 200 | sí, se retira el 26/02/2027 |
| gpt-5.6-luna | cero | permitido, 200 | no |
| gpt-5.5 | cero | permitido, 200 | no |
| gpt-transcribe (GPT Transcribe) | cero | permitido, 200 | no |
| gpt-6-luna | cero | permitido, 200 | no |
| gpt-6.1-terra | **el proveedor la conserva** | permitido de forma explícita en tu lista, 200 | no |
| gpt-6.1-sol | cero | permitido, 200 | no |

Ningún modelo está bloqueado, así que el Build puede hacerse completo.
Aviso aparte: gemini-3.6-flash (visión) está obsoleto y se retira el **19/11/2026**, dentro de 9 días. No lo toco porque así lo pediste, pero hay que decidir su sustituto pronto.

### Temperatura y razonamiento (resultados reales)
| Modelo | temperature 0 | esfuerzo |
|---|---|---|
| gpt-6-luna | acepta | "none" funciona, "low" también |
| gpt-5.6-luna | acepta (hoy no hay reintento) | "none" funciona |
| gpt-6.1-terra | **rechaza (400)** | "low" funciona |
| gpt-6.1-sol | **rechaza (400)** | "low" funciona |
| gpt-5.5 | **rechaza (400)** | "low" funciona |
| gemini-3.6-flash | acepta | "low" funciona |

Los 4 modelos del comparador aceptan "low". El informe de cliente no envía temperature hoy y seguirá sin enviarla.

### Transcripción
- gpt-transcribe acepta `language`, `languages`, `keywords` y `prompt` sin errores. gpt-4o-transcribe rechazaba `languages` y `keywords`.
- Con un pitido no se puede saber si alguno se **ignora en silencio**. Su contrato documenta `languages` y `keywords`.

## Build
1. **Transcripción**: usar `openai/gpt-transcribe`, con `languages=["es"]` en lugar de `language`, `keywords` con los términos de `vocabularioTranscripcion()` y mantener `prompt`. Antes de desplegar, prueba con una frase española sintética que lleve términos del sector como «Lemforder» o «Luis Moleón», comparando con y sin `keywords` y `prompt`. Si no se nota ningún efecto, dejo solo lo documentado y te lo cuento. Si el español falla, me detengo.
2. **Extracción**: usar gpt-6-luna. Prompt, esquema, `VERSION_PROMPT`, `reasoning_effort: "none"` y temperature 0 no cambian. Añado una línea de historial.
3. **Temperatura por modelo** en `chatJson()`: un mapa con gpt-6-luna = 0 y gemini-3.6-flash = 0. Así la visión sigue igual: esfuerzo "low" y temperature 0, como hoy en el primer intento. Si el modelo no está en el mapa, no se envía temperature y queda un aviso en el registro. Se quita el reintento ante un 400.
4. **Informe de cliente**: gpt-6.1-terra por defecto, con `reasoning_effort: "low"` y sin temperature. Lista del comparador: gpt-6.1-sol, gpt-6.1-terra, gpt-6-luna y gpt-5.5 (este último temporal).
5. **Lista única** en `supabase/functions/_shared/modelosInsights.ts`, importada por la función y por la ficha. Plan B: dos copias con un test que compruebe que son iguales.
6. **Banco de pruebas**: compruebo que `bench.ts` compila con el modelo nuevo. No lo ejecuto con datos reales.

## Verificación sin crear datos
- La prueba de audio sintético solo usa la acción de transcribir, que no escribe en la base de datos. No se crean visitas.
- Reviso los registros de `visita-voz`: sin errores 400 ni reintentos.
- La nota de voz real con la visita guardada (que debe registrar gpt-6-luna) y el informe de un cliente real los haces tú. Después yo compruebo el registro y `_meta.modelo`.
- Comparador: los 4 modelos responden, en modo prueba, que no guarda el informe.

Sin migraciones. Si algo no funciona como está planteado, me detengo y te lo explico.
