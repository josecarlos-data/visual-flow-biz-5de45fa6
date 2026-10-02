# Estado de usuario, baja en un clic y nombre de usuario

## Inventario previo (leído de la base de datos)

Tablas con alguna policy que usa `is_approved`: app_settings, catalogos_opciones, cliente_insights, clientes, dashboards, motivo_campos, motivos_visita, objetivos (solo SELECT), productos, rutas, visitas, visitas_planificadas.

Tablas cuyas policies NO usan `is_approved` directamente:

| Tabla | Función que usan | ¿Queda cubierta por estado? |
|---|---|---|
| cliente_kpis, cliente_perfil_datos, resumen_cliente_familia/marca/mes, resumen_documentos, situaciones_cliente (SELECT), ventas_diarias (SELECT) | `can_view_cliente` | Sí, indirectamente: `can_view_cliente` llama a `is_approved` |
| visita_bloques SELECT | `puede_ver_bloque` (usa `can_view_cliente` + `is_admin`) | Parcial: la rama admin no |
| visita_bloques INSERT/UPDATE/DELETE | `puede_editar_bloque` (`is_admin` + propiedad) | **No** |
| objetivos ALL, situaciones_cliente escritura | `is_admin` OR `has_role('director_comercial')` | **No** |
| perfil_atributos SELECT | `true` | **No** (catálogo, no datos de clientes) |
| profiles, user_roles, user_dashboard_access, dispositivos, sesiones_activas | `auth.uid() = user_id` / `is_admin` / `has_role` | No, y debe seguir así: el bloqueado necesita leer su perfil para ver la pantalla |
| auditoria_eventos, codigos_alta, sync_config, sync_log, system_functions, todas las de escritura admin | `is_admin` | **No** |

RPC SECURITY DEFINER (se saltan RLS): las de panel, documentos, rutas y fichas pasan por `clientes_visibles`/`can_view_cliente` y quedan cubiertas. Las `actividad_interna_*` (4), `cliente_top_productos`, `situaciones_activas`, `fecha_corte_datos` y `promover_perfil_desde_bloque` no comprueban aprobación; `has_dashboard_access` tampoco.

## DETENCIÓN: un hueco que el plan no cierra

`is_admin` no mira ni aprobación ni estado. Si un administrador bloquea o da de baja a **otro administrador**, este conserva por RLS todo el poder de administración (y lo mismo un director comercial sobre objetivos y situaciones) mientras tenga un token válido (hasta 1 h). El vigilante del navegador lo echa, pero una llamada directa a la API no.

Opciones (elige una antes de construir):
- **A (recomendada):** en la misma migración, `CREATE OR REPLACE public.is_admin` con la misma firma y sin tocar GRANT, añadiendo la condición de usuario operativo. Cierra todas las filas "No" que dependen de `is_admin`. Efecto: la exención del trigger y las RPC admin también exigen admin operativo (correcto).
- **B:** dejarlo así y documentarlo como riesgo aceptado; las RPC nuevas impiden bloquear al último admin activo.

Los `has_role('director_comercial')` y `puede_editar_bloque` siguen sin estado en ambas opciones; propongo dejarlos fuera de esta migración y tratarlos aparte.

## Segundo punto a confirmar: interruptor de sesiones

Con el orden pedido, si `control_sesiones_activo` está apagado, `verificar_sesion` devuelve vigente antes de mirar el estado y un usuario bloqueado con sesión abierta no sería expulsado por el vigilante (sí perdería datos por RLS). Propongo poner la comprobación de estado **antes** del interruptor. Si prefieres el orden original, lo mantengo.

## A. Migración (una, en drizzle/migrations)
1. Columnas nuevas en `profiles` tal como se piden, con CHECK de estado, CHECK de formato de username (`^[a-z0-9._-]{3,30}$`) e índice UNIQUE sobre `lower(username)`.
2. `prevent_profile_self_escalation`: copia literal de la versión 0003 (exención service_role/admin y las once comprobaciones) más las siete columnas nuevas.
3. `is_approved`: misma firma, sin DROP ni cambio de GRANT, STABLE, añadiendo `estado = 'activo' OR (estado = 'suspendido_temporal' AND bloqueado_hasta <= now())`.
4. `verificar_sesion`: DROP con firma `(text)`, recreación conservando todo y respuesta `{"vigente":false,"motivo":"usuario_bloqueado"}` si no está operativo; GRANT EXECUTE a authenticated restaurado.
5. `admin_cambiar_estado`, 6. `admin_dar_baja`, 7. `admin_asignar_username` según especificación (admin obligatorio, no autobloqueo, no dejar cero admins activos, motivo obligatorio salvo a activo, auditoría, borrado de sesiones; la baja borra también dispositivos e invalida códigos pendientes poniendo `expira_en = now()`). REVOKE de PUBLIC/anon, GRANT a authenticated.
8. Si eliges la opción A: `is_admin` con condición operativa.

## B. useAuth y App
- Estado `bloqueado` escrito solo por `resolverAcceso`, tras la aprobación; expone motivo y `bloqueado_hasta`.
- Vigilante: `usuario_bloqueado` provoca cierre local con el aviso "Tu usuario ha sido bloqueado. Contacta con el administrador."
- Pantalla bloqueante en App con mensaje, hora de fin si es suspensión temporal y botón de cerrar sesión.

## C. Panel de usuarios
Nombre de usuario editable, selector de los cinco estados en español con motivo obligatorio y fecha de fin para suspensión, insignia "Sospechosa", botón "Dar de baja" con confirmación explicativa, bajas ocultas con filtro, motivo/fecha/autor del cambio; tarjetas en móvil sin desplazamiento horizontal. Se amplía la RPC/lectura del listado para traer las columnas nuevas.

## Fuera de alcance
Login por nombre de usuario, bloqueo por intentos, correos, 2FA. No se tocan `registrar_sesion`, `cambiar-password` ni `registrar-evento`.
