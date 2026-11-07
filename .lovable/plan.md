# Visor de fotos y documentos de visita

## 1. Diagnóstico propio (revisado en el código)

Confirmo lo descrito y añado lo que he encontrado:

- **Ficha del cliente** (`ClienteDetalle.tsx` ~962–980): los campos se pintan con `String(val)`. Además de la ruta y la línea «…_nombre», las listas de opciones (multiselección) salen como «a,b» sin espacio y los objetos como «[object Object]». Los documentos de la visita completa no salen nunca en visitas con bloques.
- **Revisión** (`RevisionVisitas.tsx`, `camposOrdenados` l.271, `fmt` l.280): ruta como texto y `campos.documentos` como JSON. El revisor —quien más necesita ver la foto— no puede abrirla.
- **Visitas** (`Visitas.tsx` l.149 → `abrirDocumento`): firma la URL y *después* hace `window.open`. En iPhone/Safari, abrir una pestaña tras una espera suele quedar bloqueado como ventana emergente: lo único que "funciona" hoy probablemente falla en el móvil. Y 60 s de validez es poco si la red va lenta.
- **Mis revisiones**: no muestra campos; no lo cambio.
- **Permisos del bucket** (0014): lectura solo para dueño de la carpeta, admin, director y quien puede revisar. Un jefe de zona o un comercial que ve en la ficha la visita de otro verá el botón, pero no podrá abrir el archivo.
- **Formato**: los adjuntos de campo se suben sin reducir; una foto HEIC hecha desde la galería del iPhone no se puede mostrar en Chrome/Android. El visor debe contemplarlo en vez de enseñar una imagen rota.
- **Plantilla cambiada**: si se borró o cambió el tipo de un campo, la definición de plantilla ya no dice que era adjunto y volvería a salir la ruta.

## 2. Comparación con la propuesta de Claude

| Punto | Coincido | Matiz / mejora |
|---|---|---|
| Componente único `VisorAdjunto` en diálogo, pantalla completa en móvil | Sí | — |
| Firmar al abrir, no al pintar | Sí | Además: validez ~10 min y volver a firmar si caduca. Así «Abrir en otra pestaña» y «Descargar» son enlaces ya firmados, sin espera, y no los bloquea el iPhone. Corrige de paso el fallo de la lista de Visitas. |
| Imagen ajustada con zoom | Sí | Zoom sencillo (tocar para ampliar/arrastrar) con un fallback: si la imagen no carga (HEIC u otro), mostrar «No se puede previsualizar este formato» + Descargar, no un icono roto. |
| PDF incrustado; en iPhone, otra pestaña | Sí | En iPhone el visor incrustado solo enseña la primera página: detectarlo y mostrar directamente el botón. |
| Mensaje de permiso | Sí | Distinguir «No tienes permiso» de «El archivo ya no existe» (fallo distinto, mensaje distinto). |
| Reconocer adjuntos por la plantilla | Sí, como criterio principal | Se queda corto: añadir respaldo cuando la plantilla ya no lo define, solo si existe la pareja `clave` + `clave_nombre` y la ruta empieza por un identificador de usuario. Sin esto, campos de plantillas modificadas vuelven a salir como ruta. |
| Ocultar «…_nombre» | Sí | — |
| Usar en ficha, Revisión y Visitas; documentos de visita en la ficha | Sí | Añadir Revisión también para `campos.documentos` (hoy sale JSON). Aprovechar la misma función de formato para que listas y sí/no salgan legibles en la ficha (hoy «a,b»). |
| Sin miniaturas | Sí | — |
| Sin cambios de base de datos | Sí, en este paso | El hueco de permisos (jefe de zona / otro comercial) es real; lo dejo como recomendación aparte, sin aplicar. |

Error de Claude a corregir: da por bueno el comportamiento actual de la lista de Visitas como «el único sitio donde se puede abrir algo»; en iPhone probablemente tampoco abre.

## 3. Plan final

### Imprescindible
1. **`VisorAdjunto`** (nuevo): recibe ruta, nombre, tipo y tamaño opcionales. Diálogo a pantalla completa en móvil. Firma al abrir (10 min, re-firma si caduca). Imagen con zoom y fallback de formato; PDF incrustado salvo iPhone; otros: nombre, tamaño, Descargar. Siempre «Abrir en otra pestaña» y «Descargar» (con el nombre original). Mensajes claros de permiso o archivo inexistente.
2. **Función común de presentación de campos** (nuevo fichero de ayuda): dada una visita/bloque y la definición de plantilla, devuelve filas de texto legible o adjuntos; detecta adjuntos por plantilla + respaldo descrito; oculta `…_nombre` y `documentos`; extrae `campos.documentos` como lista de adjuntos.
3. **Ficha del cliente**: botón con icono y nombre («foto.jpg») en lugar de la ruta; documentos de la visita siempre, con o sin bloques.
4. **Revisión**: igual en cada bloque y documentos de la visita en lugar del JSON.
5. **Visitas**: los documentos abren el visor en lugar de pestaña nueva.

### Recomendable (mismo cambio, bajo coste)
- Listas y sí/no legibles en la ficha con la misma función.
- Tamaño mostrado cuando se conozca (documentos de visita).

### Recomendable (aparte, no se aplica)
- Permisos de lectura: permitir abrir el adjunto a quien puede ver esa visita (p. ej. jefe de zona de su delegación). Requiere cambio de permisos; lo planteo solo si lo pides.
- Reducir también las fotos de campo al subirlas (fuera de alcance).

### No se toca
Base de datos, permisos del bucket, subida de archivos, biblioteca de ficheros, Mis revisiones, IA.

## Pruebas
Con el comercial de prueba (Bautista): visita PRUEBA en domingo, sin cliente real, con una foto en un campo y un PDF como documento de visita. Comprobar en móvil (411 px) y escritorio: ficha, Revisión y Visitas; imagen, zoom, PDF, Descargar, otra pestaña, y mensaje de permiso con una cuenta sin acceso si la hay de prueba. Borrar visita y archivos al acabar. Nunca cuentas reales.

## Detalles técnicos
- Ficheros: nuevo `src/components/VisorAdjunto.tsx`, nuevo `src/lib/camposVisita.ts`; cambios en `ClienteDetalle.tsx`, `RevisionVisitas.tsx`, `Visitas.tsx`; `abrirDocumento` queda sin usar (se retira o se deja como envoltorio).
- Firma: `createSignedUrl(path, 600)` y otra con `{ download: nombre }` para Descargar.
- Tipo: por `DocVisita.tipo` o extensión del nombre.
- Detección iPhone: user agent iOS → sin iframe para PDF.
