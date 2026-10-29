# Fase 3 — Envío de ofertas por WhatsApp desde la ficha

Reanálisis del plan aprobado el 19-10 con los datos actuales. Cambios respecto al original marcados con **[Mejora]**.

## Lo que dicen los datos hoy
- 0 clientes con móvil en `telefono`/`telefono2`: en la práctica casi todos los envíos pedirán el número la primera vez.
- Las situaciones de cliente solo usan el efecto «justificada»; no existe «ocultar». **[Mejora]** El bloqueo 8 se aplica a cualquier situación activa marcada como «no contactar» si se crea en el futuro; con los datos actuales no bloquea a nadie. Se deja configurable, no codificado.
- Solo 41 datos de perfil confirmados en total. **[Mejora]** Si un cliente no tiene el dato que pide un requisito, se muestra como **aviso** («Sin dato: tamaño de taller»), no como bloqueo; solo bloquea si el dato existe y no cumple. Si no, casi ninguna oferta con requisitos se podría enviar.

## Qué ve el comercial

**En la ficha del cliente: botón «Enviar oferta»**
- Lista de ofertas publicadas y vigentes, cada una con su estado para este cliente:
  - Disponible.
  - Bloqueada, con el motivo en lenguaje claro (p. ej. «El cliente no quiere ofertas», «Cliente de baja en ISI», «Marca excluida: XXX»).
  - Aviso «Ya enviada el 12/10 por Ana», que no impide reenviar.
- Al elegir una: vista previa del mensaje final (con `{contacto}` ya sustituido y el pie fijo) y el teléfono que se usará.
- Sin móvil: se pide, con «Guardar en la ficha» marcado. **[Mejora]** Se valida que sea móvil español (6/7, 9 cifras) antes de abrir WhatsApp.
- Botón «Abrir WhatsApp» → abre `wa.me/34XXXXXXXXX?text=...` y registra el envío como `abierto`.
- Al volver a la app, se pregunta «¿Se envió?» → Sí / No. **[Mejora]** Si se cierra sin responder, queda `abierto` y aparece en una lista «Pendientes de confirmar» del propio comercial; a los 7 días pasa solo a `sin_confirmar` (sin contarse como enviado).

**En la pantalla de Ofertas (para comerciales y jefes de zona): «Enviar a varios»**
- Elegir oferta → lista de sus clientes visibles que la pueden recibir, con filtros por ruta y localidad. Los bloqueados salen aparte con su motivo.
- Recorrido cliente a cliente con «Siguiente», misma confirmación «¿Se envió?».
- **[Mejora]** Tope de 50 clientes por tanda, para no generar envíos masivos desde un móvil personal (riesgo de que WhatsApp bloquee el número).

**Historial**
- En la pestaña Visitas de la ficha, los envíos aparecen con estilo propio («Oferta enviada: título»). No crean visitas ni bloques, no cuentan para revisión ni incentivos.

## Reglas de bloqueo (en este orden; se muestra el primero y el resto al desplegar)
1. Oferta no publicada o fuera de fechas.
2. Delegación fuera de la oferta.
3. Tipo de cliente fuera de la oferta.
4. Requisito de perfil con dato que no cumple (sin dato = aviso).
5. Marca excluida por el cliente (marcas de la oferta + marca de cada referencia).
6. «No quiere ofertas».
7. Prohibición de venta según los patrones de Datos.
8. Situación activa con efecto de no contactar (hoy ninguna).
9. Baja en ISI: «Estado» distinto de Activo o «Fecha de baja» con valor. Sin «Estado» no bloquea.

Las reglas se comprueban **otra vez en la base de datos al registrar**, no solo en pantalla.

## Accesos
- El panel Ofertas se asigna a jefes de zona y comerciales; ellos ven solo la vista de envío (no crean ni editan).
- Cada uno envía solo a clientes que ya puede ver. Marketing no envía.

## Fuera de esta fase
- Listado global de comunicaciones y estadísticas (Fase 4).
- Recomendaciones (Fase 5).
- Envío automático por WhatsApp oficial.

## Pruebas
- Pruebas automáticas de las reglas: normalización del teléfono (`+34 6xx…`, `0034…`, fijo rechazado), sustitución de `{contacto}`, requisito sin dato = aviso, y paso `abierto` → `sin_confirmar` a los 7 días.
- Con la cuenta de Bautista, solo lectura de `ofertas_para_cliente` sobre un cliente suyo y uno ajeno (debe dar error). No registro envíos reales; esa prueba la haces tú con una oferta de prueba.

## Detalles técnicos
- Una migración en `drizzle/migrations/`:
  - Tabla `ofertas_envios` (oferta_id, cod_cliente, user_id, comercial_nombre, telefono, mensaje final, estado `abierto|enviado|no_enviado|sin_confirmar`, abierto_en, confirmado_en, tanda_id). GRANT SELECT a authenticated, ALL a service_role; RLS permisiva: ver propios o de clientes visibles (`can_view_cliente`) + gestores de ofertas; sin INSERT/UPDATE directos.
  - `ofertas_para_cliente(_cod_cliente)` y `ofertas_destinatarios(_oferta_id)` SECURITY DEFINER, `search_path` fijo: exigen `is_approved`, `can_view_cliente` y rol admin/director/jefe_de_zona/comercial; devuelven motivos y avisos.
  - `registrar_envio_oferta(...)` y `confirmar_envio_oferta(_id, _enviado)`: revalidan bloqueos; el guardado del teléfono actualiza `cliente_preferencias_ofertas.telefono_whatsapp` (auditado por el trigger existente).
  - Ajuste `ofertas_efectos_bloqueo` en `app_settings` (lista de efectos de situación que bloquean, vacía por defecto) y cron diario que pasa a `sin_confirmar` los `abierto` de más de 7 días.
  - Filas de `user_dashboard_access` del panel `ofertas` para jefes de zona y comerciales existentes.
  - Auditoría: evento `oferta_envio` en `auditoria_eventos` al registrar y confirmar.
- Frontend: `EnviarOfertaDialog` en ClienteDetalle, vista de envío en `Ofertas.tsx` según rol, historial combinado en la pestaña Visitas, helper `src/lib/ofertasEnvio.ts` (teléfono, mensaje, enlace) con sus tests.
- La confirmación al volver usa `visibilitychange` + envío pendiente guardado en `sessionStorage`.

## Preguntas abiertas (no bloquean la construcción)
- Texto del pie legal: sigue provisional hasta que responda la asesoría.
