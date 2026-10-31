# Fase 6 — Seguimiento de compras tras ofertas

## Punto de partida
Comunicaciones ya compara ventas de los productos de la oferta 30 días antes y 30 días después de cada envío confirmado. Falta ver **qué compró cada cliente**, comparar ofertas entre sí de forma justa y separar el efecto de la oferta de la tendencia normal del cliente.

## Qué se construye

1. **Ficha de seguimiento por envío** (desde Comunicaciones y desde la ficha del cliente)
   - Líneas compradas después del envío que encajan con la oferta (referencia, marca o familia), con fecha, documento, unidades e importe.
   - Días hasta la primera compra y si fue dentro de la vigencia de la oferta.
   - Estado: «Compró», «Sin compra aún», «Pendiente de datos» (si la ventana supera la fecha de corte).

2. **Comparativa de ofertas** (nueva pestaña «Resultados» en Comunicaciones)
   - Por oferta: enviados, confirmados, clientes que compraron, tasa de conversión, importe y margen (margen solo si el usuario puede verlo), ticket medio, días medios hasta compra.
   - **Grupo de comparación**: clientes del mismo segmento que no recibieron la oferta en ese periodo, para mostrar «incremento sobre lo habitual» en vez de solo antes/después.
   - Ventana elegible: 15 / 30 / 60 días. Ranking ordenable y exportable a Excel.
   - Desglose por comercial, delegación y origen (manual / recomendación).

3. **Seguimiento en la ficha del cliente**
   - Bloque «Ofertas recibidas»: cada oferta enviada y si generó compra, con enlace al detalle.

4. **Reglas de atribución (explicables, sin IA)**
   - Una compra cuenta para la oferta si coincide con sus productos y ocurre entre el envío y el fin de ventana.
   - Si dos ofertas coinciden en la misma compra, se atribuye a la más reciente (marcado como «compartida»).
   - Abonos restan. Envíos «sin confirmar» o descartados no cuentan.
   - Aviso visible: asociación no implica causalidad.

## Permisos
- Mismos que Comunicaciones: comercial ve los suyos, jefe de zona su delegación, dirección/marketing/admin todo.
- Margen solo con permiso de ver margen.
- Todo bloqueado si el interruptor de Ofertas está apagado.

## Detalles técnicos
- Una migración `fase6_seguimiento_compras`: RPCs `SECURITY DEFINER` con `search_path` fijo, guardas `ofertas_guard` + `is_approved` + `comunicaciones_ve`, `REVOKE` de PUBLIC/anon y `GRANT` a authenticated:
  - `oferta_envio_compras(_envio_id, _dias)` — líneas atribuidas.
  - `ofertas_resultados(_desde, _hasta, _dias, _agrupar)` — métricas y grupo de comparación.
  - `cliente_ofertas_historial(_cod)`.
- Reutiliza `ventas_diarias` y `oferta_marcas_efectivas`; índice nuevo solo si `EXPLAIN ANALYZE` lo justifica (objetivo < 2 s con Bautista).
- Front: pestaña en `Comunicaciones.tsx`, diálogo de detalle, bloque en `ClienteDetalle.tsx`; helper puro de atribución con tests (ventana, abonos, compra compartida, pendiente de datos).
- Sin tocar visitas, incentivos ni tablas existentes; actualizar `roadmap.md`.
- Verificación: tests, typecheck, prueba RPC con Bautista y con interruptor apagado.
