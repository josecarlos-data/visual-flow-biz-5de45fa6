# Fase 5 — Recomendaciones de clientes para cada oferta

## Qué consigue
Al abrir una oferta publicada, cada comercial ve **a quién le conviene enviarla**, con el motivo explicado en una frase ("Compró esta familia hace 2 meses", "Dejó de comprar esta marca hace 5 meses"). Puede enviar desde ahí (flujo de Fase 3) o descartar.

## Mejoras sobre el plan original
1. **Motivo visible y puntuación**, no solo un orden: cada cliente muestra por qué aparece.
2. **"Lo ha dejado" definido con números**: compró lo ofertado en los 12–24 meses anteriores y nada en los últimos 6 meses (umbral editable).
3. **Tercer grupo acotado**: "el resto" se limita a clientes activos que compran productos parecidos (misma familia o marca) en los últimos 24 meses; ordenados por días sin comprar. Evita listas de 10.000 clientes.
4. **Descartes con motivo y caducidad**: "No le interesa", "Ya lo tiene", "Otro". El descarte vale para esa oferta; opcionalmente para todas las ofertas de esa familia durante 90 días.
5. **Respeto a la saturación**: si el cliente recibió otra oferta en los últimos 7 días (editable), baja al final con aviso "Recibió una oferta hace X días".
6. **Excluye ya enviados** de esa oferta (salvo `sin_confirmar` / `no_enviado`, que se pueden reintentar).
7. **Mismos bloqueos que el envío** (baja ISI, patrones de prohibición, no quiere ofertas), calculados en el servidor; los bloqueados no se listan, solo se cuentan ("12 clientes excluidos por bloqueos").
8. **Por rol**: el comercial ve sus clientes; jefe de zona su delegación; dirección/marketing todo, con filtro por comercial y un resumen "recomendados por comercial" para detectar quién tiene más oportunidad.
9. **Medición**: en Comunicaciones se añade "enviado desde recomendación" para comparar resultado frente a envíos elegidos a mano.
10. **Sin IA en esta fase**: reglas claras y explicables. La IA queda como posible mejora posterior.

## Pantallas
- En la ficha de oferta: pestaña **"Recomendados"** con grupos (Clientes habituales / Recuperar / Potenciales), motivo, última compra, importe 12 meses, botones Enviar / Descartar, y selección múltiple hacia el envío en tandas existente (máx. 50).
- En Ajustes de ofertas: umbrales (meses de abandono, días de saturación, máximo de resultados).
- Admin/dirección pueden ver y deshacer descartes.

## Qué no cambia
No crea visitas, no toca incentivos ni revisiones, no envía nada automáticamente.

## Detalles técnicos
- Migración única `drizzle/migrations/0021_fase5_recomendaciones.sql`.
- Tabla `ofertas_descartes` (oferta_id, cod_cliente, user_id, motivo, alcance `oferta|familia`, familia, hasta, created_at); GRANT a authenticated/service_role; RLS permisiva con `is_approved` + `can_view_cliente`; borrado solo admin/director.
- Columna `ofertas_envios.origen text DEFAULT 'manual'` (`manual|recomendacion`), aditiva.
- RPC `SECURITY DEFINER` `ofertas_recomendados(_oferta uuid, _vendedor text default null, _limite int default 200)`: valida aprobado + acceso a Ofertas, filtra por `can_view_cliente`, coincidencia por `referencias`/`marcas`/`familias` de la oferta contra detalle de ventas + `productos`, aplica segmentación (delegaciones, tipos), bloqueos reutilizando la función de Fase 3, saturación y descartes; devuelve grupo, puntuación, motivo, última compra e importe. `search_path` fijado, `GRANT EXECUTE` solo a authenticated.
- RPC `ofertas_recomendados_resumen(_oferta)` para conteos por comercial (dirección/marketing).
- Ajustes nuevos en `app_settings` con `ON CONFLICT DO NOTHING`; se añaden a la vigilancia de avisos si procede.
- Antes de construir: medir con `EXPLAIN ANALYZE` con la sesión de Bautista sobre una oferta de prueba; si supera ~2 s, añadir índice sobre detalle de ventas (cliente, referencia, fecha) en la misma migración.
- Front: `src/components/ofertas/RecomendadosTab.tsx`, helper puro `src/lib/recomendaciones.ts` (textos de motivo, agrupación) con tests de umbrales.
- Roadmap: marcar Fase 5.
