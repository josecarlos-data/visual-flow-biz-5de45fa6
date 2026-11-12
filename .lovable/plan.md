# Decimales en bloques y etiquetas de referencia

## 1. normalizarNumero (src/lib/motivoCampos.ts)
- Quitar espacios.
- Si el texto lleva coma: formato español → borrar puntos (miles) y cambiar la coma por punto.
- Si no lleva coma: el punto es el decimal y se respeta.
- Se mantiene: "0", "00", "0000", "0,00" → "0". Texto no numérico se devuelve tal cual.
- Nota: "1.250" sin coma pasará a 1,25 (antes 1250). Es coherente con la regla pedida (la IA y los campos numéricos nunca envían separador de miles).

## 2. Pruebas (nuevo src/lib/motivoCampos.test.ts)
56.3→56.3 · 56.30→56.3 · 56,30→56.3 · 1.250,50→1250.5 · 1250→1250 · 0000→0 · 0,00→0.

## 3. Otros sitios revisados (no se cambian)
- `completar_bloque` y `editar_bloque_revision` (0034/0043): no convierten números; guardan el texto recibido.
- `CompletarBloqueDialog.tsx`: envía los valores sin normalizar. No reproduce el fallo (no borra puntos), pero un «56,30» escrito ahí se guarda como texto «56,30» sin convertir. Propuesta para otra entrega: aplicar `normalizarValoresNumericos` antes de llamar a la función.
- `src/lib/datasets/maestroIsi.ts` y `sync-onedrive`: misma lógica de borrar puntos, pero leen Excel de ventas en formato español, no bloques. Se dejan.
- `bloquesExtraccion.ts` (carga CSV): ya respeta el punto decimal.

## 4. Lista de bloques afectados (solo lectura, ya consultada)
Sospechosos de punto borrado: 2109 AUTOBUSES PACO PEPE 11/11 Nuestro precio 2297 («22,97»); 10833 PERFECT CAR 12/11 Nuestro precio 563 y Precio competidor 463 («56,30 … 10 euros más barato»), Promoción 563 («56,30») y 321 («32,10»). El resto coincide con su cita. Se entregará la tabla completa en la respuesta final.

## 5. Etiquetas de referencia (src/lib/camposVisita.ts → presentarCampos)
- Claves `<ref>_marca`, `<ref>_familia`, `<ref>_descripcion` cuya `<ref>` existe en el bloque: se colocan justo debajo de la referencia con etiqueta «Marca», «Familia», «Descripción» (sin el nombre interno).
- Afecta a la ficha del cliente y a Revisión, que ya usan esa función. Prueba añadida en camposVisita.test.ts.

Sin migraciones, sin cambios de datos.
