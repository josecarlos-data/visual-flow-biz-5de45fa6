# Volver a GPT-5.6 Luna solo en la extracción de bloques

## Medición (banco de dictados cortos, prompt fase4.6, 11 casos × 5 ejecuciones)

| Configuración | Bloques esperados | Sin bloques* | Latencia media | p90 | Coste por extracción |
|---|---|---|---|---|---|
| openai/gpt-6-luna · none (publicado) | 100 % | 0 % | 7,6 s | 17,1 s | 0,0062 créditos |
| openai/gpt-5.6-luna · none | 100 % | 0 % | 2,9 s | 5,8 s | 0,0121 créditos |

*Sin contar el caso «no estaba», que en ambos da 0 bloques y resultado no efectivo (correcto en 5/5).

Los 11 casos dan 5/5 en los dos modelos. No hubo ningún cero por bloques descartados.
Diferencia de motivos: en «Icer / plan de choque», GPT-6 añadió además Seguimiento en la primera ejecución; GPT-5.6 no.

## Estado en la pasarela
- openai/gpt-5.6-luna: sin fecha de retirada (expiration_date vacío), no marcado como obsoleto, retención cero en chat-completions y responses.
- Coste: aproximadamente el doble por extracción (unos 0,006 créditos más por visita).

## Cambio propuesto (mínimo)
1. `supabase/functions/_shared/visita-voz-prompt.ts`: `MODELO_EXTRACCION = "openai/gpt-5.6-luna"`. `MODELO_VISION` se queda en `openai/gpt-6-luna` (lectura de fotos sin cambios).
2. `supabase/functions/visita-voz/index.ts`: añadir al mapa de temperatura `"openai/gpt-5.6-luna": { none: 0 }` (el banco lo envió con temperature 0 y esfuerzo none sin error).
3. Redesplegar `visita-voz`. Las visitas nuevas guardarán `analisis_modelo = openai/gpt-5.6-luna`.
4. Volver a pasar el banco con lo publicado y anotar el resultado en `RESULTADOS-cortos.md` y en `roadmap.md`.

Sin migraciones. No cambian el prompt, la transcripción, las pantallas ni el guardado.
