# Corrección de esquema: `cliente_perfil_datos` antes de la fase 2

Modo Plan. No se ejecuta nada todavía. Cuando se apruebe: solo migración SQL, sin tocar componentes, páginas ni edge functions.

## Contraste con el esquema real

Verificado contra la base de datos actual (tabla vacía):

- `cliente_perfil_datos.confianza` es hoy `numeric` y debe pasar a `text`. Quienes la escriben (`visita-voz` y el importador CSV) usan siempre `'alta' | 'media' | 'baja'`, y la vista `v_visita_bloques_campos` la expone como texto (`->>`). No hay CHECK actual sobre la columna.
- `cliente_perfil_datos` no tiene columna `cita`. La vista `v_visita_bloques_campos` sí expone `cita` como texto desde `campos_meta ->> 'cita'`. Añadir la columna al hecho de perfil permite mostrar la frase literal de la que se extrajo el valor.
- `v_cliente_perfil_vigente` es la única vista que depende de `cliente_perfil_datos`. Aunque la migración anterior declaró crearla con `SELECT *`, la definición real ya lista las columnas explícitas. De cualquier forma, hay que recrearla para que refleje el tipo `text` de `confianza` y la nueva columna `cita`.
- Índices: ninguno de los 5 índices de `cliente_perfil_datos` (`pkey`, `bloque_atributo_key`, `vigente_idx`, `atributo_idx`, `visita_idx`) hace referencia a `confianza` ni a `cita`, así que no necesitan cambios.
- Políticas RLS: las 4 políticas de `cliente_perfil_datos` y las 4 de `perfil_atributos` no mencionan `confianza` ni `cita`; no se ven afectadas.
- Triggers: no existe ningún trigger sobre `cliente_perfil_datos` ni `perfil_atributos` en el esquema actual. La migración anterior anunciaba crear `update_updated_at_column()` en ambas tablas, pero no quedó registrado. Esta corrección no depende de ello, pero se aprovecha para añadirlos realmente si se aprueba.
- Restricciones: el CHECK de `fuente` permite `'voz', 'importacion', 'manual', 'erp'`; el CHECK de `estado` permite `'sin_confirmar', 'confirmado', 'descartado'`. Son compatibles con el cambio de tipo.

## Migración a aplicar

1. **Recrear la vista** `v_cliente_perfil_vigente` como `DROP ... CASCADE` seguido de `CREATE OR REPLACE VIEW ... WITH (security_invoker = true)` con la lista explícita de columnas, para incluir:
   - `confianza text` (en lugar de `numeric`)
   - `cita text` (nueva, nullable)
2. **ALTER TABLE** `public.cliente_perfil_datos`:
   - `ALTER COLUMN confianza TYPE text` (tabla vacía, sin conversión de datos).
   - `ADD COLUMN cita text` (nullable).
3. **Opcional y recomendado**: añadir CHECK `confianza IN ('alta', 'media', 'baja')` para que el esquema refuerce el vocabulario que ya usan voz e importador. Si se prefiere mantenerlo libre, se omite.
4. **Triggers** `update_updated_at_column()` reales sobre `cliente_perfil_datos` y `perfil_atributos`.
5. **GRANT SELECT** sobre la vista recreada para `authenticated` y `service_role` (reaplicar, porque `DROP CASCADE` elimina los privilegios anteriores).
6. No se inserta ningún dato en `cliente_perfil_datos`.

No se toca `bloquesExtraccion.ts`, `visita-voz/index.ts`, componentes ni páginas.