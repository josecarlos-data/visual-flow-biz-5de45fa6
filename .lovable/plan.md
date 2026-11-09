# Recarga del Maestro ISI: segura, completa y sin tocar lo que no viene del Excel

## Mi diagnóstico (comprobado hoy en código y base de datos)

1. **Causa del error, confirmada.** La carga llama primero a `reset_maestro_isi_data()`. Esa función vacía tablas que ya no existen (`cliente_productos`, `detalle_ventas`, `ventas_mensuales`), así que falla antes de empezar.
2. **La función además es peligrosa.** También vacía `clientes`, `productos` y `cliente_insights`. Como `clientes` tiene visitas, perfiles, situaciones, ofertas y objetivos colgando, sin CASCADE fallaría y con CASCADE lo borraría todo. Los upsert de clientes y productos ya actualizan sobre lo existente, así que vaciar no hace falta.
3. **Ventas a medias.** Hoy se vacía y se rellena en tandas de 2.000 desde el navegador. Si una tanda falla, la pantalla sigue y luego regenera los resúmenes con las ventas incompletas. Además, `insertar_ventas_diarias(_rows, _reset)` tiene un modo `_reset=true` que vacía ventas y resúmenes. Solo la usa `maestroIsi.ts`; nada en la base de datos la llama.
4. **Fechas.** `datev()` y `timev()` usan `toISOString()`, que pasa a UTC. Las fechas a medianoche hora de España se quedan en el día anterior. Esto pasa también con fechas en texto (`new Date(s)`), no solo con las celdas de fecha. Una pista que encaja, aunque no es prueba: la venta más antigua guardada es del 02/01/2024 y no del 01/01.
5. **Estado actual.** 433.215 líneas de venta (02/01/2024 a 29/07/2026), 11.592 clientes y 67.076 referencias. `ventas_diarias` tiene 15 índices, ningún disparador, ninguna tabla que la referencie, y depende de ella la vista `documentos_resumen`.
6. **El mismo fallo de fechas en otro sitio:** `visitasHistorico.ts`, líneas 23 y 32. No lo toco. Los demás importadores no tienen esta conversión.

## Comparación con tu propuesta

| Punto | Opinión | Ajuste |
|---|---|---|
| A. Fechas con la hora local | De acuerdo | Lo aplico también a fechas en texto. Añado una prueba automática: 01/01/2025 debe dar 2025-01-01 y 08:30 debe dar 08:30:00. |
| B. Tabla de carga sin políticas y sin permisos | De acuerdo | Añado un **identificador de carga** en cada fila. Así, si dos admins suben a la vez, o queda basura de un intento abandonado, no se mezcla. |
| C. preparar / insertar / aplicar | De acuerdo en lo esencial | `preparar` devuelve el identificador y borra cargas anteriores a 24 h. `insertar` y `aplicar` lo reciben. `aplicar` se bloquea para que no corran dos a la vez y comprueba que la carga no esté vacía. El 95 % se mide contra las ventas actuales; si hoy hay 0, se aplica sin aviso. `is_admin` ya exige estar aprobado y operativo, así que mantengo las dos comprobaciones sin coste. |
| C. Borrar `reset_maestro_isi_data()` | De acuerdo | La borro con su firma exacta, sin parámetros. |
| C. `insertar_ventas_diarias` se queda | De acuerdo, con una crítica | Queda sin uso y con su modo que vacía todo. No la toco, como pides. Recomiendo retirarla más adelante. |
| D. Orden de pasos | **Lo cambio** | Primero se suben todas las tandas a la tabla de carga y después los upsert de clientes y productos. Si falla una tanda, se para **sin haber tocado nada**. En tu orden, clientes y productos ya se habrían actualizado. |
| D. Aviso del 95 % | De acuerdo | Muestra los dos recuentos y un botón «Aplicar de todas formas», que reutiliza la carga ya subida sin volver a subirla. |
| E. Tiempo máximo | De acuerdo, con una duda | `refrescar_documentos_resumen` usa `SET LOCAL statement_timeout = '10min'` y hago lo mismo. No sé si un cambio hecho dentro de la función amplía el límite de la llamada que ya está en curso. Lo mido en la prueba: si el traspaso se acerca al límite, me detengo y te lo explico antes de buscar otra forma. |
| Bloqueo durante el traspaso | Omisión | Vaciar la tabla deja a quien consulte ventas esperando durante el traspaso (estimo menos de un minuto) y después ve los datos nuevos completos. Nunca ve ventas a medias. Conviene cargar fuera de horas punta. |
| Auditoría | Omisión | `aplicar` deja en Auditoría una línea «carga Maestro ISI» con las filas antes y después, el rango de fechas y si se forzó. |

## Plan final

1. **Una migración en `drizzle/migrations` (0038)**
   - Tabla `ventas_diarias_carga` con las mismas columnas que inserta `insertar_ventas_diarias`, más `carga_id`. Lleva RLS sin políticas, se quitan todos los permisos a anon y authenticated, y service_role los conserva.
   - `preparar_carga_ventas()` devuelve un identificador. `insertar_ventas_carga(_carga uuid, _rows jsonb)` lleva la misma lógica de filtrado y conversión que hoy. `aplicar_carga_ventas(_carga uuid, _forzar boolean DEFAULT false)` hace todo en una transacción: bloqueo, regla del 95 %, vaciar ventas, copiar, borrar esa carga, línea de auditoría, y devuelve filas y fechas mínima y máxima.
   - Las tres son SECURITY DEFINER con `search_path` fijo, exigen admin («No autorizado»), quitan el permiso a PUBLIC y anon y lo dan a authenticated.
   - `DROP FUNCTION public.reset_maestro_isi_data();`
   - No vacía clientes, productos ni informes de IA, sin CASCADE, y no toca los upsert ni los refrescos.
2. **`maestroIsi.ts`**: corregir fechas y horas. Nuevo orden: preparar → tandas a la carga (se para al primer fallo) → upsert de clientes → upsert de productos → aplicar → `refrescar_resumenes_admin` → `refrescar_documentos_resumen`. Si salta el aviso del 95 %, devuelve los recuentos y el identificador.
3. **Gestión de Datos**: muestra el aviso con los dos recuentos y el botón «Aplicar de todas formas», que termina la carga y los refrescos.
4. **Prueba** en una transacción que se deshace, con identidades ficticias y sin el Excel real:
   - Una carga pequeña da el aviso del 95 % y las ventas quedan intactas.
   - Un usuario que no es admin recibe «No autorizado» en las tres funciones.
   - authenticated no puede leer la tabla de carga.
   - Mido cuánto tarda el traspaso completo forzado y compruebo que no queda nada aplicado.
   - Ejecuto la prueba automática de fechas.

Al terminar te digo qué ficheros cambian y que solo hay una migración nueva. La carga real la haces tú.
