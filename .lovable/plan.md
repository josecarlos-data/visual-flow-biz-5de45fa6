# Rediseño de layout móvil en NuevaVisita.tsx

Objetivo: eliminar las 5-6 pantallas de scroll antes del micrófono en móvil. Solo estructura visual y jerarquía — no se toca lógica de estado, guardado, análisis IA, repregunta ni validaciones.

## Cambios

### 1. Cabecera (líneas ~414-459)
- Eliminar la Card "1. Datos de la visita" como bloque expandido.
- Bajo el título, directamente el selector de cliente actual: el buscador con su lista cuando no hay cliente; la fila nombre/#código/Cambiar cuando lo hay. Sin Card ni Label "Cliente".
- Subtítulo acortado a: "Cuéntala y la IA la reparte en bloques".

### 2. Tipo / Resultado / Fecha → resumen plegado
- Envolver los tres campos en un `Collapsible` cerrado por defecto (`open` controlado por estado nuevo `detallesAbiertos`).
- Trigger: una fila de texto pequeño con los valores actuales separados por "·", p.ej. "Cliente · Efectiva · hoy", con `ChevronDown` a la derecha que rota al abrir.
- La fecha muestra "hoy" si `fecha === hoyISO()`; si no, formato dd/MM.
- Al abrir: los tres campos tal como están hoy (grid Tipo/Resultado, aviso de "sin bloques", input Fecha).
- Auto-apertura: si `resultado !== "efectiva"`, el Collapsible se abre solo (useEffect que pone `detallesAbiertos = true` al cambiar resultado), para que se vea el aviso "se registra sin bloques".

### 3. Micrófono primero
- Mover el bloque `{esEfectiva && (…)}` del VoiceRecorder (líneas 569-649) inmediatamente después del Collapsible de detalles y del aviso `avisoCliente`, antes de la chuleta.
- Quitar el CardHeader "2. Cuenta la visita" y la numeración: ya no hay pasos.
- El VoiceRecorder queda como elemento suelto centrado, sin Card contenedora, con algo más de aire vertical (py-2).
- "Lo que he entendido", `errorExtraccion` y `avisosRef` siguen justo debajo, sin cambios de contenido.

### 4. Chuleta → Sheet lateral
- Eliminar el bloque Card+Collapsible "Antes de grabar: qué no dejarte" (líneas 535-567).
- Sustituir por un `Button variant="ghost" size="sm"` con icono `Lightbulb` y texto "Qué pide el director", centrado bajo el micrófono. Solo visible si `esEfectiva`.
- Abre un `<Sheet side="bottom">` (shadcn) con estado `chuletaAbierta`.
- Dentro del Sheet: el párrafo introductorio actual, y los `motivosActivos` como `<Accordion type="single" collapsible>`: un item por motivo, trigger = `m.nombre`, contenido = `m.descripcion` + lista de campos `requerido_validacion`. Todos cerrados al abrir el Sheet. Contenido con scroll si excede (max-h).

### 5. Observaciones y "Añadir bloque"
- Si `esEfectiva`: ocultar el botón "Añadir otro bloque" y la Card de Observaciones tras un único botón ghost "+ Añadir detalle" al final. Al pulsarlo (`detalleAbierto = true`) se despliega en su sitio: el botón "Añadir otro bloque" y el Textarea de Observaciones sin Card, con Label pequeño.
- Si NO `esEfectiva`: el Textarea de Observaciones se muestra siempre, expandido, sin botón intermedio (es el único campo que queda). Sin Card, con Label pequeño.

### 6. General
- `space-y-4` → `space-y-3` en el contenedor raíz.
- Barra fija inferior de Guardar sin cambios.
- Sin cambios de colores ni tema.

## Estado nuevo (solo presentacional)
- `detallesAbiertos: boolean` (Collapsible tipo/resultado/fecha).
- `chuletaAbierta: boolean` (Sheet).
- `detalleAbierto: boolean` (bloque "+ Añadir detalle").

## Imports nuevos
- `Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger` de `@/components/ui/sheet`.
- `Accordion, AccordionContent, AccordionItem, AccordionTrigger` de `@/components/ui/accordion`.
- `ChevronDown` de lucide-react. Quitar `Card`/`CardHeader`/`CardTitle` si dejan de usarse (los bloques de visita y repregunta siguen usando Card).

## Intocable
- Toda la lógica de estado de voz (`procesarVisita`, `analizarTranscripcion`, `responderRepregunta`), `guardar`, validaciones, `marcarPlanificadaRealizada`, y el contenido interno de bloques/repregunta.

## Verificación
- `tsgo` + build.
- Playwright a 360-411px: captura inicial mostrando cliente + resumen plegado + micrófono visibles sin scroll; Collapsible abierto; Sheet de chuleta abierto; resultado "cliente_ausente" con textarea visible y Collapsible auto-abierto.
