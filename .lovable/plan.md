# Ficha de cliente: agendar visita y ajustes de layout móvil

Sin migraciones: `visitas_planificadas` ya tiene todas las columnas y el UNIQUE necesarios.
Ficheros afectados: `src/hooks/useCrm.ts` y `src/pages/ClienteDetalle.tsx`.

## A) Agendar visita desde la ficha

- `useAgendaMutations().add`: ampliar el tipo del parámetro con `notas?: string | null` y pasarlo al insert. Sin más cambios (Agenda.tsx sigue igual).
- Nuevo hook `useProximaPlanificada(codCliente)`: consulta `visitas_planificadas` con `cod_cliente` y `fecha >= hoyISO()`, orden ascendente por fecha, `limit 1`, devuelve la fila o `null`. `queryKey: ["crm_agenda", "proxima", codCliente]`.
- En la ficha, junto a "Nueva visita", botón "Agendar" (`variant="outline"`, icono `CalendarPlus`) que abre un Dialog con:
  - atajos Hoy / Mañana / Otra fecha (esta última revela un `<Input type="date">`),
  - Textarea opcional "Motivo de la visita (opcional)" (`rows=3`) que se guarda en `notas`,
  - botón Guardar.
  - `user_id` desde `useAuth()`.
- Antes del insert se cuenta cuántas filas hay para ese `user_id` y esa fecha; se inserta con `orden = conteo + 1`.
- Error `23505`: toast informativo "Este cliente ya está en tu agenda del {fecha}". Cualquier otro error: toast destructive.
- Si hay próxima planificada, bajo la línea de metadatos aparece un `Badge variant="secondary"` con icono `CalendarCheck`: "Agendado para el {fecha corta}" y, si hay notas, " · {notas}" truncado. El botón Agendar sigue activo.

## B) Cabecera en móvil

Los dos botones se agrupan en un div `flex w-full gap-2 sm:w-auto sm:shrink-0`, cada botón con `flex-1 sm:flex-none`. En móvil se renderiza justo después del `<h1>`, sus metadatos y el badge de agendado, antes del bloque de situación y del aviso de prohibición de venta. En `sm` y superiores queda arriba a la derecha igual que ahora.

## C) Rejilla de KPIs

- Orden nuevo: Última compra, Última visita, Ventas {anioActual}, Variación vs. {anioPrevio}, y el resto detrás en su orden actual.
- De la quinta tarjeta en adelante van dentro de un `Collapsible` cerrado por defecto, con trigger de ancho completo "Ver todas las métricas" y `ChevronDown` que rota. El colapso solo actúa por debajo de `sm`: se resuelve con clases Tailwind (`sm:hidden` en el trigger, `hidden sm:contents` en el contenedor colapsado), no con `useIsMobile`.
- Clases del grid: `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6`.

## D) Pestañas

- Orden: Resumen, Visitas, Productos, Documentos, Perfil, Análisis IA (triggers y contenidos), mismos `value`, `defaultValue="resumen"`.
- Etiquetas cortas en móvil vía `<span className="sm:hidden">` / `<span className="hidden sm:inline">`: Productos→"Product.", Documentos→"Docs.", Análisis IA→"IA".

## E) Tabla de documentos

- "Fecha": primera línea la fecha; segunda línea `text-xs text-muted-foreground sm:hidden` con nº de documento · tipo (`d.operacion ?? d.tipo_documento`) · canal.
- "Documento", "Tipo", "Canal": `hidden sm:table-cell`.
- "Registrado por" y "Líneas": `hidden md:table-cell`.
- "Importe": siempre visible.
- Las mismas clases en `TableHead` y `TableCell` de cada columna.
- Se quita `overflow-x-auto` del `CardContent` de esa tabla.

## Fuera de alcance

No se toca el contenido de las tarjetas KPI, la lógica de `verMargen`, la pestaña Productos, `DocumentoLineasDialog` ni `Agenda.tsx`.

## Verificación

`tsgo` limpio, build correcto y revisión a 411 px de ancho: botones visibles arriba, sin scroll horizontal en la tabla de documentos.
