# Cierre del módulo de visitas (versión estable para Rafael)

## 1. Diagnóstico propio (leído en el repo y en la base)

**Permisos hoy, con llamada directa (comercial):**
- `visitas` UPDATE: permitido sobre las suyas (`user_id = auth.uid()`). El trigger `visitas_guard_validacion` solo frena cambios de validación y, si ya hay algo validado, de fecha/cliente/tipo/resultado. En una visita **pendiente** puede cambiar cliente, fecha (dentro del límite), resultado, observaciones, coordenadas…
- `visitas` DELETE: permitido sobre las suyas si nada está validado.
- `visitas` INSERT: permitido con cualquier `origen`; `visitas_guard_alta` sale en cuanto `origen <> 'app'`, así que con `origen='gespromo'` se salta límite de fecha y bloqueo.
- `visita_bloques` INSERT/UPDATE/DELETE: permitido en sus visitas (`puede_editar_bloque` incluye al dueño). Puede añadir, borrar o reescribir bloques sin pasar por `completar_bloque`.
- `editar_bloque_revision`: usa `puede_editar_bloque`, que incluye al dueño → un director/jefe puede corregir bloques de **su propia** visita. Además puede hacerlo también con UPDATE directo.

**Quién escribe directamente hoy (no puede romperse):**
- `registrar_visita` (SECURITY INVOKER) inserta visita y bloques con la identidad del comercial.
- La versión **publicada** antigua inserta visita y bloques directamente (por eso `visita_alta_directa_bloqueada` sigue en false).
- Revisión (`useRevisionMutations`, `useBloqueMutations`) y `useReanalizarVisita` (borra e inserta bloques): solo revisores.
- Importadores de bloques/Gespromo: admin.
- Ninguna pantalla actualiza ni borra visitas como comercial.

**Pantallas:**
- Listado: motivos en columna derecha; vista previa usa `observaciones || transcripcion`, y la transcripción lleva la marca «[Respuesta a los datos que faltaban]» que añade NuevaVisita.
- Ficha: la cabecera solo tiene motivos y fecha; las observaciones se ocultan si hay bloques.
- `useClientes(false)` ya pagina de 1.000 en 1.000 (hasta 30 páginas) y el listado de Visitas ya lo carga; el buscador de registro usa `useClientes()` (activos).
- Visitas con `cliente_externo`: el comercial las ve (son suyas), admin y director también. **El jefe de zona no**: su regla de lectura filtra por `cod_cliente` de su delegación y un código vacío nunca cumple. Tampoco salen en la ficha, ni en el análisis IA ni en KPIs por cliente.

## 2. Comparación con la propuesta de Claude

| Punto | Claude | Mi postura |
|---|---|---|
| Motivos en línea con contador, resultado/llamada, «Incompleta», estado | De acuerdo | Igual. «Incompleta» = algún bloque con `completo = false`. Estado: el de la visita (`validacion`). |
| Quitar marca interna | En la vista previa | También en «Ver texto original» de la ficha. Solo al mostrar; no se toca el dato ni la IA. |
| Ficha: cabecera y observaciones con bloques | De acuerdo | Igual, en dos líneas en móvil. |
| Completar datos desde listado y ficha | Bloques no validados | `completar_bloque` hoy admite Pendiente **y** No correcto (solo bloquea Correcto). Propongo lo mismo que Avisos: Pendiente y No correcto, solo visitas propias. |
| Buscador de inactivos | `clientes_visibles(false)` al pulsar | Reutilizar `useClientes(false)` con carga activada solo al pulsar: comparte caché con el listado y ya pagina bien. Añadir opción `enabled` al hook. |
| Cliente fuera de ISI | Enviar `cliente_externo` | De acuerdo. Además señalo el hueco del jefe de zona (ver punto abierto). |
| Comercial no modifica ni borra visita | Cerrar UPDATE/DELETE | De acuerdo, y **falta cerrar `visita_bloques`**: si no, puede borrar o reescribir bloques directamente. |
| Solo origen 'app' para no admin | Completar trigger 0042 | De acuerdo; las cargas sin identidad (servicio) siguen pasando. |
| Revisor no corrige lo suyo | En `editar_bloque_revision` | También en la regla de UPDATE de bloques, si no lo hace por la vía directa. |
| Riesgo de publicación | No mencionado | Cerrar INSERT de bloques al comercial rompería la versión publicada antigua. Lo ato al ajuste `visita_alta_directa_bloqueada`: mientras esté en false, el comercial puede insertar bloques en sus visitas pendientes; con true, solo dentro de `registrar_visita`. |

