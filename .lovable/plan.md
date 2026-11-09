# Ventas del Maestro ISI repartidas en hojas por año

Solo se toca `src/lib/datasets/maestroIsi.ts` y `src/lib/datasets/maestroIsi.test.ts`. Sin migraciones, sin cambiar funciones de carga, orden de pasos, `datev`/`timev` ni `nodim`.

## Cambios

1. **Detección de hojas de ventas**: se toman las hojas llamadas `Hechos_Diarios` o que empiezan por `Hechos_Diarios_`, ordenadas alfabéticamente.
   - Ninguna: se mantiene el error actual.
   - `Hechos_Diarios` junto con alguna `Hechos_Diarios_…`: error «El Excel tiene a la vez la hoja Hechos_Diarios y hojas Hechos_Diarios_AAAA: las ventas estarían duplicadas. No se ha subido nada.»
   - Cualquiera con 0 filas: «La hoja X ha llegado vacía. Si el Excel es muy grande puede ser por tamaño: parte las ventas en más hojas.» Se comprueba antes de procesar nada.
2. **Lectura**: cada hoja pasa por la misma lógica de hoy y las ventas se juntan en una única lista. El orden de pasos de la carga no cambia.
3. **Descartes**: cada descarte guarda también el nombre de la hoja (`hoja`, `fila`, `falta`). El resumen y la tabla de rechazos muestran «Hechos_Diarios_2025 fila 12 sin Referencia».
4. **Vista previa**: una línea por hoja de ventas con leídas y descartadas, como ya pasa con Dim_Cliente y Dim_Referencia.
5. **Ayuda**: `expectedColumns` pasa a «Hoja Dim_Cliente · Hoja Dim_Referencia · Hojas Hechos_Diarios_AAAA (una por año)».
6. El error «ninguna línea válida» se mantiene, ahora para el total de todas las hojas de ventas.

## Pruebas (`maestroIsi.test.ts`, libros pequeños creados en memoria)

- Libro con `Hechos_Diarios_2024` y `Hechos_Diarios_2025`: las ventas se juntan, hay dos líneas por hoja y los descartes llevan su hoja.
- Libro con `Hechos_Diarios` y `Hechos_Diarios_2025`: error de duplicado.
- Libro con una hoja de ventas vacía: error con el nombre de esa hoja.

No se cargan datos reales.
