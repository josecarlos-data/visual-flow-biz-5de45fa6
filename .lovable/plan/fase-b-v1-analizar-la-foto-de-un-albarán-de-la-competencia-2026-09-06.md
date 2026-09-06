# Fase B v1 — Analizar la foto de un albarán de la competencia

Un documento por análisis, solo el motivo "competencia". Sin migraciones ni SQL.

## Qué verá el comercial

En la lista de documentos de la visita, cuando una foto tiene asignado el motivo "Competencia" y aún no se ha guardado, aparece un botón "Analizar". Al pulsarlo, la foto se reduce en el móvil, se envía a la IA y se añaden al final de la visita tantos bloques como líneas de artículo tenga el albarán, sin borrar nada de lo ya dictado o escrito. Aviso al terminar: "N líneas extraídas. Revísalas antes de guardar." Todos los campos llegan marcados como poco fiables, para que se revisen uno a uno.

## Cambios

1. **Nuevo `src/lib/imagen.ts`**
   - `reducirImagen(file, maxLado = 1600, calidad = 0.8)`: canvas, escala proporcional solo si el lado mayor supera `maxLado`, exporta a `image/jpeg`. Si el fichero no es imagen (PDF), devuelve el original sin tocar.
   - `aBase64(blob)`: data URL completo vía `FileReader`.

2. **`supabase/functions/_shared/visita-voz-prompt.ts`**: nueva constante `MODELO_VISION`.

3. **`supabase/functions/visita-voz/index.ts` — `chatJson`**: la firma pasa a aceptar `usuario: string | unknown[]` y dos parámetros opcionales `modelo = MODELO_EXTRACCION` y `esfuerzo = "none"`, usados en el cuerpo. Las dos llamadas existentes no se tocan: con los valores por defecto se comportan igual que hoy.

4. **`analizarDocumento(key, imagen, motivoKey, clienteNombre)`** junto a `extraer()`: carga el catálogo, busca el motivo (400 si no existe), esquema `{ bloques: [esquemaBloque(motivo)] }`, system prompt de lectura de albarán de la competencia (una entrada por línea de artículo, nada deducido, referencias alfanuméricas transcritas tal cual sin corregir, evidencia = fragmento literal leído), mensaje de usuario como array de partes con `text` + `image_url`, llamada con `MODELO_VISION` y esfuerzo `"low"`. Filtra cada campo con `valorValido()` y devuelve el mismo formato que `extraer()`: `{ bloques: [{ motivo_key, campos, campos_meta }] }`.
   - La confianza de **todos** los campos devueltos se fuerza a `"baja"`, ignorando la del modelo; un campo relleno sin evidencia recibe igualmente su entrada en `campos_meta` con confianza `"baja"`, para que ninguno escape de la zona de atención.

5. **Enrutado del handler**: `body` se lee primero y la rama `accion === "documento"` se atiende antes del guardián de transcripción (valida que `imagen` empiece por `data:image/`, si no 400). El resto del flujo queda igual.

6. **`src/components/DocumentosVisita.tsx`**: dos props nuevas (`clienteNombre`, `onBloques`). Botón "Analizar" con icono `Wand2` junto al Select de motivo, visible solo si `motivo_key === "competencia"`, hay `file` en memoria y el tipo es imagen. Al pulsar: `reducirImagen` → `aBase64` → `supabase.functions.invoke("visita-voz", { body: { accion: "documento", ... } })`, con spinner y botón deshabilitado mientras dura. Sin bloques en la respuesta: aviso "No se han encontrado líneas en el documento".

7. **`src/pages/NuevaVisita.tsx`**: pasa `clienteNombre` y un `onBloques` que **añade** los bloques al final de `bloques` (nunca reemplaza), cada uno con `uid` nuevo y `manual: false`, y muestra el aviso con el número de líneas.

## Nota técnica sobre el modelo

El id `google/gemini-2.5-flash` propuesto es de una generación anterior y puede no estar servido ya por el gateway. Antes de dejarlo fijo consultaré el catálogo de modelos del gateway y pondré en `MODELO_VISION` el id vigente equivalente (Gemini Flash con entrada de imagen). Si aun así el gateway devuelve 400, el detalle queda en los logs y se ajusta ahí.

## Fuera de alcance

Un solo documento por análisis; solo el motivo competencia; sin tocar la ruta de voz, `transcribir()`, `repreguntar()`, el guardado, `subirDocumentos`, el bucket, ni `motivo_campos`.

## Verificación

Build y typecheck limpios; las dos llamadas existentes a `chatJson` siguen con `MODELO_EXTRACCION` y esfuerzo `"none"`; sin motivo o con motivo distinto no aparece el botón; con una foto real se generan tantos bloques como líneas, todos en zona de atención; los bloques dictados antes siguen ahí.
