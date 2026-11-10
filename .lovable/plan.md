# Registro de visitas fiable (0042)

## Comprobación previa (solo lectura)
- Visitas con origen 'app' en total: 39.
- Visitas 'app' con resultado 'efectiva' y **ningún bloque: 0**. No hay nada que listar ni tocar.
- Confirmado en base de datos: `hora` no tiene valor por defecto; `fecha_registro` sí (now()); el trigger de agenda cierra la parada por usuario+cliente+fecha pero se traga cualquier error; la regla de alta de visitas solo exige usuario aprobado y `user_id = auth.uid()`; los aprobados pueden leer `app_settings`.

## Diagnóstico propio
1. Guardado en dos pasos sin transacción: visita sí, bloques no -> visita a medias; reintento -> visita duplicada (sin id estable). Coincido.
2. Hora: nunca se envía y no hay default -> siempre vacía. Coincido.
3. Ubicación: se pide siempre; en llamadas o fechas pasadas no representa la visita y además puede fijar mal las coordenadas del cliente para siempre. Coincido.
4. Fecha libre: futura o muy antigua, y el KPI cuenta por esa fecha. Coincido.
5. Adicional: `vendedor` lo pone la pantalla (employeeCode del cliente) y "hoy" sale de la zona horaria del móvil, no de Madrid. Los documentos se suben antes de crear la visita: si se abandona tras un fallo quedan ficheros huérfanos (aceptable, se documenta).
6. Adicional: si el insert directo sigue abierto, cualquier regla que solo esté en la función se puede saltar con una llamada directa a la tabla.

## Comparación con la propuesta de Claude
- Función única transaccional, id generado en pantalla, idempotente: **de acuerdo**. Matiz: usar `INSERT ... ON CONFLICT (id) DO NOTHING` y después comprobar de quién es, para que dos pulsaciones simultáneas no den error de clave.
- SECURITY INVOKER: **de acuerdo** (conserva reglas y triggers).
- Servidor pone user_id, origen, estado: **de acuerdo**, y añado `vendedor` (código del empleado del perfil) y `motivo_key` legado (primer bloque).
- Hora solo si fecha = hoy Madrid: **de acuerdo**.
- Ubicación solo si no es llamada y fecha = hoy; coordenadas del cliente solo si vacías: **de acuerdo**, reutilizando la misma comprobación (`can_view_cliente`, rangos válidos).
- Límite de fecha solo en la función: **discrepo**. Debe vivir en un trigger BEFORE INSERT/UPDATE OF fecha de `visitas` (nuevo, separado de `visitas_guard_validacion`, que no se toca), aplicado a origen 'app', con usuario conectado y no admin. Así ningún camino lo salta; la función solo da el mensaje claro. Importación (sin usuario/otro origen) y revisión no se ven afectadas.
- Cerrar el insert directo a comerciales: **sí, conviene**, pero sin quitar la regla de acceso (la función INVOKER la necesita). Propuesta: la función marca la transacción con un indicador local (`set_config(..., true)`) y el mismo trigger rechaza altas 'app' sin ese indicador salvo admin. El indicador no se puede activar desde la API y desaparece al acabar la transacción.
- Visita no efectiva con bloques: Claude los descarta en silencio; **prefiero error** («Una visita no efectiva no lleva bloques»), porque la pantalla nunca los envía y un envío así es un fallo que conviene ver. Menor; acepto descartar si lo prefieres.
- agenda_marcada: como el trigger se traga errores, se calcula leyendo si la parada quedó con ese visita_id. **De acuerdo** con devolverlo.
- Motivo inexistente: la clave foránea hace fallar todo y se deshace la visita. **De acuerdo**.
- Permisos REVOKE PUBLIC/anon + GRANT authenticated: **de acuerdo**.
- Pantalla (id estable, sin insert/crearBloques/geo/agenda, reintento sin resubir documentos, posición condicional, min/max): **de acuerdo**; "hoy" y min/max calculados en hora de Madrid.
- crearBloques se conserva para reanalizar: **de acuerdo**.
- Ajuste `visita_dias_atras_max` = 7 editable por admin: **de acuerdo**; exento solo admin (director no). Si el ajuste falta o no es número, se usa 7.

## Plan final
1. Migración única `0042_registrar_visita.sql`:
   - Insertar ajuste `visita_dias_atras_max` = 7 si no existe.
   - Función auxiliar de límite de fecha + trigger nuevo en `visitas` (fecha y bloqueo de alta directa 'app').
   - `registrar_visita(_id, _visita, _bloques)` con las reglas anteriores; devuelve `{id, ya_existia, agenda_marcada}`.
   - Permisos de ejecución solo para authenticated.
2. `NuevaVisita.tsx`: id fijo por formulario, una sola llamada, reintento con mismo id y documentos ya subidos guardados en memoria, posición condicional, fecha con min/max.
3. Pantalla de ajustes: campo para «Días atrás máximos para registrar una visita».
4. Pequeña utilidad de límites de fecha (Madrid) con su prueba.

## Pruebas (transacción que se deshace, identidades simuladas, sin cuentas reales)
Las siete pedidas, más: insert directo de comercial con origen 'app' -> rechazado; cambiar fecha de una visita a hace 30 días como comercial -> rechazado; admin sí puede. Recuento final: cero filas nuevas.

## No se toca
Gespromo, revisión, conversación, visita-voz, `visitas_guard_validacion` y demás triggers/políticas existentes, resto de pantallas.

## Ficheros previstos
- `drizzle/migrations/0042_registrar_visita.sql` (única migración nueva)
- `src/pages/NuevaVisita.tsx`
- `src/components/AppSettingsCard.tsx`
- `src/lib/fechaVisita.ts` + `src/lib/fechaVisita.test.ts`
