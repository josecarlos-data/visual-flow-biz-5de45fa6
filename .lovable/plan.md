# Extracción fiable con dictados cortos: medición y propuesta

## Conclusión
El fallo **no es del modelo, es del prompt**. Ninguna configuración (tampoco el modelo anterior) crea bloques de **Promoción / Oferta**. La causa es la descripción de ese motivo que se envía a la IA: «Vale si la oferta está en sistema y consta referencia, cantidad, precio y por qué canal se envió». Es el criterio del revisor, pero la IA lo lee como requisito para crear el bloque. Si en el dictado falta alguno de esos datos, devuelve todas las listas vacías.

## Medición (banco, prompt fase4.5, 11 casos × 5 ejecuciones por configuración)

| Configuración | Bloques esperados | Cero bloques (sin contar «no estaba») | Latencia media / p90 | Coste por extracción |
|---|---|---|---|---|
| gpt-6-luna, esfuerzo none (actual) | 58 % | 26 % | 6,3 s / — | 0,0059 créditos |
| gpt-6-luna, esfuerzo low | 73 % | 0 % | 9,7 s / 20,2 s | 0,0065 créditos |
| gpt-5.6-luna, esfuerzo none (anterior) | 73 % | 10 % | 2,9 s / 6,6 s | 0,0122 créditos |
| gemini-3.8-flash, esfuerzo low (alternativa) | 91 % | 0 % | 5,6 s / 9,4 s | 0,0484 créditos |
| **gpt-6-luna none + prompt corregido** | **100 %** | **0 %** | 6,4 s / 15,4 s | 0,0063 créditos |
| gpt-6-luna low + prompt corregido | 96 % | 0 % | 12,7 s / 25,7 s | 0,0065 créditos |

- **Alternativa elegida:** Gemini 3.8 Flash, porque tiene retención cero, ya se había comprobado para visión y admite el formato de respuesta estricto. Es la que mejor sale sin tocar el prompt, pero cuesta unas 8 veces más.
- **gpt-5.6-luna:** la pasarela la sigue sirviendo. No está marcada como obsoleta y no tiene fecha de retirada anunciada.
- **Cero bloques:** en todos los casos con cero bloques (13 con el actual), el modelo devuelve **todas las listas vacías**. Ninguno se debe a bloques descartados después por no tener campos válidos. Salida cruda de «fecha_relativa» con la configuración actual:
  `{"resultado_visita":"efectiva","bloques_seguimiento":[],"bloques_promocion":[],"bloques_revision_seguimiento":[],"bloques_competencia":[],"bloques_gsmart":[],"bloques_viaje_incentivo":[],"bloques_informacion_potencial":[],"bloques_incidencia":[]}`
- **Casos que fallan en todas las configuraciones salvo con el prompt corregido:**
  - «oferta corta» (en la actual, 0 de 5 y siempre sin bloques).
  - «dos motivos» (sale competencia, nunca promoción).
  - «Icer / plan de choque» (nunca promoción).
- **Con el prompt corregido**, los dictados de oferta salen como Promoción. Promoción no tiene campo de fecha, así que «le llamo el martes» queda como texto en Próxima acción y no se rellena la fecha. Cuando sale como Seguimiento, la fecha es correcta (17/11) en todas las ejecuciones.

## Base de datos (solo lectura): visitas de la app desde el 10/11 a las 11:46
- **Total:** 15 visitas.
  - 2 con gpt-5.6-luna (fase4.4).
  - 11 con gpt-6-luna fase4.4 y 2 con gpt-6-luna fase4.5.
- **Efectivas:** 12, todas con al menos un bloque.
- **Efectivas sin ningún bloque de voz:** 2, las dos con gpt-6-luna, y el comercial añadió el bloque a mano. Las dos eran **ofertas**:
  - 10/11 14:07, pastillas en promoción.
  - 11/11 09:27, baterías de 70 amperios.
- **No efectivas:** 3, como cliente ausente y sin bloques. Una de ellas, la del 10/11 16:19, contaba un dato útil: «ahora están sin mecánico».

## Propuesta: cambio mínimo (se mantiene el modelo gpt-6-luna con esfuerzo none)
Solo en `supabase/functions/_shared/visita-voz-prompt.ts`, versión **fase4.6**:
1. **Descripción de Promoción para la IA:** una frase fija en el código («Una oferta o promoción que el comercial presenta, deja o envía al cliente, aunque falten referencia, cantidad o precio») sustituye a la descripción de la plantilla. La descripción de la base de datos no cambia: sigue siendo el criterio que ve el revisor.
2. **Regla nueva en el prompt:** «Crea el bloque en cuanto haya un asunto real de ese motivo, aunque falten datos; los campos que no se digan van a null».
3. **Antes de publicar:** vuelvo a pasar el banco con solo estos dos cambios, porque la variante medida también tocaba la descripción de Seguimiento. Si baja del 100 %, añado también la de Seguimiento y te lo enseño.
4. **Banco:** guardo en `scripts/bench-visita-voz` los 5 dictados cortos y el criterio de «bloques esperados», para repetir la medición en cada cambio de prompt.

No hay migraciones. No cambian el modelo, las pantallas, el guardado ni la lectura de documentos.

## Para decidir aparte (fuera de este cambio)
- ¿Quieres que la oferta con «le llamo el martes» cree también un Seguimiento con la fecha? Ahora mismo la regla del prompt lo impide, porque Seguimiento solo se crea si no hay otro bloque.
- El resto de motivos también tienen descripciones del tipo «Vale si…». Hoy no fallan, pero conviene separar en el futuro «cuándo usar el motivo» (para la IA) de «cuándo vale» (para el revisor).
