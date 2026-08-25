# Corrección de desbordamiento en DocumentoLineasDialog

## Objetivo
Evitar que el modal de líneas de documento crezca más allá de la pantalla cuando hay muchas líneas, asegurando scroll vertical en la tabla y dejando la cabecera y el pie de totales siempre visibles.

## Cambios en `src/components/DocumentoLineasDialog.tsx`

1. `DialogContent` (línea 53)
   - Añadir `max-h-[85dvh] flex flex-col` junto al `max-w-3xl` existente.
   - Usar unidades `dvh` para que en móvil se tenga en cuenta la altura real disponible (barras del navegador).

2. Contenedor de la tabla (línea 90)
   - Cambiar `overflow-x-auto` por `overflow-auto`.
   - Añadir `flex-1 min-h-0` para que ocupe el espacio sobrante y pueda encogerse por debajo de su contenido, activando el scroll vertical.

3. Cabecera (`DialogHeader`) y pie de totales (línea 144)
   - Mantener fuera del área scrollable; no requieren cambios de estructura, solo heredan el comportamiento de `flex flex-col` del `DialogContent`.

## Restricciones
- No modificar la lógica del componente, props, hooks ni ningún otro fichero.
- La corrección debe funcionar tanto en la ficha de cliente como en `/documentos`, ya que ambas usan el mismo componente.

## Verificación
- Documento con ~40 líneas: el modal no supera la pantalla, la tabla hace scroll vertical, y el botón de cerrar y los totales permanecen visibles en escritorio y móvil.
- Documento con ~3 líneas: el modal no crece dejando hueco vacío innecesario.
