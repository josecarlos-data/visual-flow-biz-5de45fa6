# Agendar visita desde la ficha + mejoras móviles en Cliente detalle

Solo se tocan `src/hooks/useCrm.ts` y `src/pages/ClienteDetalle.tsx`. Sin migraciones: `visitas_planificadas` ya tiene todas las columnas y el UNIQUE necesarios.

## A) Agendar visita desde la ficha

- `useAgendaMutations().add`: el tipo del parámetro pasa a incluir `notas?: string | null`, que se envía en el insert. Nada más cambia, así que Agenda.tsx sigue funcionando igual.
- Nuevo hook `useProximaPlanificada(codCliente)`: consulta `visitas_planificadas` con `cod_cliente` y `fecha >= hoyISO()`, orden ascendente por fecha, `limit 1`, devuelve la fila o `null`. `queryKey: ["crm_agenda", "proxima", codCliente]` para que lo refresque el `invalidate()` existente.
- Botón "Agendar" (`variant="outline"`, icono `CalendarPlus`) junto a "Nueva visita". Abre un Dialog con atajos Hoy / Mañana / Otra fecha (este último revela un `Input type="date"`), un `Textarea` opcional "Motivo de la visita (opcional)" con `rows={3}` que se guarda en `notas`, y botón Guardar.
- Fechas siempre en hora local, con el mismo criterio que `hoyISO()` (`getFullYear`/`getMonth()+1`/`getDate()` con `padStart`). Nunca `toISOString()`. Para Mañana, `setDate(d.getDate() + 1)` sobre una fecha local antes de formatear.
- `user_id` desde `useAuth()`, igual que en Agenda.tsx.
- Antes del insert se cuentan las filas de ese `user_id` y esa `fecha` y se inserta con `orden = conteo + 1`.
- Error `23505`: toast "Este cliente ya está en tu agenda del {fecha}". Cualquier otro error: toast destructive.
- Si hay próxima planificada, bajo la línea de metadatos aparece un `Badge variant="secondary"` con icono `CalendarCheck`: "Agendado para el {fecha corta}" y, si hay notas, " · {notas}" truncado. El botón Agendar sigue activo.

## B) Cabecera en móvil

Los dos botones se agrupan en un div `flex w-full gap-2 sm:w-auto sm:shrink-0`, cada botón con `flex-1 sm:flex-none`. En móvil se renderiza justo después del `<h1>`, sus metadatos y el badge de agendado, antes del bloque de situación; en `sm`+ queda arriba a la derecha como ahora.

## C) Rejilla de KPIs

- Orden nuevo: "Última compra", "Última visita", "Ventas {anioActual}", "Variación vs. {anioPrevio}", y el resto detrás en su orden actual.
- Sin Radix Collapsible (desmontaría las tarjetas en escritorio). Se usa `useState<boolean>` `kpisAbiertos` (false), un `<button type="button" className="col-span-2 sm:hidden ...">` dentro del grid con texto "Ver todas las métricas" y un `ChevronDown` con `className={kpisAbiertos ? "rotate-180" : ""}`, y las tarjetas de la quinta en adelante envueltas en `<div className={kpisAbiertos ? "contents" : "hidden sm:contents"}>`.
- Clases del grid: `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6`.

## D) Pestañas

- Orden: Resumen, Visitas, Productos, Documentos, Perfil, Análisis IA. Mismos `value` y `defaultValue="resumen"`.
- Etiquetas cortas en móvil con `<span className="sm:hidden">` / `<span className="hidden sm:inline">`: Productos→"Product.", Documentos→"Docs.", Análisis IA→"IA".

## E) Tabla de Documentos

- "Fecha": fecha en la primera línea y una segunda línea `text-xs text-muted-foreground sm:hidden` con nº documento · tipo (`d.operacion ?? d.tipo_documento`) · canal.
- "Documento", "Tipo", "Canal": `hidden sm:table-cell`. "Registrado por" y "Líneas": `hidden md:table-cell`. Mismas clases en `TableHead` y `TableCell`.
- "Importe" siempre visible. Se quita `overflow-x-auto` del `CardContent` de esa tabla.

## Fuera de alcance

Contenido de las tarjetas KPI, lógica de `verMargen`, pestaña Productos, `DocumentoLineasDialog` y `Agenda.tsx`.

## Verificación

`tsgo` limpio y build correcto. A 411 px: los dos botones arriba, las once tarjetas reaparecen al pulsar "Ver todas las métricas", tabla de documentos sin scroll horizontal. A ~1000 px: todas las tarjetas visibles y sin botón de despliegue.
