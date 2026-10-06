# Duración máxima de sesión y auditoría de cambios en usuarios

## Respuesta previa: claim `amr`

- **Sí lo incluye.** Al iniciar sesión con contraseña, el servicio de acceso guarda por sesión una entrada «método `password` + hora» y la vuelca en `amr` en cada token: `[{"method":"password","timestamp":<epoch>}]`. Lo he comprobado en la base: hay entradas `password` ligadas a sesiones reales (la última, de hoy a las 12:45 UTC).
- **Se conserva igual al refrescar el token.** La entrada va ligada a la sesión, no al token, y el refresco la vuelve a leer sin cambiarla. Al verificar el segundo factor se añade una entrada `totp` aparte; la de `password` no se toca.
- **Un caso límite que tienes que decidir:** las sesiones que abre la herramienta interna de pruebas no llevan `amr`; lo he comprobado en la sesión de Bautista. Las sesiones de usuarios reales, que entran por `iniciar-sesion` con contraseña, siempre lo llevan. Propongo: **si falta la marca `password`, no aplicar la caducidad** (la sesión sigue vigente) y registrar `motivo` en Auditoría solo la primera vez. La otra opción sería tratarla como caducada. Dime cuál prefieres; el plan usa la primera.

## A. Duración máxima de sesión

1. `app_settings`: `sesion_duracion_horas = '12'` (lo inserto como dato, fuera de la migración). Si está vacío o vale `0`, no hay límite.
2. `verificar_sesion`: `DROP FUNCTION` con la firma exacta y se vuelve a crear con el cuerpo actual copiado literalmente. Añado un solo bloque **después** de la comprobación de estado y **antes** del interruptor `control_sesiones_activo`:
   - Leo las horas. Si son > 0, tomo el `timestamp` de la entrada `password` de `auth.jwt()->'amr'`. Si `now() - to_timestamp(ts)` supera las horas, devuelvo `{"vigente":false,"motivo":"sesion_caducada"}`.
   - Este bloque no lee `sesiones_activas`, así que la regla «sin filas = vigente» no lo salta.
   - Vuelvo a dar `GRANT EXECUTE` a authenticated. Comparo `pg_get_functiondef` y `proacl` antes y después.
3. `useAuth`:
   - Con motivo `sesion_caducada`, se cierra la sesión igual que en la expulsión: `signOut({scope:'local'})`, se borra `crm_sesion_id` y se limpia el estado local. Aviso propio: «Tu sesión ha caducado. Vuelve a iniciar sesión.»
   - El vigilante hace una comprobación inmediata al entrar en `activo`, además del intervalo de 20 s y sin quitar la protección contra solapamientos.
4. Panel (`SeguridadAccesoCard`): campo numérico «Duración máxima de sesión (horas)» (0 = sin límite), con entero 0–720 y botón Guardar. Registra `cambio_config_seguridad`.

## B. Auditoría de cambios en usuarios

Función nueva `public.auditar_cambio_usuario()` (`auditar_cambio` no se toca). SECURITY DEFINER, `search_path=public`, sin GRANT EXECUTE y con `REVOKE` de PUBLIC. Triggers AFTER INSERT OR UPDATE OR DELETE en `profiles`, `user_roles` y `user_dashboard_access`.

- Tipos `usuario_alta`, `usuario_cambio` y `usuario_baja`. `entidad` = tabla; `entidad_id` = usuario afectado.
- Si `auth.uid()` es nulo, `user_id` queda null y `detalle.origen = 'sistema'`; si no, `origen = 'usuario'`.
- En UPDATE: lista de campos cambiados, sin `created_at` ni `updated_at`. Si no cambia nada, no escribe.
- Antes y después solo para: `is_approved`, `estado`, `estado_motivo`, `ver_margen`, `exige_2fa`, `sesiones_max`, `dispositivos_max`, `debe_cambiar_password`, `username`, `marcada_sospechosa` y `role`. Del resto, solo el nombre del campo.
- Todo dentro de `EXCEPTION WHEN OTHERS`: un fallo de auditoría nunca bloquea la operación original.
- Fuera de la migración: añado los tres tipos a `TipoEvento` y a las etiquetas de Auditoría para que se vean con nombre legible. La función de servidor `registrar-evento` no cambia, porque la escritura la hace el trigger.

## Detalles técnicos
- Una sola migración: `verificar_sesion` + `auditar_cambio_usuario` + tres triggers.
- Fuera de alcance: correo, `registrar_sesion`, `iniciar-sesion`, `cambiar-password`, `admin-segundo-factor` y los textos del segundo factor.
- Verificación: con un JWT simulado (`set_config('request.jwt.claims')`) con `amr` de hace 13 h, la respuesta es `sesion_caducada`; con uno de hace 1 h, es vigente. Además, un UPDATE de prueba en un perfil deja un evento con los campos correctos; después lo revierto.
- Nota: las pruebas del segundo factor (reseteo y limpieza) siguen pendientes y no se mezclan con este cambio.
