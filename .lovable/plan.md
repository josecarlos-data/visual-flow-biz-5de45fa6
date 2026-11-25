# Fase 4.7: que la extracción no invente bloques ni ceros

## Diagnóstico propio, comparado con el tuyo

1. **Competencia ×3 — coincido.** La regla imperativa (línea ~216: «competidor nombrado *o* precio ajeno ⇒ SIEMPRE bloque») y el «OBLIGATORIO» del esquema (~182) disparan un bloque por cada nombre. Además el ejemplo de la regla cita a «Eurorecambios», justo uno de los nombres del caso real. La cabecera de comentarios del fichero (líneas 13–22) repite la regla antigua; la actualizo también.
2. **Seguimiento duplicado — coincido.** La regla de «último recurso» existe, pero deja la puerta abierta («salvo que quede contenido concreto»), y «hacer seguimiento inmediato» se lee como contenido nuevo. Hay que decir expresamente que la próxima acción de otro bloque no es contenido propio.
3. **Precios a 0 — coincido.** `descripcionCampo()` pasa la ayuda de la plantilla tal cual («Si no conseguiste el precio, pon 0»). No hay en el prompt ninguna regla que la corrija. Tú cambias la ayuda en Plantillas; la regla del prompt va por encima, por si la ayuda vuelve a decirlo.
4. **«Taller AD» como contacto — coincido.** No hay ninguna regla sobre qué cuenta como nombre de persona.

**Casos del banco que esperan competencia:** solo «Potencial + competencia (3 baterías)» y dos cortos. Los cortos tienen precios de los dos lados, así que no cambian. En «3 baterías», las baterías de Autorecambios Alboran traen precio del competidor, así que siguen siendo **3 bloques**. Con la regla nueva, «Competencia: Bahía» y «el aceite lo compran a CEPSA» pasan a información potencial, sin bloque. Hoy ya esperamos 3, así que la expectativa no cambia. Ningún caso actual espera competencia sin dato de comparación.

No veo necesario otro enfoque.

## Cambios (solo `supabase/functions/_shared/visita-voz-prompt.ts` y el banco)

- **Competencia:** solo se crea un bloque si hay al menos un dato de comparación con ese competidor: un precio suyo o nuestro, una referencia o producto comparado, o una venta ganada o perdida frente a él. Si solo se nombran proveedores o competidores, no se crea bloque: los datos van a `informacion_potencial`. Si se dice cuál es el principal, va a `proveedor_principal`; si no, los nombres van en observaciones. Cambia en la regla, en el esquema y en el comentario de cabecera. El ejemplo de la regla se mantiene, porque sí trae precios. Añado un contraejemplo con una lista de nombres que no genera ningún bloque.
- **Seguimiento:** no se crea si su contenido ya está en otro bloque. «Va a comparar», «hacer seguimiento» o «llamar la semana que viene» son la próxima acción del bloque al que acompañan.
- **Precios:** regla fija por encima de la ayuda de la plantilla. Si no se dice el precio, el campo queda vacío (null). Solo se pone 0 si el comercial dice expresamente que no lo ha conseguido.
- **Persona de contacto o «quién te ha atendido»:** solo nombres de persona, nunca el nombre del taller, de una red o de una marca (p. ej. «Taller AD»). Como aún no sabemos qué significa, va en observaciones.
- `VERSION_PROMPT = "fase4.7"`.

## Banco

- Añado a `narraciones.json` el caso real de Rafael. Esperado: revisión de seguimiento, promoción ×2, información potencial, 0 bloques de competencia, sin seguimiento.
- Añado al verificador tres comprobaciones que hoy no tiene, solo para los casos que las declaren:
  - cuántas promociones se esperan;
  - que ningún precio sea 0 si el caso espera null;
  - que la persona de contacto no sea un texto prohibido («Taller AD»).
- Guardo `prompt-fase4.6.ts` como referencia, igual que ya existe `prompt-fase4.2.ts`, para poder comparar.
- Ejecuto el banco completo con fase4.6 y con fase4.7, con el modelo actual de extracción (GPT-5.6 Luna), y te doy aciertos por caso y tiempo medio.
- **Me detengo ahí, sin desplegar.** Solo despliego `visita-voz` cuando me des el visto bueno con los resultados delante. Si fase4.7 empeora algún caso que hoy sale bien, te lo digo antes de proponer nada.

## Fuera del alcance

Sin migraciones, sin cambios de modelo, de pantallas ni de guardado, y sin tocar las ayudas de Plantillas (las cambias tú).
