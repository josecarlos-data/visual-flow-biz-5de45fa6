Modificar la pestaña "Visitas" de `src/pages/ClienteDetalle.tsx` para mostrar el texto original de cada visita en un `Collapsible`.

Cambios en `src/pages/ClienteDetalle.tsx`:
1. Importar `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` desde `@/components/ui/collapsible` y `ChevronDown` de `lucide-react`.
2. Dentro del mapeo de `visitas` en `TabsContent value="visitas"`, al final de cada tarjeta de visita, después del bloque `{v.observaciones && ...}` y antes del badge `Importada de Gespromo`, añadir un componente `Collapsible` que cumpla:
   - Solo renderizarse si hay contenido original que mostrar: `v.transcripcion` con valor, o `v.observaciones_original` con valor distinto de `v.observaciones`.
   - Cerrado por defecto.
   - Disparador: un botón de texto pequeño con el texto "Ver texto original" y un icono `ChevronDown` que rote al abrirse.
   - Contenido:
     - Si `v.transcripcion` existe: etiqueta "Transcripción original".
     - Si no, y `v.observaciones_original` existe y es distinto de `v.observaciones`: etiqueta "Texto original de Gespromo".
   - Mostrar el texto en un bloque con las clases exactas de `RevisionVisitas.tsx` línea 377: `rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground`, y añadir `whitespace-pre-wrap` para respetar saltos de línea.
   - Si existen `v.analisis_modelo` o `v.analisis_prompt_version`, mostrarlos debajo en `text-[11px] text-muted-foreground` con el formato "Analizada con {modelo} · {version}".
   - No incluir ningún botón de reanalizar.

Nota de tipado: el interface `Visita` en `src/hooks/useCrm.ts` no declara `observaciones_original`. Si la columna existe en la base de datos, `select("*")` la devuelve en runtime, pero para evitar errores de TypeScript se añadirá la propiedad `observaciones_original?: string | null` al interface `Visita` sin cambiar la consulta del hook.

Verificación: `tsgo` sin errores y build correcto.
