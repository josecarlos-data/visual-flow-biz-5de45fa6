# Documentos de visita: subir solo al guardar

Hoy la foto se sube en el instante de elegirla. Si el comercial se arrepiente o abandona la visita, el fichero se queda en la nube para siempre. A partir de ahora los documentos se quedan en el móvil y solo viajan a la nube cuando se guarda la visita.

## Qué cambia para el comercial

- Elegir una foto o un archivo es instantáneo: no hay subida ni espera.
- Si añade dos veces el mismo documento, aviso "Este documento ya está en la lista" y no se duplica (se compara el contenido, no el nombre, porque los móviles repiten IMG_0001).
- Cada documento puede llevar, opcionalmente, un motivo asignado desde una lista pequeña en su fila.
- Al guardar la visita se suben todos con una barra de progreso. Si uno falla, aviso con el nombre del archivo y la visita NO se crea; los documentos siguen en pantalla para reintentar.
- Quitar un documento antes de guardar no deja rastro en la nube.

## Detalle técnico

`src/components/DocumentosVisita.tsx`
- `DocVisita` pasa a `{ file?: File; path?: string; nombre_original: string; tipo: string; tamano: number; hash: string; motivo_key: string | null }`.
- Al seleccionar: `crypto.subtle.digest("SHA-256", await file.arrayBuffer())` → hash hex; si ya está en el array, toast y descarte. Sin subida.
- Nueva `export async function subirDocumentos(docs, userId, fecha, codCliente, onProgreso?: (hecho: number, total: number) => void): Promise<DocVisita[]>`: nombre `${userId}/visita_${fecha sin guiones}_${codCliente}_${i}_${4 hex}.${ext}` en el bucket `visitas-adjuntos` (la primera carpeta sigue siendo el uid, lo exige la política INSERT). `onProgreso` se invoca antes de cada fichero. Devuelve los docs con `path` y sin `file`; ante error lanza excepción con el nombre del fichero (nada de `break` silencioso).
- Cada fila añade un Select con `useMotivos()` filtrado por `is_active` más opción "Sin asignar". Sin casilla de análisis IA.

`src/pages/NuevaVisita.tsx`
- Estado nuevo `subiendoDocs: { hecho: number; total: number } | null`, pasado como `onProgreso`; mientras no sea null el botón de guardar muestra "Subiendo documentos 2 de 4…". Vuelve a null al terminar o fallar.
- En `guardar()`, tras `setSaving(true)` y antes del insert (línea ~438): `try { docsSubidos = documentos.length ? await subirDocumentos(documentos, user.id, fecha, codCliente, (h, t) => setSubiendoDocs({ hecho: h, total: t })) : [] } catch { toast + setSubiendoDocs(null) + setSaving(false) + return }`.
- Línea 451 pasa a `campos: docsSubidos.length ? { documentos: docsSubidos } : {}`.

`src/pages/Visitas.tsx`
- Filtra por `d.path` y la etiqueta es `d.nombre_original ?? (d as { nombre?: string }).nombre ?? d.path.split("/").pop()`, para que las visitas guardadas antes de este cambio (que llevan `nombre`) sigan mostrando el nombre. `nombre_original` se declara opcional en `DocVisita` si hace falta para compilar. Sin migración de datos.


`src/lib/motivoCampos.ts`
- Se quita `{ value: "adjunto", label: "Foto o documento" }` de `TIPOS_CAMPO` para que el diseñador no cree campos nuevos de ese tipo. Se MANTIENE el `case "adjunto"` y el componente `Adjunto` en `CampoVisita.tsx`, porque puede haber campos ya creados en `motivo_campos` y visitas antiguas con rutas guardadas.

## Fuera de alcance

Sin SQL, migraciones ni edge functions. No se toca `RevisionVisitas.tsx`. Los ficheros huérfanos ya subidos se limpian a mano. Sin análisis de documentos por IA.

## Verificación

- Build y typecheck limpios.
- Elegir cuatro fotos y salir sin guardar: nada en la nube.
- Misma foto dos veces: la segunda se rechaza con aviso.
- Al guardar: aparecen como `visita_AAAAMMDD_cliente_n_xxxx.ext` dentro de la carpeta del uid, y el botón muestra el progreso de subida.
- Una visita guardada antes de este cambio sigue mostrando el nombre de sus documentos.
- El diseñador ya no ofrece "Foto o documento"; una plantilla que ya lo tenga se sigue pintando.
