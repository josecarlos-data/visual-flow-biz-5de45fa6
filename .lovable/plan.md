# Sección global de Documentos

Convertir Documentos en una sección propia (`/documentos`) que liste todos los documentos que el usuario tiene permiso de ver, con filtro de año, umbral de importe y paginación de servidor.

## 1. Base de datos (una migración)

Nueva RPC `public.documentos_listado(_anio integer, _importe_min numeric DEFAULT 300, _limite integer DEFAULT 50, _offset integer DEFAULT 0)`, modelada sobre `cliente_documentos`:

- Perímetro: `WHERE v.cod_cliente IN (SELECT cod_cliente FROM public.clientes_permitidos(auth.uid()))` y `v.id_documento IS NOT NULL`.
- Año por rango: `v.fecha >= make_date(_anio,1,1) AND v.fecha < make_date(_anio+1,1,1)` (aprovecha `idx_vd_fecha`).
- Agregación por `id_documento` igual que la original; añade `cod_cliente` y el nombre del cliente (`clientes.cliente`, la columna que ya usa el resto de la app).
- `HAVING ABS(SUM(v.importe)) >= _importe_min` (valor absoluto para no perder los abonos).
- `total_filas bigint` con `COUNT(*) OVER ()`.
- Orden `fecha DESC, hora DESC`; `LIMIT GREATEST(1, LEAST(_limite, 200)) OFFSET GREATEST(0, _offset)`.
- `SECURITY DEFINER`, `STABLE`, `SET search_path TO 'public'`, margen a 0 salvo `puede_ver_margen(auth.uid())`.
- `CREATE INDEX IF NOT EXISTS idx_vd_documento ON public.ventas_diarias (id_documento);`
- `GRANT EXECUTE ... TO authenticated;` y `REVOKE ... FROM anon, PUBLIC;` como en las RPC vecinas.
- `INSERT` en `public.dashboards` de la fila `documentos` (nombre "Documentos", ruta `/documentos`, icono `FileText`, activo, orden entre Visitas y Rutas).

No se toca `cliente_documentos`, `ventas_diarias` ni ninguna política RLS.

## 1.1 Concesión de accesos iniciales (run_sql)

Tras insertar el panel `documentos`, conceder acceso a todos los usuarios que ya ven `ventas`:

```sql
INSERT INTO public.user_dashboard_access (user_id, dashboard_key)
SELECT user_id, 'documentos' FROM public.user_dashboard_access
WHERE dashboard_key = 'ventas'
ON CONFLICT DO NOTHING;
```

La tabla tiene índice único sobre `(user_id, dashboard_key)`, por lo que `ON CONFLICT DO NOTHING` hace la operación idempotente.

## 2. Hook

En `src/hooks/useCrm.ts`, nuevo `useDocumentosListado({ anio, importeMin, pagina })` que llama a la RPC y mapea filas (incluye `cod_cliente`, `cliente`, `total_filas`), siguiendo el patrón de `useClienteDocumentos`.

## 3. Página `/documentos`

Nuevo `src/pages/Documentos.tsx` y ruta en `src/App.tsx` con `<ProtectedRoute dashboardKey="documentos">`.

- Tabla: fecha, hora, cliente (código + nombre), tipo/operación, almacén, registrado por, líneas, importe (y margen solo si el usuario puede verlo).
- Orden fijo fecha descendente; importes negativos en rojo, sin tachados ni compensaciones.
- Filtro de año: selector que arranca en el año más reciente con datos (mismo patrón que `anioProd` en la pestaña de productos).
- Umbral: chip visible "Más de 300 €" con una X; al quitarlo `_importe_min` pasa a 0.
- Paginación de servidor: 50 filas por página, con `total_filas` para el contador y los botones anterior/siguiente.
- Sin otros filtros ni huecos preparados para la fase 2.

## 4. Modal de líneas

`src/components/DocumentoLineasDialog.tsx`: se añade una prop opcional `nombreCliente?: string` que, cuando llega, se muestra en la cabecera. Sin ella el comportamiento es idéntico al actual. No cambia su lógica interna ni `useDocumentoLineas`.

## Verificación

`tsgo` sin errores, la entrada Documentos aparece en el menú lateral y la primera página carga con el filtro de 300 € visible.
