# Arreglar ilegibilidad en móvil del modal de líneas de documento

## Objetivo
Mejorar la lectura de `src/components/DocumentoLineasDialog.tsx` en vista móvil sin alterar el comportamiento en escritorio, ni tocar RPCs, hooks, consultas, migraciones ni otras páginas.

## Cambios en `src/components/DocumentoLineasDialog.tsx`

1. **Vista de tarjetas en móvil**
   - Importar `useIsMobile` desde `@/hooks/use-mobile`.
   - Cuando `isMobile` sea true, omitir la `Table` y renderizar una lista de tarjetas (una por línea) en un contenedor `space-y-2`.
   - Cada tarjeta mostrará:
     - Referencia en `font-mono text-xs`.
     - Descripción con `className="mt-0.5 break-words text-sm font-medium"`, **sin `truncate` ni `max-w`** para que se lea completa en varias líneas.
     - Un segundo renglón con marca/familia.
     - Fila inferior con unidades × precio medio ud. y el importe total formateado.
   - Aplicar `text-destructive` al importe cuando la línea sea negativa, igual que la tabla actual.
   - En escritorio (`isMobile === false`) se conserva la `Table` existente sin modificaciones.

2. **Scroll horizontal residual**
   - El contenedor de contenido actual `overflow-auto flex-1 min-h-0` pasará a:
     - Escritorio: `overflow-y-auto overflow-x-auto flex-1 min-h-0`.
     - Móvil: `overflow-y-auto flex-1 min-h-0` (sin scroll horizontal).
   - Resolver mediante clase condicional.

3. **Ancho del diálogo en móvil**
   - Añadir `w-[calc(100%-2rem)]` a `DialogContent`, conservando `max-w-3xl max-h-[85dvh] flex flex-col`.
   - Esto deja margen lateral en pantallas pequeñas.

4. **Etiqueta de precio unitario derivado**
   - Cambiar el `TableHead` de "Precio ud." a "Precio medio ud.".
   - En el pie, debajo de "Importes sin IVA (base imponible)", añadir "Precio unitario medio tras descuentos".
   - En la tarjeta móvil mantener el formato `N ud. × X €`, que ya sugiere un precio medio.

5. **Texto de cabecera confuso**
   - Rama sin `nombreCliente`: reescribir como `"Registrado por {registrado_por ?? "—"} · Comercial: {vendedor_linea ?? "—"}"`.
   - Rama con `nombreCliente`: cambiar "Emitido por" por "Registrado por" para coherencia.

6. **Aviso de total recalculado**
   - Calcular el total sumando líneas (comportamiento actual).
   - Si `|documento.importe - total| > 0.01 €`, mostrar bajo el total un aviso en texto pequeño destructivo: `"El total del documento es {eur(documento.importe, 2)}; las líneas mostradas suman {eur(total, 2)}."`.
   - Si coinciden, no mostrar nada.

## Restricciones
- Único fichero modificado: `src/components/DocumentoLineasDialog.tsx`.
- Sin migraciones, sin cambios en `supabase/` ni `package.json`.
- No modificar `src/pages/ClienteDetalle.tsx` ni `src/pages/Documentos.tsx`; los cambios deben ser compatibles con ambas llamadas sin alterar props.

## Verificación
1. `tsgo` limpio y build correcto.
2. A 360 px, cada línea se lee completa sin scroll horizontal; las descripciones largas se muestran completas, envolviendo a varias líneas dentro de su tarjeta.
3. En escritorio la tabla y el layout se mantienen igual que hoy.
4. El modal abierto desde `/documentos` sigue funcionando igual.
