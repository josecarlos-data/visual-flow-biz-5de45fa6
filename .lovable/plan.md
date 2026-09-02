# Comparar modelos de IA en la ficha de cliente

Los cuatro modelos de la lista blanca existen en el gateway (`openai/gpt-5.5`, `openai/gpt-5.6-luna`, `openai/gpt-5.6-terra`, `openai/gpt-5.6-sol`), verificado contra el listado del gateway. No hace falta cambiar la lista.

## A) La edge function acepta un modelo opcional

En `supabase/functions/cliente-insights/index.ts`:

- Lista blanca `MODELOS_PERMITIDOS` declarada en el fichero con los cuatro identificadores; `MODELO_POR_DEFECTO = "openai/gpt-5.5"`.
- El body admite `modelo?: string`. Si viene y no está en la lista, respuesta 400 con mensaje claro. Si no viene, se usa el modelo por defecto.
- Modo prueba: si el body trae `modelo`, se omite por completo el upsert a `cliente_insights`. Sin `modelo`, el flujo es idéntico al actual (upsert incluido).
- La respuesta incluye siempre `_meta`: `{ modelo, prompt_tokens, completion_tokens, total_tokens, duracion_ms }`. Los tres contadores se leen de `chatJson.usage` y valen `null` si el gateway no los informa (nunca 0). `duracion_ms` se mide con `performance.now()` alrededor del `fetch` al gateway.

Prompt, esquema de respuesta, saneado y manejo de errores se quedan como están.

## B) Panel de comparación en la ficha (solo admin)

En `src/pages/ClienteDetalle.tsx`, pestaña "Análisis IA", debajo del botón actual:

- Visibilidad: `role === "admin"` leído de `useAuth()`, que la página ya importa. Nota: el gate de margen (`usePuedeVerMargen`) no sirve aquí porque `ver_margen` es un permiso de perfil independiente y lo pueden tener no administradores; el panel de pruebas se limita a administradores como pide el objetivo.
- Bloque "Comparar modelos" con un `Select` de los cuatro modelos y un botón "Probar" que invoca la edge function con `{ cod_cliente, modelo }`.
- Estado local `pruebas: Array<{ modelo, meta, resumen, alertas, oportunidades, argumentario }>`; cada resultado se **añade** al array para poder acumular y comparar.
- Cada prueba se pinta en su propia `Card`: título con el nombre del modelo, línea pequeña con tokens de entrada, tokens de salida y segundos (`duracion_ms / 1000`, un decimal), y debajo las cuatro secciones del informe con el mismo formato visual que el informe normal.
- Botón "Limpiar pruebas" que vacía el array.
- Aviso pequeño permanente: "Pruebas no guardadas. El informe del cliente no se modifica."
- Spinner y desactivación del botón "Probar" mientras hay una prueba en curso; errores por toast, igual que el flujo actual.

El informe normal, su botón "Generar análisis" y la generación en segundo plano no cambian.

## Fuera de alcance

Sin migraciones. No se toca el prompt, el esquema de respuesta, la tabla `cliente_insights` ni el flujo de generación en segundo plano.
