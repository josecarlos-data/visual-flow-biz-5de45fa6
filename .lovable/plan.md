# Filtros y ordenación en /documentos

La vista materializada `documentos_resumen` ya expone `delegacion`, `vendedor`, `motivo_abono` e `id_doc_enlazado` (verificado). No se toca.

## 1. Base de datos (una migración)

### `documentos_listado` (CREATE OR REPLACE, misma firma ampliada)

Parámetros nuevos, todos `DEFAULT NULL` salvo los indicados:
`_buscar text`, `_importe_max numeric`, `_fecha_desde date`, `_fecha_hasta date`, `_canal text`, `_almacen text`, `_registrado_por text`, `_operacion text`, `_motivo_abono text`, `_delegacion text`, `_vendedor text`, `_orden text DEFAULT 'fecha'`, `_dir text DEFAULT 'desc'`.

- Se mantienen `_anio`, `_importe_min DEFAULT 300`, `_limite`, `_offset` y su posición; los nuevos van detrás para no romper llamadas existentes.
- Cada filtro se aplica solo si no es nulo: `AND (_canal IS NULL OR d.canal = _canal)`, etc.
- Búsqueda: `AND (_buscar IS NULL OR d.cliente ILIKE '%'||_buscar||'%' OR d.cod_cliente::text ILIKE '%'||_buscar||'%')`.
- Importes sobre `ABS(d.importe)`: `>= _importe_min` y `(_importe_max IS NULL OR ABS(d.importe) <= _importe_max)`.
- Fechas dentro del año ya filtrado, nunca lo sustituyen.
- `total_filas` con `COUNT(*) OVER ()` sobre el conjunto ya filtrado.
- Se devuelven además `motivo_abono` e `id_doc_enlazado` en el RETURNS TABLE (necesarios para tabla y modal). `delegacion`/`vendedor` no se devuelven: solo filtran.

Ordenación sin SQL dinámico, con lista blanca cerrada mediante expresiones `CASE`:

```text
ORDER BY
  CASE WHEN dir='asc'  AND orden='fecha'          THEN fecha END ASC,
  CASE WHEN dir='desc' AND orden='fecha'          THEN fecha END DESC,
  ... ídem para importe (ABS(importe)), lineas,
      cliente, operacion, almacen, registrado_por,
  fecha DESC, hora DESC
```

`_orden` se normaliza previamente: cualquier valor fuera de {fecha, importe, lineas, cliente, operacion, almacen, registrado_por} pasa a `fecha`; `_dir` fuera de {asc, desc} pasa a `desc`. Se mantiene `SECURITY DEFINER`, `STABLE`, `SET search_path TO 'public'`, el perímetro `clientes_permitidos(auth.uid())` y el bloqueo de margen por `puede_ver_margen`.

### `documentos_filtros_opciones(_anio integer)`

Devuelve una única fila con siete columnas `text[]`: `canales`, `almacenes`, `registrados_por`, `operaciones`, `motivos_abono`, `delegaciones`, `vendedores`, calculadas sobre `documentos_resumen` del año y dentro del perímetro del usuario, ignorando nulos y vacíos.

- `motivos_abono` ordenado por frecuencia descendente (`COUNT(*) DESC`), el resto alfabético.
- `SECURITY DEFINER`, `STABLE`, `SET search_path TO 'public'`, `GRANT EXECUTE TO authenticated`, `REVOKE FROM anon, PUBLIC`.

No se modifican `documentos_resumen`, `refrescar_documentos_resumen`, `cliente_documentos`, `ventas_diarias`, `clientes` ni ninguna política RLS.

## 2. Hooks (`src/hooks/useCrm.ts`)

- `DocumentoListado` gana `motivo_abono` e `id_doc_enlazado`.
- `useDocumentosListado` pasa a recibir un objeto de filtros (`anio`, `pagina`, `limite`, `importeMin`, `importeMax`, `buscar`, `fechaDesde`, `fechaHasta`, `canal`, `almacen`, `registradoPor`, `operacion`, `motivoAbono`, `delegacion`, `vendedor`, `orden`, `dir`), incluido íntegro en la `queryKey`. Los vacíos se envían como `null`.
- Nuevo `useDocumentosFiltrosOpciones(anio)` que llama a la RPC de opciones y devuelve los siete arrays.

## 3. Página `src/pages/Documentos.tsx`

- Botón "Filtros" (con contador de filtros activos) que abre un `Sheet` lateral — funciona igual en móvil y escritorio. Dentro: buscador, rango de fechas, importe mín/máx y los desplegables de canal, almacén, registrado por, operación, motivo de abono, delegación y vendedor.
- Delegación y vendedor solo se renderizan cuando su array de opciones tiene más de un valor. Sin lógica de roles.
- Chips de filtros activos sobre la tabla, cada uno con X para quitarlo. El chip de importe mínimo sigue apareciendo por defecto en 300 €. Delegación y vendedor son filtros, no columnas.
- Cualquier cambio de filtro u orden vuelve a página 1.
- Cabeceras pulsables con flecha de dirección en fecha, cliente, operación, almacén, registrado por, líneas e importe. Primer clic descendente, segundo ascendente; el orden viaja a la RPC, nunca se reordena la página en cliente.
- En la celda de operación, si la fila es un abono (`importe < 0`) y hay `motivo_abono`, se añade una segunda línea `text-xs text-muted-foreground` con el motivo. Las ventas quedan idénticas.

## 4. `src/components/DocumentoLineasDialog.tsx`

Dos props opcionales `motivoAbono?: string | null` e `idDocEnlazado?: string | null`. Cuando llegan, se muestran en la cabecera: el motivo junto al badge de tipo y una línea con el documento relacionado. Sin ellas el comportamiento es exactamente el actual (se sigue usando en la ficha de cliente). Sin tachados ni compensaciones.

## Verificación

`tsgo` sin errores; la página carga con el chip de 300 €, los desplegables se rellenan y ordenar por importe sitúa arriba abonos y ventas de igual magnitud.
