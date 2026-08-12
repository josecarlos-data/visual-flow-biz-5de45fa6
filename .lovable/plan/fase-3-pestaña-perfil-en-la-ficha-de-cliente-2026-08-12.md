# Fase 3 — Pestaña "Perfil" en la ficha de cliente

## Estado real de la base de datos (verificado ahora)

- `cliente_perfil_datos.confianza`: **text** (correcto)
- `cliente_perfil_datos.cita`: **existe** (text)
- Constraint `cliente_perfil_datos_confianza_check`: **existe**
- `v_cliente_perfil_vigente` incluye la columna `cita`: **sí** (21 columnas)
- Triggers sobre `cliente_perfil_datos`: **1**, llamado `update_cliente_perfil_datos_updated_at`
- `perfil_atributos`: **15 filas**, las 15 activas

Todo correcto: la corrección sí llegó a aplicarse. Se puede continuar.

## Qué se construye

Una pestaña nueva "Perfil", situada entre "Visitas" y "Análisis IA" en la ficha de cliente. No se toca ninguna otra pestaña ni las tarjetas de KPI.

Contenido:

- Lista de **todos** los atributos activos del catálogo, tenga el cliente dato o no, agrupados por `grupo` y ordenados dentro de cada grupo por `sort_order`.
- Cada fila: nombre del atributo a la izquierda; debajo, en gris pequeño, "visto el DD/MM por NOMBRE" o "nunca observado"; valor a la derecha.
- Valor `sin_confirmar`: en gris, con etiqueta "sin confirmar" y botón de check para confirmar.
- Valor `confirmado`: en negro, sin etiqueta ni botón.
- Sin dato: botón "Añadir".
- Barra de aviso arriba con el recuento "N datos sin confirmar" cuando proceda.

Acciones:

- **Confirmar**: única operación que actualiza una fila existente (`estado='confirmado'`, `confirmado_por`, `confirmado_en`).
- **Añadir / editar**: siempre un INSERT nuevo (`fuente='manual'`, `estado='confirmado'`, `observado_en` = hoy, `user_id`, `comercial_nombre`, `visita_id` y `bloque_id` a null). Nunca un UPDATE del valor: el historial es la tabla.

## Detalles técnicos

- Hooks nuevos en `src/hooks/useCrm.ts`:
  - `usePerfilAtributos()` — `perfil_atributos` con `is_active = true`, ordenado por `grupo`, `sort_order`.
  - `useClientePerfil(cod)` — `v_cliente_perfil_vigente` filtrada por `cod_cliente`.
  - `usePerfilMutations()` — `confirmar(id)` (UPDATE puntual) y `guardarValor(...)` (INSERT), ambos invalidando la query del perfil.
- Componente nuevo `src/components/ClientePerfilTab.tsx` con la lista agrupada y el diálogo de alta/edición; `ClienteDetalle.tsx` solo añade el `TabsTrigger` y el `TabsContent`.
- Formulario según `tipo` del atributo: `numero` (input numérico, rellena también `valor_num`), `select` (desplegable), `multiselect` (selección múltiple serializada con `" | "` vía `serializeMulti` de `motivoCampos.ts`), resto input libre.
- Opciones resueltas con `resolverOpciones` de `src/lib/motivoCampos.ts` más `useCatalogos()`, de forma que se acepta lista literal o referencia `{"catalogo": "..."}`.
- `comercial_nombre` se toma del perfil del usuario autenticado; `user_id` de la sesión.
- Fechas con `fechaCorta` para el "visto el DD/MM".

## Fuera de alcance

Descarte de hechos, historial desplegable por atributo, cambios en `visita_bloques`, el importador CSV, edge functions y triggers.
