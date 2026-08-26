# Eliminar scroll horizontal en la tabla de Documentos en móvil

## Objetivo
Convertir la tabla de `/documentos` en una lista de tarjetas cuando se visualiza en móvil, eliminando el scroll horizontal sin alterar la experiencia de escritorio ni tocar backend.

## Cambios a realizar

### Fase 1: Vista de tarjetas en móvil
- Importar `useIsMobile` desde `@/hooks/use-mobile` en `src/pages/Documentos.tsx`.
- Cuando `isMobile` sea `true`, sustituir el bloque `overflow-x-auto rounded-md border` + `<Table>` por un contenedor `space-y-2` sin scroll ni borde externo, con una tarjeta por documento (`DocumentoListado`).
- Cada tarjeta responderá a `onClick={() => abrirLineas(d)}` para abrir el modal de líneas.
- Estructura de cada tarjeta:
  - Fila 1: fecha + hora a la izquierda (`text-xs text-muted-foreground`), importe a la derecha (`text-sm font-medium tabular-nums`, `text-destructive` si es negativo).
  - Fila 2: nombre del cliente como `<Link>` con `break-words text-sm font-medium hover:underline`, usando el mismo `to` y `onClick={(e) => e.stopPropagation()}` de la tabla. Debajo `#{d.cod_cliente}` en `text-xs text-muted-foreground`.
  - Fila 3: tipo/operación · almacén en `text-xs text-muted-foreground`. Si el importe es negativo y existe `motivo_abono`, mostrarlo en una línea adicional sin truncar.
  - Fila 4: `Registrado por {registrado_por ?? "—"} · {num(lineas)} líneas`, en `text-xs text-muted-foreground`. Si `verMargen` es `true`, añadir ` · margen {eur(d.margen, 2)}`.
- Ningún texto de tarjeta usará `truncate` ni `max-w-*`; usar `break-words` donde sea necesario para garantizar legibilidad completa.
- Cuando `isMobile` sea `false`, conservar exactamente la tabla actual dentro de `overflow-x-auto rounded-md border`.

### Fase 2: Ordenación en móvil
- Al desaparecer las cabeceras ordenables, añadir una fila de control visible solo en móvil justo encima de la lista de tarjetas.
- Fila: `<Select>` con columnas ordenables + `<Button variant="outline" size="sm">` para invertir dirección.
- Opciones del select: `fecha`, `cliente`, `operacion`, `almacen`, `registrado_por`, `lineas`, `importe`.
- `value` del select = `orden`. En `onValueChange` llamar a `setOrden(valor)` y `setDir("desc")` directamente, no usar `ordenar()`.
- Botón de dirección: alterna con `setDir((d) => (d === "desc" ? "asc" : "desc"))`. Mostrar `ChevronDown` si `dir === "desc"`, `ChevronUp` si no. Ambos iconos ya están importados.
- Envolver en `div className="flex items-center gap-2"`.

### Fase 3: Invariantes preservadas
- No modificar filtros, chips, selector de año, panel lateral de filtros, paginación ni el modal `DocumentoLineasDialog`.
- No modificar props de invocación del modal.
- No tocar RPCs, hooks, consultas, paginación ni `supabase/`.

## Verificación
1. `tsgo` limpio y build correcto.
2. A 360 px no debe existir scroll horizontal en la lista de documentos; se deben leer completos el cliente, almacén y registrado por.
3. Pulsar una tarjeta abre el modal de líneas; pulsar el nombre del cliente navega a su ficha sin abrir el modal.
4. El selector de orden cambia el orden de la lista y el botón de dirección lo invierte.
5. En escritorio la tabla se renderiza idéntica a la versión actual.

## Archivo afectado
- `src/pages/Documentos.tsx`
