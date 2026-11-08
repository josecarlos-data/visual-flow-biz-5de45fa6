# Proteger la validación de visitas en el servidor (0035)

## 1. Mi diagnóstico (revisado en base de datos y código)

Confirmo los dos huecos de Claude y encuentro otros cinco:

| # | Hueco | Dónde |
|---|---|---|
| A | El comercial puede cambiar `validacion`, `revisado_por`, `revisado_en`, `nota_revision` de su visita | Política UPDATE "Users update own visitas", sin trigger |
| B | El comercial puede **crear** la visita ya validada (y con `revisado_por` de otro) | Política INSERT solo mira `user_id` |
| C | El jefe de zona puede insertar/editar/borrar bloques de cualquier delegación | `puede_editar_bloque()` no mira `puede_ver_bloque()` |
| D (nuevo) | El comercial puede cambiar **fecha, cliente, tipo, resultado, motivo** de una visita ya validada. Eso mueve el KPI (mes, cliente, efectiva/no efectiva) sin pasar por revisión | Misma política UPDATE |
| E (nuevo) | El comercial puede **borrar** una visita sin bloques ya validada (no efectiva Correcta). El guardián de bloques solo protege si hay bloques validados | Política DELETE |
| F (nuevo) | El jefe de zona puede validar la cabecera de visitas **sin cliente** (`cod_cliente IS NULL`) de cualquier delegación: la política UPDATE las deja pasar a todos | Política UPDATE |
| G (nuevo) | `revisado_por` lo manda la pantalla: cualquier revisor podría firmar como otro | `useRevisionMutations` y Revisión de bloques |

Lo que está bien: guardián de bloques (0034), `completar_bloque()`, mensajes con autor por trigger. La app **nunca** actualiza `visitas` como comercial: solo inserta en Nueva visita; las actualizaciones vienen de Revisión y Reanalizar (revisores) y del trigger que deriva la cabecera de los bloques. `cerrar_planificada_con_visita` y `visitas_rellenar_comercial` no tocan validación.

**Trampa que hay que evitar:** `recalcular_validacion_visita()` actualiza `visitas.validacion` dentro de la sesión del comercial (p. ej. cuando `completar_bloque()` pasa un No correcto a Pendiente). Un trigger que "conserve la validación si no es revisor" lo bloquearía y la cabecera se quedaría en No correcto. Hay que dejar pasar las actualizaciones que vienen de ese trigger (`pg_trigger_depth() > 1`, que la app no puede forjar).

## 2. Comparación con la propuesta de Claude

- **Punto 1 (trigger en visitas):** de acuerdo, pero se queda corto: no cubre D, E ni F, y rompería la derivación desde bloques si no se exceptúa el trigger (ver trampa). Mejor: **lanzar error** en vez de conservar en silencio cuando el comercial toca la validación, igual que el guardián de bloques; así un fallo no pasa desapercibido. En INSERT sí se fuerza en silencio (pendiente, sin revisor), como en bloques.
- **Punto 2 (revisar escrituras):** hecho arriba; no choca nada.
- **Punto 3 (`puede_editar_bloque`):** de acuerdo. Sin cambiar la firma (`CREATE OR REPLACE`, sin DROP ni GRANT).
- **Punto 4 (sin sesión, admin, director):** de acuerdo. Añado: el revisor solo puede validar cabeceras que puede ver (cierra F) y `revisado_por/revisado_en` los pone el servidor (cierra G).

## 3. Plan final — una migración `0035`

1. **`visitas_guard_validacion()`** BEFORE INSERT OR UPDATE OR DELETE en `visitas`, `SECURITY DEFINER`, `search_path=public`:
   - Sin sesión, o `pg_trigger_depth() > 1` (derivación desde bloques): sin cambios.
   - Admin y director: sin restricción, salvo que si cambian `validacion` o `nota_revision` el servidor fija `revisado_por = auth.uid()` y `revisado_en = now()`.
   - Jefe de zona: puede validar solo si `puede_ver_bloque(id)`; si no, error «No puedes revisar visitas de otra delegación». Firma igual que arriba.
   - Resto (comercial, marketing):
     - INSERT: `validacion='pendiente'`, `nota_revision`, `revisado_por`, `revisado_en` a NULL.
     - UPDATE: si cambia cualquiera de las cuatro columnas de revisión → error «La validación solo la puede cambiar un revisor». Si la visita ya está CORRECTO o NO CORRECTO y cambia `fecha`, `cod_cliente`, `cliente_externo`, `tipo`, `resultado_visita`, `motivo_key` o `user_id` → error «Esta visita ya está revisada y no se puede cambiar».
     - DELETE: si la cabecera está CORRECTO o NO CORRECTO → error «Esta visita está validada y no se puede borrar» (mismo texto que ya usa el guardián de bloques para el caso con bloques).
2. **`puede_editar_bloque(_visita_id)`**: dueño, admin, director, o jefe de zona con `puede_ver_bloque(_visita_id)`. Misma firma y GRANT.
3. Sin tocar políticas, tablas ni el guardián de bloques. El cliente no cambia: el servidor ignora el `revisado_por` que manda.

## 4. Puntos para debatir

- **Autovalidación:** un jefe de zona o el director que registre visitas propias puede validarlas él mismo. ¿Lo prohibimos (revisor ≠ dueño, salvo admin)?
- **Bloques añadidos tarde:** el comercial puede añadir un motivo nuevo a una visita ya validada (queda Pendiente y la cabecera vuelve a Pendiente). No suma KPI sin revisión, pero reabre la visita. ¿Lo bloqueamos?
- **Visitas a clientes ajenos:** el comercial puede registrar visitas a cualquier cliente; fuera de este cambio.
- **Coherencia del jefe de zona:** la política de visitas usa `delegacion` y `puede_ver_bloque` usa `clientes_permitidos()`. No lo unifico ahora; lo señalo.

## 5. Pruebas (transacción que se deshace, identidades simuladas, sin cuentas reales)

Comercial: registra visita (pendiente aunque mande CORRECTO y otro revisor); no puede validar su cabecera; no puede cambiar fecha/cliente de una visita validada ni borrarla; sí puede borrar una pendiente; `completar_bloque()` de un No correcto deja la cabecera en Pendiente (derivación intacta). Jefe de zona: edita bloques y valida cabecera de su delegación; error en otra delegación y en visitas sin cliente ajenas. Director y admin: sin cambios; `revisado_por` queda con su propio id aunque manden otro. Sin sesión: todo pasa.

Al acabar: ficheros cambiados (solo la 0035) y resultado de cada prueba.
