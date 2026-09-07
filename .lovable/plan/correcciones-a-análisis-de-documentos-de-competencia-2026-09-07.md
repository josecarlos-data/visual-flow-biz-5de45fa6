# Correcciones a análisis de documentos de competencia

Dos ajustes de usabilidad y robustez, más una limpieza menor. Sin SQL ni migraciones.

## Qué se corrige

1. **Evitar el doble análisis de un mismo documento**
   - En `src/components/DocumentosVisita.tsx` se añade `analizado?: boolean` a `DocVisita`.
   - Cuando `analizar()` termina con éxito y devuelve bloques, se marca ese documento como `analizado: true` vía `onChange`.
   - El botón "Analizar" pasa a estar deshabilitado y muestra el texto "Analizado" cuando `d.analizado` es true.
   - Si el comercial quita el documento y lo vuelve a adjuntar, es un objeto nuevo y el botón vuelve a estar disponible.

2. **La reducción de imagen no debe fallar en silencio**
   - En `src/lib/imagen.ts`, `reducirImagen` devuelve hoy el fichero original si la carga en `<img>` falla. Eso hace que fotos HEIC de iPhone se envíen enteras (~6,7 MB) sin aviso.
   - Nuevo contrato: si `file.type` empieza por `image/` y la reducción falla, la función lanza un error con el mensaje "No se ha podido procesar esta imagen. Puede estar en formato HEIC; prueba a hacer la foto desde la propia aplicación."
   - Los PDFs u otros no-imagen siguen devolviendo el fichero tal cual, sin error.
   - El `try/catch` de `analizar()` en `DocumentosVisita.tsx` ya recoge el error y lo muestra en un toast destructivo; no hace falta tocar más allá.

3. **Limpieza**
   - En `src/components/DocumentosVisita.tsx` hay una doble línea en blanco tras la función `analizar()`. Se elimina.

## Fuera de alcance

No se toca la edge function `visita-voz`, la ruta de voz, el guardado de visitas ni `src/pages/NuevaVisita.tsx`.

## Verificación

- Build y typecheck limpios.
- Analizar un documento y volver a pulsar el botón: queda deshabilitado y pone "Analizado".
- Un PDF con motivo "Competencia" sigue sin mostrar el botón "Analizar".
- Una imagen HEIC sin soporte de decodificación muestra el toast de error en lugar de enviarse entera.
