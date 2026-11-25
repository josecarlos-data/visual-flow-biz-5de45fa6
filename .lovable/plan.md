# Fase 4.7: una promoción por producto y revisión de seguimiento bien rellena

## Corrección de lo que te dije

La revisión de seguimiento de Rafael **no sale vacía**. Me equivoqué al leer las respuestas: en mi comprobación solo miré los campos de precio, red de talleres y contacto. En las 5 ejecuciones sale así:

- `tema_revisado` siempre relleno: «Revisión del consumo de anticongelante; ha comprado un bidón de 200 litros».
- `canal` Presencial.
- `resultado`: «Pedido conseguido» en 2 ejecuciones y «Sigue pendiente» en 3.

Lo que falla de verdad:
1. **Resultado incoherente.** Ha comprado el bidón, así que es «Pedido conseguido»; «Sigue pendiente» es un error.
2. **Mezcla de bloques.** La compra va dentro de `tema_revisado`, y la `proxima_accion` de la revisión repite el seguimiento de los aceites, que es de la promoción.

La plantilla no tiene un campo de texto para el resultado; `resultado` es una lista cerrada.

## Cambios en las reglas (solo el prompt de extracción)

- **Un bloque por producto en promoción**, en la línea de «un bloque por comparativa» de competencia. La plantilla de promoción es de un solo producto (producto, cantidad y precio), así que cada producto presupuestado u ofertado va en su propio bloque, aunque se diga en la misma frase. Cada bloque lleva su cantidad y su próxima acción. Ejemplo: «Doy ppto de 10w40 y 15w40 en 200L» => dos bloques promoción, uno por aceite.
- **Revisión de seguimiento:**
  - `tema_revisado` dice qué se revisa (p. ej. «consumo de anticongelante»).
  - `resultado` sale de lo que pasó: si el cliente ha comprado o hecho pedido de lo revisado, es «Pedido conseguido»; también el importe si se dice.
  - La próxima acción de otro bloque no se copia en la revisión.

## Banco (solo el caso de Rafael)

- Promoción: exactamente 2 bloques (ya estaba).
- Revisión de seguimiento: `tema_revisado` contiene «anticongelante» y `resultado` = «Pedido conseguido». Son los dos datos que pides: qué se revisa y el resultado de la compra.

## Ejecución

Banco completo, 5 veces por caso. Fase4.7 se da por buena solo si se cumple todo en las 5 ejecuciones:
- «3 baterías» saca exactamente 3 bloques de competencia.
- Rafael saca 0 bloques de competencia.
- Icer sigue en 5/5 y los 8 casos cortos en 40/40.
- Rafael sale con la red «AD Parts» y la persona de contacto vacía.
- Rafael saca 2 promociones.
- La revisión de seguimiento de Rafael lleva los dos campos indicados.

Te doy los resultados sin desplegar y sin migraciones.
