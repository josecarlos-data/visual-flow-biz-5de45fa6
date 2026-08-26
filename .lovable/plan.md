# Fase 2 del rediseño móvil: bloques de visita

Solo jerarquía visual en `src/pages/NuevaVisita.tsx` (render de bloques, líneas ~689-747) y dos recortes en `src/components/CampoVisita.tsx`. Sin tocar guardado, análisis IA, repregunta ni validaciones.

## 1. Bloques como acordeón

- Sustituir el `bloques.map` de Cards por un único `<Accordion type="multiple" value={bloquesAbiertos} onValueChange={setBloquesAbiertos}>`, un `AccordionItem` por bloque con `value={b.uid}`.
- Trigger: `motivoDe(b.motivoKey)?.nombre` (fallback "Sin motivo") + `Badge` de estado a la derecha:
  - `Listo` (variant secondary) si `pendientesDe(b).length === 0` y ningún campo visible tiene `b.meta[key]?.confianza === "baja"`.
  - `Faltan N` (ámbar) si `pendientesDe(b).length > 0`.
  - `Revisar` (ámbar) si no faltan pero hay confianza baja.
- Añadir helper `bloqueantesDe(b)` junto a `pendientesDe`, que filtre `camposVisibles(motivo.campos)` por `c.is_required && !b.valores[c.campo_key]?.trim()`.
- Zona A = `bloqueantesDe(b) ∪ pendientesDe(b) ∪ campos con meta.confianza === "baja"`, sin duplicados y en el orden de `camposVisibles`.
- `estadoDe` devuelve `"faltan"` si `bloqueantesDe(b).length > 0` o `pendientesDe(b).length > 0`, `"revisar"` si no faltan pero hay confianza baja, `"listo"` en caso contrario.
- No se toca `pendientesDe` ni la lógica de `guardar`.

## 2. Apertura automática

- Estado nuevo `bloquesAbiertos: string[]`.
- En los dos puntos donde la IA fija bloques (`analizarTranscripcion`, línea ~209, y el reintento del bloque de transcripción, línea ~624), tras `setBloques(...)` fijar `setBloquesAbiertos` con los uid cuyo `estadoDe` no sea `"listo"`.
- Al crear bloque a mano (`nuevoBloque`, botones "Añadir bloque a mano" / "Añadir otro bloque" y fallback de error), añadir su uid a `bloquesAbiertos`.
- Al borrar un bloque, quitar su uid de la lista.

## 3. Dos zonas dentro del bloque

- Zona A (siempre visible, sin cabecera): campos que necesitan atención = `bloqueantesDe(b) ∪ pendientesDe(b) ∪ campos visibles con meta.confianza === "baja"`, sin duplicados, en el orden de `camposVisibles`.
- Zona B (plegada): el resto de campos visibles, dentro de un `Collapsible` con trigger de texto pequeño "Ver los otros N campos" y `ChevronDown` que rota.
  - El `Select` de Motivo (+ `motivo.descripcion`) se mueve al principio de la Zona B.
  - Si Zona A está vacía, la Zona B arranca abierta (estado por uid en un `Record<string, boolean>` local del componente de página, inicializado según ese criterio).

## 4. Aviso redundante

Eliminar el párrafo "Se puede guardar, pero para que el director la dé por válida faltan: …" (líneas 739-743). El badge del trigger ya lo comunica. La tarjeta de repregunta queda intacta.

## 5. CampoVisita.tsx

- `campo.ayuda` solo se renderiza si `valor === ""`.
- La cita `«…»` solo se renderiza si `dudoso` (confianza baja); con confianza normal sigue accesible en el `title` del badge "IA · …".
- Nada más cambia en ese fichero.

## Detalles técnicos

- Reutilizar `Accordion*` y `Collapsible*` ya importados en el fichero.
- `estadoDe` y la lista de campos "de atención" se calculan en render, sin memo nuevo, igual que hoy `pendientesDe`.
- `Card`/`CardHeader`/`CardTitle` siguen usándose en la repregunta, así que los imports se mantienen.

## Verificación

- `tsgo` + build.
- Playwright a 411 px con tres bloques simulados (uno completo, uno con campos requeridos vacíos y uno con confianza baja): captura mostrando que solo los dos últimos aparecen abiertos, con badges "Listo" / "Faltan N" / "Revisar" correctos y sin scroll horizontal.
