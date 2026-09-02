# Informe de cliente: saneado, generación en segundo plano y contexto más rico

Ficheros: `supabase/functions/cliente-insights/index.ts` y `src/pages/ClienteDetalle.tsx`. Sin migraciones.

## Verificación previa (punto E)

- **Situación vigente (C4)**: la cabecera de `ClienteDetalle.tsx` la pinta con `useSituacionesVigentes()` (línea 106), que en `useCrm.ts` consulta la tabla **`situaciones_cliente`** y se queda con la primera fila que cumple `activo = true AND desde <= hoy AND (hasta IS NULL OR hasta >= hoy)`, ordenada por `updated_at` descendente. La edge function usará exactamente esa tabla y ese criterio, con la fecha local `hoyIso` ya existente.
- **RLS**: todas las consultas nuevas (`situaciones_cliente`, `v_cliente_perfil_vigente`, `perfil_atributos`, `motivo_campos`) van con `userClient` dentro del `Promise.all` existente. El cliente de servicio se sigue usando solo para el upsert de caché al final.
- `v_cliente_perfil_vigente`, `perfil_atributos`, `motivo_campos` y `situaciones_cliente` existen en la base de datos; `v_cliente_perfil_vigente` ya se lee desde el frontend con el cliente normal, así que es accesible con RLS de usuario.

## A) Saneado de la respuesta del modelo (edge function)

- Función `limpiar(texto: string): string`: corta en la primera aparición de `<|endoftext|>`, `#+#+`, `billing:`, `COST:`, `[PLUGIN]`, `TOKEN `, `END asr`; elimina controles no imprimibles salvo `\n`; `trim` y colapso de espacios repetidos; devuelve `""` si quedan menos de 3 caracteres.
- Se aplica a `resumen` y a cada elemento de `alertas`, `oportunidades` y `argumentario`, descartando vacíos, antes del upsert y antes de la respuesta al cliente.
- Si el texto cambió, `console.warn` con `cod_cliente` y los primeros 200 caracteres del original. Nunca falla.
- `JSON.parse` envuelto en `try/catch`: al fallar, respuesta 502 con `"La IA ha devuelto una respuesta no válida. Inténtalo de nuevo."` y cabeceras CORS.

## B) Generación en segundo plano (ClienteDetalle.tsx)

- Se elimina el `useState` `insights`; `shown` pasa a ser solo `cached`.
- La mutación recibe `mutationKey: ["crm_insights_generar", codNum]` y en `onSuccess` invalida `["crm_insights", codNum]` en vez de guardar en estado.
- Estado de carga con `useMutationState({ filters: { mutationKey: ["crm_insights_generar", codNum], status: "pending" } }).length > 0` → `generando`, usado en el `disabled` del botón y en el spinner, de modo que sobreviva al desmontaje de la pestaña.
- Con `generando` y sin informe previo: bloque con `Loader2` girando y "Generando informe…". Con informe previo: se mantiene visible con `opacity-60`.
- Sin `AbortController` ni `signal`.

## C) Contexto enviado al modelo (edge function)

- **C1 Variación por referencia**: `cliente_top_productos` con `_desde` = hoy − 12 meses, `_hasta` = hoy, `_desde_prev` = hoy − 24 meses, `_hasta_prev` = (hoy − 12 meses) − 1 día, todo con fechas locales al estilo de `hoyIso` (nunca `toISOString()`). Título del bloque: "PRODUCTOS (últimos 12 meses vs. 12 anteriores)". Cada línea añade `" — 12.400 EUR (antes 18.900 EUR, −34 %)"`, con `(nueva)` si el anterior es 0 y `(perdida)` si el actual es 0 y el anterior no.
- **C2 Perfil del taller**: consultas a `v_cliente_perfil_vigente` (por `cod_cliente`) y a `perfil_atributos` (catálogo `key → nombre`). Bloque "PERFIL DEL TALLER:" con una línea por atributo usando la etiqueta legible y `valor_texto` o `valor_num`, más "(observado DD/MM)". Si no hay nada: "  Sin datos de perfil".
- **C3 Etiquetas reales en visitas**: consulta a `motivo_campos` (`campo_key → label`) y sustitución de la clave cruda al serializar `v.campos`; si la clave no está en el catálogo, se deja igual.
- **C4 Situación**: consulta a `situaciones_cliente` del cliente; si hay una vigente según el criterio descrito arriba, se añade `SITUACIÓN: {etiqueta}` junto a los datos de ficha, al principio del contexto.
- **C5 System prompt**: se añade una frase pidiendo que, si una referencia relevante ha caído respecto al periodo anterior, se mencione explícitamente en alertas u oportunidades con su nombre y su porcentaje. Mismo modelo y mismo `response_format`.

## Fuera de alcance

Modelo y gateway, análisis de abonos y material no retirado, esquema de `cliente_insights`.

## Verificación final

Redespliegue de la edge function y una llamada real desde la ficha de un cliente para comprobar el informe saneado y los bloques nuevos; build y typecheck limpios; comprobación de que el estado "generando" persiste al cambiar de pestaña y volver.
