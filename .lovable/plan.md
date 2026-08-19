Plan: Columna "Registrado por" y modal de desglose de líneas en ficha de cliente

## Alcance
Cambio acotado al frontend de la pestaña "Documentos" de `src/pages/ClienteDetalle.tsx`. Solo se crea un componente React y se modifica la tabla de documentos existente. No se toca backend.

## Ficheros a crear
- `src/components/DocumentoLineasDialog.tsx`
  - Nuevo componente con el diálogo de desglose de líneas de un documento.
  - Usa el componente `Dialog` ya existente en `src/components/ui/dialog.tsx`.
  - Props: `open`, `onOpenChange`, `codCliente`, `documento` (tipo `DocumentoCliente` de `useCrm.ts`).
  - Contenido: cabecera con id_documento, badge de tipo (Venta/Abono), metadatos de fecha/hora/canal/almacén, emisor y comercial del cliente; tabla de líneas con Referencia, Descripción + marca/familia, Uds., Precio ud., Importe; pie con número de líneas, unidades totales y total del documento.
  - Formato numérico: `es-ES` (miles con punto, decimales con coma) usando `num` y `eur` de `src/lib/format.ts`.
  - Estados: skeleton de 3 filas durante carga, mensaje "Sin líneas para este documento" si no hay datos, y mensaje de error discreto si el hook devuelve error.
  - Abonos: importes negativos en rojo (`text-destructive`), tanto en líneas como en el total.
  - No se añade columna de margen ni precios que no existan en la base.

## Ficheros a modificar
- `src/pages/ClienteDetalle.tsx`
  - En la tabla "Últimos documentos" (~línea 488-518):
    - Cambiar la cabecera `Vendedor` por `Registrado por`.
    - Cambiar la celda `d.vendedor_linea ?? "—"` por `d.registrado_por ?? "—"`.
    - Convertir cada fila `<TableRow>` en clicable (`cursor-pointer`, hover discreto) para abrir el diálogo.
    - Añadir estado local (`useState`) para el documento seleccionado y controlar `open` del diálogo.
    - Importar y renderizar `<DocumentoLineasDialog />`.
  - No se modifica el resto de la ficha de cliente ni otras pestañas.

## Hooks a usar
- `useClienteDocumentos` y `useDocumentoLineas` de `src/hooks/useCrm.ts` (ambos ya existen).
  - `useClienteDocumentos` ya está en uso en `ClienteDetalle.tsx` y ya devuelve `registrado_por`.
  - `useDocumentoLineas(codCliente, documento.id_documento)` se usará dentro del nuevo diálogo.
  - No se crean ni modifican hooks.

## Migraciones, funciones SQL, tablas o políticas RLS
- **Ninguna**. No se crea ni modifica ninguna función SQL, tabla, migración o política RLS.
  - La función `cliente_documento_lineas` ya devuelve `referencia, descripcion, marca, familia, unidades, importe, margen`.
  - El hook `useDocumentoLineas` ya la consume.
  - Si durante la implementación se descubriera que falta algún campo o permiso, se parará y se reportará antes de continuar.

## Notas de implementación
- No se añade columna de margen en la tabla del diálogo.
- No se inventan datos que no existen (precio bruto, descuento, precio medio histórico).
- Precio ud. = `importe / unidades`; si `unidades === 0`, se muestra `"—"`.
- Formato moneda: `eur(importe, 2)` para importes; `num(unidades)` para unidades; precio ud. con 2 decimales usando `num` o `eur` según corresponda.
- Badge de tipo: "Venta" en verde (variante/estilo a definir con `Badge` de shadcn), "Abono" en rojo (`variant="destructive"` o similar).
