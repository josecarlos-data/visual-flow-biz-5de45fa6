# Actividad interna (solo gerencia)

Nueva sección aislada que compara la actividad de los usuarios internos que registran documentos en el ERP, a partir de la información ya consolidada de documentos. No se modifica ninguna sección existente ni la vista de documentos.

## 1. Base de datos (una migración)

- Registrar el dashboard `actividad_interna` en el catálogo de dashboards (nombre "Actividad interna", icono BarChart3, ruta `/actividad-interna`, orden 90), idempotente.
- Conceder acceso únicamente a los usuarios con rol admin actuales, idempotente. No se replica el acceso de Ventas.
- Tres funciones nuevas, todas `SECURITY DEFINER`, `STABLE`, `search_path = public`, y con la comprobación de acceso como primera instrucción del cuerpo (excepción "No autorizado" si el usuario no tiene el dashboard asignado):
  - `actividad_interna_usuarios(_anio int, _almacen text DEFAULT NULL)`: una fila por usuario de registro (se excluyen nulos y cadena vacía) con almacén principal (el de más documentos), número de almacenes distintos, importe vendido, documentos de venta, número de abonos, importe abonado en valor absoluto, clientes distintos, ticket medio, % de abonos sobre documentos y % de importe abonado.
  - `actividad_interna_almacenes(_anio int)`: las mismas métricas agrupadas por almacén, más el número de usuarios distintos.
  - `actividad_interna_filtros()`: años y almacenes disponibles.
- `GRANT EXECUTE` de las tres a usuarios autenticados. Sin índices nuevos sobre la vista materializada.

Criterios respetados tal cual están en el repo: venta = operación distinta de "Abono" (con "Venta" por defecto si es nula); abono = operación "Abono"; los importes de abono son negativos, se presentan en valor absoluto.

## 2. Frontend

- `src/App.tsx`: ruta `/actividad-interna` protegida con `dashboardKey="actividad_interna"` (sin `adminOnly`).
- Menú lateral: no requiere cambios de código, la barra lateral se construye desde el catálogo de dashboards, así que la entrada aparece sola al insertar el registro.
- `src/pages/ActividadInterna.tsx` nueva:
  - Dos pestañas: "Por usuario" y "Por almacén".
  - Selector de año (ambas pestañas) y de almacén (solo en "Por usuario"), poblados con `actividad_interna_filtros` y usando los mismos componentes Select que Documentos.
  - Tabla con ordenación por columna en cliente (primer clic descendente), sin paginación.
  - Importes en euros sin decimales, porcentajes con un decimal, formato es-ES vía los helpers existentes.
  - En "almacén principal", badge "+N" cuando el usuario opera en más de un almacén.
  - `useScrollRestore("actividad-interna", ...)` igual que en Documentos.
- Hooks de datos: se añaden en `src/hooks/useCrm.ts` siguiendo el patrón de los hooks de documentos (react-query + RPC).

## Fuera de alcance

Garantías, margen, canal de entrada, gráficos, comparativa entre años y exportación.
