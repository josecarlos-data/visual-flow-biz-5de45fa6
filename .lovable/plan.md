# Guardas de aprobación en funciones SECURITY DEFINER sin comprobación

## Estado actual (leído de la base y del código)

| Función | Qué comprueba hoy | Quién la llama |
|---|---|---|
| `actividad_interna_filtros()` | `has_role(admin)` **o** fila en `user_dashboard_access` con clave `actividad_interna` (consulta directa, no vía `has_dashboard_access`). Si no, `RAISE 'No autorizado'`. No comprueba aprobación ni estado (`has_role` tampoco lo hace). | `useCrm.ts` (pantalla Actividad interna) |
| `actividad_interna_usuarios(_anio, _almacen, _motivo)` | Igual que la anterior | `useCrm.ts` |
| `actividad_interna_motivos(_anio, _almacen)` | Igual que la anterior | `useCrm.ts` |
| `actividad_interna_almacenes(_anio)` | Igual que la anterior | `useCrm.ts` |
| `cliente_top_productos(_cod, _desde, _hasta, _desde_prev, _hasta_prev)` (plpgsql) | `can_view_cliente(auth.uid(), _cod)`; margen según `puede_ver_margen` | `useCrm.ts` (ClienteDetalle, Productos) y la función `cliente-insights` (con el token del usuario) |
| `cliente_top_productos(_cod, _anio)` (sql, sobrecarga) | Nada propio: delega en la versión de 5 argumentos | No se encuentra llamada desde la app |
| `situaciones_activas()` (sql) | Nada | No se llama desde la app; la usan las funciones `panel_alertas`, `panel_dormidos` y `ruta_clientes` |
| `has_dashboard_access(_user_id, _dashboard_key)` (sql) | `is_admin(_user_id)` (ya exige operativo) **o** fila en `user_dashboard_access`. La rama de la fila no exige aprobación. | Ninguna llamada en la app, ni en políticas, ni en otras funciones |

Ninguna obliga a cambiar la firma ni el tipo de retorno: todas se pueden recrear con CREATE OR REPLACE.

## Cambio (una migración en drizzle/migrations)

Cuerpos copiados literalmente de la definición vigente (`pg_get_functiondef`) en el momento de construir; solo se añade lo indicado. Sin DROP, sin tocar GRANT/REVOKE, misma firma, mismo SECURITY DEFINER, volatilidad y `search_path`.

1. **Las cuatro `actividad_interna_*`**: primera línea del cuerpo
   `IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;` (cero filas).
   Se conserva detrás la comprobación existente (admin o acceso al panel `actividad_interna`) con su `RAISE`. Como ya exigen acceso al panel, no se añade una segunda comprobación; al ir después de `is_approved`, un admin o usuario con acceso ya solo pasa si está aprobado y operativo.
2. **`cliente_top_productos` (5 argumentos, plpgsql)**: misma guarda al principio, antes de `can_view_cliente`.
3. **`cliente_top_productos` (2 argumentos, sql)**: no se modifica; hereda la guarda al delegar en la anterior (si el usuario no está aprobado devuelve cero filas).
4. **`situaciones_activas()` (sql)**: se añade `AND public.is_approved(auth.uid())` al WHERE (cero filas). Dentro de `panel_alertas`/`panel_dormidos`/`ruta_clientes`, `auth.uid()` sigue siendo el usuario que llama, así que para usuarios aprobados no cambia nada.
5. **`has_dashboard_access`**: pasa a
   `is_admin(_user_id) OR (is_approved(_user_id) AND EXISTS(...user_dashboard_access...))`. Sigue siendo SQL y STABLE.

Fuera de alcance: `has_role`, `puede_editar_bloque`, `fecha_corte_datos`, `promover_perfil_desde_bloque` y cualquier otra.

## Verificación tras aplicar

- Comparar con `pg_get_functiondef` que solo cambian las líneas añadidas y que los privilegios (`proacl`) son idénticos a los de antes.
- Con un usuario aprobado: Actividad interna, productos del cliente, alertas y ruta muestran lo mismo que antes.
- Ejecutar el linter de la base.

## Nota

Hoy un admin no aprobado que llame a `actividad_interna_*` recibe "No autorizado" solo si no es admin; tras el cambio, cualquier usuario no aprobado recibe cero filas sin error, como pide el objetivo.
