Ajustar la pestaña "Visitas" de `src/pages/ClienteDetalle.tsx` para evitar mostrar el mismo texto tres veces en visitas importadas de Gespromo.

Problema actual
- En visitas importadas de Gespromo con bloques estructurados, `v.observaciones` aparece como párrafo suelto y, dentro del desplegable, `v.observaciones_original` se muestra con una etiqueta similar. Aunque difieran en una línea inicial, el usuario percibe contenido duplicado.
- El resultado es que el mismo texto aparece hasta tres veces: bloques estructurados, observaciones sueltas y texto original del desplegable.

Cambios en `src/pages/ClienteDetalle.tsx` (pestaña `TabsContent value="visitas"`)
1. Dentro del `map` de `visitas`, ya existe `const bloques = bloquesMap?.get(v.id) ?? []`. Utilizarlo para decidir qué renderizar:
   - Si `bloques.length > 0`:
     - No renderizar el párrafo suelto `{v.observaciones && <p>…</p>}`.
     - Se mantienen los bloques estructurados y el `Collapsible` de texto original.
   - Si `bloques.length === 0`:
     - Renderizar `v.observaciones` como en la versión actual.
     - No renderizar el `Collapsible` en absoluto: sin análisis estructurado no hay nada que contrastar.
2. Mantener la lógica del `Collapsible` sin cambios, salvo la condición de renderizado:
   - Renderizar el `Collapsible` si existe contenido original: `v.transcripcion` con valor, o `v.observaciones_original` con valor. Ya no se compara con `v.observaciones` porque, tras el punto 1, `v.observaciones` no se pinta cuando hay bloques, por lo que la duplicación que evitaba la comparación ya no puede producirse.
   - Etiquetas: "Transcripción original" si existe `v.transcripcion`; si no, "Texto original de Gespromo".
   - Conservar el estilo exacto y la trazabilidad de modelo/prompt.

Restricciones
- No tocar bloques, badges de motivo, badge "Importada de Gespromo", `nota_revision`, trazabilidad de modelo/prompt ni el origen del desplegable.
- No modificar hooks, SQL, RPC ni otros ficheros.
- No se necesitan cambios de tipado: `observaciones_original` ya está declarada en el interface `Visita`.

Verificación
- `tsgo` sin errores.
- Build correcto.
