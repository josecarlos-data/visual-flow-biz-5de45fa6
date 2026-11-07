# Completar datos del bloque por el comercial tras la revisión

## 1. Diagnóstico propio (código y base de datos revisados)

Confirmo lo que describe Claude y añado lo que he encontrado:

- **El guardián actual solo actúa en UPDATE.** `visita_bloques_guard_revision` es `BEFORE UPDATE`. No hay nada en **INSERT** ni en **DELETE**:
  - Un comercial puede **insertar** un bloque en su visita ya con `validacion='CORRECTO'` y `revisado_por` cualquiera. La cabecera se recalcula y la visita sale como Correcta sin que nadie la haya revisado. Es un hueco real, hoy abierto.
  - Puede **borrar** cualquier bloque suyo, validado o no.
- **En UPDATE, el dueño puede cambiar más que `campos`:** `visita_id` (mover un bloque a otra visita suya), `motivo_key`, `orden`, `campos_meta` y `completo`.
- **Editar `campos` dispara `promover_perfil_desde_bloque`.** Los valores nuevos pasan a la ficha del cliente como `sin_confirmar`, pero con la `cita` y la `confianza` de la IA, que ya no corresponden. Hay que marcar en `campos_meta` que ese campo lo escribió el comercial.
- **«Reanalizar» es más grave de lo que parece:** borra los bloques y, por las claves foráneas, **se borran en cascada los datos de perfil del cliente** que salieron de esos bloques (también los ya confirmados), y los mensajes pasan a `bloque_id NULL`.
- **`puede_editar_bloque` deja editar cualquier visita a cualquier revisor**, incluido un jefe de zona con visitas de otra delegación (no mira `puede_ver_bloque`). No es de este cambio, pero conviene saberlo.

## 2. Mi propuesta (antes de comparar)

- Guardar mediante **una función de servidor** `completar_bloque(bloque, campos, version)` que, en una sola operación: comprueba que eres el dueño y que el bloque no está Correcto, verifica que nadie lo ha tocado desde que lo abriste (`updated_at`), guarda solo los campos de la plantilla que han cambiado, pasa No correcto a Pendiente y **escribe el mensaje «He completado: …» con las etiquetas de la plantilla**. Todo o nada.
- Un guardián en la tabla como red de seguridad para cualquier otra vía (INSERT, UPDATE y DELETE).

## 3. Comparación con la propuesta de Claude

| Punto | Claude | Yo | Mejor |
|---|---|---|---|
| Regla en el servidor | UPDATE/DELETE | UPDATE/DELETE **e INSERT** | Mía: el INSERT es un hueco abierto hoy |
| Columnas que puede tocar el dueño | Solo `campos` | Igual, y fijar explícitamente `visita_id`, `motivo_key`, `orden` | Coincidimos; lo concreto |
| Correcto no se cambia | Sí | Sí | Coinciden |
| No correcto → Pendiente | Sí, sin revisor ni fecha | Sí, pero **conserva `revisado_por`** como último revisor para saber a quién avisar | Debatible (ver más abajo) |
| Mensaje a Fran | Lo crea la pantalla | Lo crea el servidor en la misma operación | Mía: si la pantalla falla entre el guardado y el mensaje, Fran nunca se entera |
| Fran valida mientras se edita | Lo frena la regla de Correcto | También detecta **cualquier** cambio (p. ej. Fran marca No correcto con otra nota) | Mía: la de Claude no cubre ese caso |
| Ficha del cliente | No lo menciona | Marcar en `campos_meta` el origen «comercial» | Mía: si no, la ficha enseña una cita de la IA que no corresponde |
| Reanalizar | Fuera de alcance | Cerrar ya lo mínimo | Mía: borra datos de perfil ya confirmados |

**Sobre limpiar revisor y fecha al volver a Pendiente:** Claude los vacía. Yo propongo vaciar `revisado_en` y mantener `revisado_por`, para que el aviso y la lista de Revisión sepan quién lo había marcado. Si prefieres que quede limpio del todo, se hace como dice Claude: el aviso no depende de ello, porque sale del mensaje.

## 4. Plan final

### Imprescindible

1. **Migración 0034**
   - Guardián nuevo en `visita_bloques` (`BEFORE INSERT OR UPDATE OR DELETE`) para quien no es revisor ni admin (sin sesión = migraciones, no se toca):
     - INSERT: fuerza `validacion='PENDIENTE'` y vacía nota, revisor y fecha.
     - UPDATE: rechaza si el bloque está Correcto («Este bloque ya está validado y no se puede cambiar»). Conserva `visita_id`, `motivo_key`, `orden` y los campos de revisión. Si cambian `campos` y estaba No correcto → Pendiente.
     - DELETE: rechaza si está Correcto o No correcto.
     - Sustituye al guardián actual (se elimina el trigger viejo; la función vieja se deja sin uso y se marca como retirada).
   - Función `completar_bloque(_bloque_id uuid, _campos jsonb, _updated_at timestamptz)` `SECURITY DEFINER`: comprueba dueño, aprobado y estado; compara `_updated_at` y si no coincide devuelve «Fran ha revisado este bloque mientras lo editabas»; guarda solo claves de la plantilla activa; marca esas claves en `campos_meta` con origen comercial y fecha; crea el mensaje con las etiquetas cambiadas. Si no cambió nada, no guarda ni escribe mensaje. `GRANT EXECUTE` solo a `authenticated`.
   - Auditoría: ya existe por trigger; no se añade más.
2. **Pantalla «Avisos de revisión» (móvil)**: cada bloque enseña sus datos con `camposVisita.ts`. Pendiente o No correcto: botón «Completar datos» que abre un formulario a pantalla completa con `CampoVisita` y los valores actuales. Correcto: «Validado, no se puede cambiar». Al fallar por conflicto: aviso claro y recarga del bloque.
3. **Revisión**: el bloque se ve ya actualizado y le sale «Respuesta nueva» por el mensaje.

### Recomendable

4. **Reanalizar**: desactivarlo cuando algún bloque de la visita no esté Pendiente o tenga mensajes, con el motivo visible. Evita perder validaciones, mensajes por bloque y datos de perfil confirmados. Solo pantalla, sin migración.
5. En Revisión, resaltar los campos que ha completado el comercial (sale de `campos_meta`).
6. Aparte: limitar `puede_editar_bloque` para revisores a las visitas que pueden ver. Plan propio si quieres.

### Fuera de alcance

Añadir o quitar motivos, editar la cabecera de la visita, la biblioteca.

## Pruebas

- Base de datos, en una transacción que se deshace, con identidades simuladas: dueño completa un bloque No correcto (pasa a Pendiente y mensaje creado); dueño en bloque Correcto (rechazado); conflicto de versión; insertar bloque con Correcto (queda Pendiente); borrar bloque validado (rechazado); otro comercial (rechazado); revisor y admin sin cambios.
- Ni Bautista ni cuentas reales. La prueba en pantalla la haces tú con la visita PRUEBA del domingo.

## Detalles técnicos

- Archivos: `drizzle/migrations/0034_completar_bloque.sql`, `src/pages/MisRevisiones.tsx`, componente nuevo `CompletarBloqueDialog.tsx`, hook en `useVisitaMensajes.ts` o `useCrm.ts`, `RevisionVisitas.tsx` (punto 4 y 5).
- La función es nueva: no hace falta DROP de firma previa.
- Adjuntos del formulario: se suben a la carpeta del usuario al guardar; si se cancela no se sube nada.
