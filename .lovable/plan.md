# Registro automático de cambios en datos de negocio

Objetivo: dejar constancia en el registro de auditoría de quién crea, modifica o borra información en las cinco tablas clave, sin tocar ninguna pantalla.

## Qué se registra

- Altas, cambios y bajas en: visitas, clientes, objetivos, situaciones de cliente y ajustes de la aplicación.
- Se guarda: quién, cuándo, en qué tabla, sobre qué ficha y qué campos cambiaron (solo los nombres de los campos, nunca su contenido).
- Excepción: en los ajustes de la aplicación sí se guarda el valor anterior y el nuevo, por ser configuración y no dato personal.
- No se registran las importaciones ni los procesos automáticos: no identifican a ninguna persona y llenarían el registro.
- Si un cambio de datos no altera ningún campo relevante, no se anota nada.
- Si el registro fallara por cualquier motivo, la operación del usuario se guarda igualmente.

## Detalle técnico (una sola migración)

Función `public.auditar_cambio() RETURNS trigger`, `SECURITY DEFINER`, `SET search_path = public`:

1. `auth.uid()` nulo → retorna `NEW`/`OLD` sin escribir.
2. `tipo`: `dato_alta` (INSERT), `dato_cambio` (UPDATE), `dato_baja` (DELETE). `resultado = 'ok'`. `entidad = TG_TABLE_NAME`.
3. `entidad_id`: columna `key` para `app_settings`, columna `id` en el resto, convertida a texto.
4. UPDATE: se comparan `to_jsonb(OLD)` y `to_jsonb(NEW)` excluyendo `updated_at` y `created_at`. Lista vacía → retorna `NEW` sin insertar.
5. `detalle = {"campos": [...]}`. En `app_settings` se añaden `antes` y `despues` con la columna `value`.
6. INSERT y DELETE: `detalle = {"campos": []}`.
7. Inserta en `auditoria_eventos`: `user_id = auth.uid()`, `tipo`, `resultado`, `entidad`, `entidad_id`, `detalle`. `ip`, `user_agent`, `email` y `ruta` quedan a NULL.
8. La inserción va dentro de un bloque con `EXCEPTION WHEN OTHERS THEN NULL`.

Triggers `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`, con `DROP TRIGGER IF EXISTS` previo:
`auditar_visitas`, `auditar_clientes`, `auditar_objetivos`, `auditar_situaciones_cliente`, `auditar_app_settings`.

Comprobado antes de planificar: `auditoria_eventos` no tiene restricción sobre la columna `tipo` (solo sobre `resultado`, que admite `ok`), su RLS no está en modo forzado y su propietario es `postgres`, por lo que la función `SECURITY DEFINER` puede insertar pese a la política que bloquea inserciones desde la aplicación. No se modifican esa tabla, sus permisos ni sus políticas.

## Fuera de alcance

Sin índices nuevos, sin triggers en `ventas_diarias` ni en tablas de importación, sin cambios en la pantalla de Auditoría, en la edge function ni en `dispositivos` / `sesiones_activas` / `codigos_alta`.