## 3. Plan final

### A. Listado de Visitas (`Visitas.tsx`), móvil primero
- Título y, debajo, una línea: fecha · hora · comercial · ruta.
- Debajo, insignias en línea con salto: motivos agrupados («Promoción / Oferta ×2»); si no es efectiva, su resultado en vez de «Visita»; «Llamada» si el tipo es llamada; «Incompleta»; estado «Pendiente / Correcto / No correcto».
- Vista previa sin la marca interna.
- En visitas propias con bloques Pendiente o No correcto: botón «Completar datos» (abre `CompletarBloqueDialog` modo comercial; si hay varios bloques, elige cuál). El botón no navega a la ficha.

### B. Ficha, pestaña Visitas (`ClienteDetalle.tsx`)
- Cabecera: motivos + fecha, y debajo comercial · tipo/resultado · estado.
- Observaciones visibles también con bloques.
- «Completar datos» en cada bloque propio Pendiente o No correcto.
- Marca interna fuera del «Ver texto original».

### C. Buscador al registrar (`NuevaVisita.tsx`, solo el buscador)
- Sin resultados: botón «Buscar también en inactivos» → activa la carga de todos y busca de nuevo; marca «Inactivo» en esos resultados.
- Opción «Cliente que no está en ISI»: campo de nombre, se envía como `cliente_externo` sin código. Sin coordenadas de cliente ni cierre de agenda (ya lo hace `registrar_visita`). El borrador guarda también ese nombre.

### D. Migración única 0044
- `visitas` UPDATE: quitar al dueño; quedan admin, director y jefe de zona en su ámbito (como hoy).
- `visitas` DELETE: solo admin.
- `visitas_guard_alta`: usuario no admin con `origen <> 'app'` → «Solo se pueden registrar visitas desde la app.»
- `visita_bloques` UPDATE/DELETE: admin, o revisor con alcance sobre la visita **y que no sea suya**. El comercial solo cambia datos con `completar_bloque`.
- `visita_bloques` INSERT: admin; revisor sobre visitas ajenas (reanalizar); dueño solo dentro de `registrar_visita` o mientras `visita_alta_directa_bloqueada` sea false, y solo si la visita está pendiente.
- `editar_bloque_revision`: «No puedes corregir bloques de tus propias visitas» salvo admin. Misma firma; `CREATE OR REPLACE` y `GRANT EXECUTE` explícito a authenticated.
- Todas las reglas con `(SELECT public.is_approved(auth.uid())) AND (…)`, permisivas.
- Antes de escribirla compruebo que los triggers que actualizan la visita desde los bloques (`recalcular_validacion_visita`) y `completar_bloque` siguen funcionando sin el UPDATE del dueño.

### E. Punto abierto (decides tú)
Visitas a cliente fuera de ISI y jefe de zona: propongo que el jefe las vea y revise cuando el **comercial autor** sea de su delegación. Si no lo quieres ahora, solo las verán el comercial, el director y el admin.

### F. Pruebas (identidades simuladas, transacción deshecha)
- Comercial: borrar su visita, cambiar cliente, insertar `origen='gespromo'`, borrar/reescribir un bloque directamente → rechazado. `completar_bloque` en bloque suyo pendiente → permitido. `registrar_visita` con dos bloques → sigue funcionando. Con el ajuste en false, alta directa con bloque → entra.
- Admin: borrar visita y alta `gespromo` → permitido.
- Director: corregir bloque de visita suya (RPC y directo) → rechazado; de otro comercial → permitido. Reanalizar visita ajena → permitido.
- Visita con `cliente_externo` → se guarda y sale en el listado del comercial y del director.
- Tests de las utilidades nuevas (agrupar motivos, quitar marca).

### No se toca
Extracción por voz y prompt, análisis IA, conversación, registro salvo el buscador, importador Gespromo.

### Qué no podré probar en pantalla
Sin cuentas reales: el aspecto en el móvil con sesión, el diálogo desde listado y ficha, y el buscador de inactivos con datos reales.
