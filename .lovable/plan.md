# Fase 4: Comunicaciones (seguimiento de envíos)

## Respuesta sobre WhatsApp

Sí, funciona como pensabas. Cuando el comercial pulsa «Abrir WhatsApp», se abre el WhatsApp del aparato donde lo pulsa, con el mensaje ya escrito. El mensaje sale desde **su propio número**, y la respuesta del cliente le llega a él.
- En el móvil sale del número que tenga en WhatsApp o WhatsApp Business.
- En el ordenador sale de su WhatsApp Web o de escritorio, si lo tiene enlazado.
- La app no ve el chat. Por eso pregunta «¿Se envió?» al volver.

**La otra opción: un número central de RIMOSA con envío automático (WhatsApp Business oficial)**

| | Número propio (actual) | Número central oficial |
|---|---|---|
| Quién envía | El comercial, uno a uno | La app, sola y en bloque |
| Respuestas | Al móvil del comercial | Al número central. Esta app aún no puede leerlas: haría falta un cambio técnico grande |
| Coste | Gratis | Meta cobra cada mensaje de promoción |
| Aprobación | Ninguna | Alta de empresa en Meta, y cada plantilla de mensaje aprobada (hasta 48 h) |
| Confirmación | Manual («¿Se envió?») | Automática (entregado o leído, cuando se pueda recibir) |
| Riesgo | Si un comercial abusa, WhatsApp puede bloquear su número | Lo controla RIMOSA. La calidad del número baja si hay quejas |

Recomendación: seguir con el número propio. La relación comercial-cliente pesa más, y no hay coste ni aprobaciones. La opción central tiene sentido para campañas masivas desde marketing. Se puede añadir más adelante sin rehacer nada.

## Qué cambia respecto al plan original
- **Fecha de corte:** las ventas de 30 días antes y 30 días después solo se muestran cuando los datos ya llegan a esos 30 días. Mientras tanto aparece «Pendiente (datos hasta dd/mm)», en vez de esconder la fila.
- **Comparación con quien no la recibió:** el resumen de cada oferta compara a los clientes que la recibieron con otros clientes elegibles a los que no se envió, en el mismo periodo. Así la mejora no se confunde con la temporada. Sigue con la etiqueta «asociación, no causa».
- **Solo cuentan los envíos confirmados:** las ventas solo se miden en los «Enviada». Los pendientes y los «Sin confirmar» se cuentan aparte.
- **Actividad por comercial:** envíos, confirmados y clientes distintos. Sirve para seguir el uso, no para incentivos.
- **Bajas:** si después de un envío alguien marca «No quiere ofertas» en la ficha, se registra como «Baja tras envío». Es la señal más fiable de que el cliente contestó BAJA.
- **Exportar** el listado a Excel, con los mismos filtros.

## Qué se verá: nueva sección «Comunicaciones»
- **Listado de envíos:** fecha, cliente, oferta, comercial y estado.
  - Filtros: fechas, oferta, comercial, delegación y estado. Va paginado.
  - Al abrir un envío se ve el mensaje exacto que se mandó, aunque la oferta esté archivada.
  - Cada envío muestra las ventas de lo ofertado (sus marcas, referencias y familias) en los 30 días antes y los 30 días después.
- **Resumen por oferta:**
  - Enviados, confirmados, no enviados y sin confirmar.
  - Clientes que compraron lo ofertado después del envío.
  - Variación frente a quien no la recibió.
  - Bajas tras el envío.
- **Resumen por comercial:** sus envíos y su tasa de confirmación.

**Quién ve qué**
- Comercial: lo de sus clientes.
- Jefe de zona: su delegación.
- Admin, director y marketing: todo. Marketing ve los resultados, pero no puede enviar.

## Detalles técnicos
- Una migración en `drizzle/migrations/` con:
  - Funciones `comunicaciones_listado` (paginada, con filtros), `comunicaciones_resumen_oferta`, `comunicaciones_resumen_comercial` y `comunicaciones_ventas_envio`. Todas `SECURITY DEFINER`, con `search_path` fijo, `is_approved` y alcance por rol. Para comercial y jefe de zona se usa `can_view_cliente`; admin, director y marketing ven todo. Cada una con `GRANT EXECUTE` explícito.
  - Ventas desde `ventas_diarias`, por las marcas, referencias y familias efectivas de la oferta. El corte se calcula con `fecha_corte_datos()`. El grupo de control son los clientes elegibles, sin bloqueos, en el alcance del usuario y sin envío de esa oferta.
  - «Baja tras envío»: un `no_quiere_ofertas` pasa a verdadero en `auditoria_eventos`, para ese cliente, después de un envío confirmado.
  - Panel `comunicaciones` (`dashboards`) y acceso para los usuarios que ya tienen el panel `ofertas`.
- Antes de aplicarla, se mide `EXPLAIN ANALYZE` del cálculo de ventas con la cuenta de Bautista. Si una página tarda más de 2 s, se precalcula por envío en lugar de calcularlo al vuelo.
- Pantalla nueva `src/pages/Comunicaciones.tsx`, con ruta y enlace en el menú, y exportación con SheetJS (ya está en el proyecto).
- Pruebas de las reglas:
  - la ventana de ±30 días frente a la fecha de corte (pendiente o calculada),
  - solo cuentan los «Enviada»,
  - el alcance de cada rol.

## Fuera de esta fase
- Recomendaciones (Fase 5).
- Número central oficial de WhatsApp (opcional, más adelante).
