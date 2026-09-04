# Documentos a nivel de visita

Hoy la única forma de adjuntar una foto es un campo "adjunto" dentro de un bloque, así que un albarán con cuatro referencias obliga a subirlo cuatro veces. Los documentos pasan a colgar de la visita completa: se suben una vez y valen para todos los bloques.

## Qué verá el comercial

- En la pantalla de registro de visita, justo debajo del micrófono, una sección "Documentos de la visita" con dos botones: "Hacer foto" (abre la cámara, una foto) y "Adjuntar archivos" (permite elegir varios, fotos o PDF).
- Cada documento añadido aparece en una fila con su nombre y un botón para quitarlo de la lista.
- Al subir varios se muestra el progreso ("Subiendo 2 de 4…"); si uno falla, aviso y se conservan los que sí subieron.
- En el listado de Visitas, cada visita muestra sus documentos como enlaces con icono de clip que los abren en una pestaña nueva.

## Detalle técnico

Nuevo fichero `src/components/DocumentosVisita.tsx`:
- `export interface DocVisita { path: string; nombre: string; tipo: string; }`
- `export function DocumentosVisita({ documentos, onChange })` — dos inputs separados (foto con `accept="image/*" capture="environment"` de un fichero; adjuntos con `accept="image/*,application/pdf" multiple` sin `capture`, porque en móvil `capture` anula la selección múltiple). Ambos añaden al array existente. Subida secuencial con contador. Quitar solo saca del array, no borra del bucket.
- Ruta de subida idéntica a la del componente `Adjunto` actual: `${user.id}/${crypto.randomUUID()}.${ext}` en el bucket `visitas-adjuntos` (confirmado: la política INSERT exige que la primera carpeta sea el uid).
- `export async function abrirDocumento(path)` — el bucket es privado, así que crea una URL firmada de 60 s con `createSignedUrl` y la abre en pestaña nueva; toast si falla.

`src/pages/NuevaVisita.tsx`:
- Estado `documentos: DocVisita[]`.
- Sección renderizada dentro del mismo `{esEfectiva && ...}` del VoiceRecorder, hermana de la caja de transcripción y antes del acordeón de bloques.
- Al guardar, `campos: {}` (línea ~449) pasa a `campos: documentos.length ? { documentos } : {}`. La columna `campos` jsonb ya existe en `visitas` y hoy siempre se guarda vacía, así que no hace falta migración.

`src/pages/Visitas.tsx`:
- Junto al bloque de observaciones/transcripción, si `(v.campos as { documentos?: DocVisita[] })?.documentos` tiene elementos, una fila de botones con icono de clip que llaman a `abrirDocumento`. El tipo `Visita` ya declara `campos: Record<string, unknown>`, no hay que tocarlo.

Confirmado también que la política SELECT del bucket permite abrir el documento a admin, `director_comercial` y revisores, además del autor.

## Fuera de alcance

No se tocan: el componente `Adjunto` ni el tipo de campo "adjunto", `motivo_campos`, `visita_bloques`, el esquema de la IA, `RevisionVisitas.tsx`. Sin SQL, migraciones ni edge functions. Sin análisis de documentos por IA.

Limitación conocida y aceptada: si se suben documentos y se abandona la visita sin guardar, quedan huérfanos en el almacenamiento (mismo comportamiento que el adjunto actual); se resolverá con una limpieza programada aparte.

## Verificación

- Build y typecheck limpios.
- Un albarán se sube una vez y lo comparten los cuatro bloques de competencia.
- En móvil: "Hacer foto" abre la cámara; "Adjuntar archivos" permite selección múltiple.
- La visita guardada muestra los documentos en el listado y el enlace firmado los abre.
