# Fase 4 — Promoción automática de hechos de perfil desde las visitas

Un trigger sobre `visita_bloques` convierte los campos de un bloque en hechos de perfil, sin tocar el código de la voz ni el del importador CSV.

## Contraste con el esquema real (comprobado)

- **`v_visita_bloques_campos` sirve tal cual.** Ya expone `visita_id`, `bloque_id`, `cod_cliente`, `fecha`, `vendedor`, `motivo_key`, `campo_key`, `valor_texto` (recortado), `valor_num`, `valor_fecha`, `confianza` y `cita`, y su `WHERE` ya descarta los valores vacíos o nulos (punto 3 resuelto por la propia vista). Lo único que no trae es el origen (`campos_meta->'_origen'->>'fuente'`), que el trigger leerá directamente del registro nuevo; no hace falta modificar la vista.
- **El CHECK de `fuente` admite** `voz`, `importacion`, `manual`, `erp`. Los dos valores que escribirá el trigger son válidos. Mapeo: `_origen.fuente = 'texto_externo'` → `importacion`; cualquier otro valor o ausencia → `voz`. Hoy hay 768 bloques con `texto_externo` y 20.759 sin `_origen`.
- **El CHECK de `confianza`** admite `alta` / `media` / `baja` o null, y los valores reales en la vista son exactamente esos (más algunos nulos). Encaja sin normalizar.
- **Existe el UNIQUE `(bloque_id, atributo_key)`**, así que el upsert del punto 1 es directo con `ON CONFLICT (bloque_id, atributo_key) DO UPDATE`.
- **Mapeo activo:** 15 campos del motivo `informacion_potencial` tienen `perfil_atributo_key`, y los 15 atributos existen en `perfil_atributos`. Cuatro son numéricos (`num_mecanicos`, `num_electromecanicos`, `num_vehiculos`, `potencial_estimado`); solo en esos se rellena `valor_num`.

## Cómo se resuelve el punto 2 (hechos huérfanos)

Dentro de la misma ejecución del trigger, después del upsert:

```text
DELETE FROM cliente_perfil_datos
WHERE bloque_id = NEW.id
  AND fuente <> 'manual'
  AND atributo_key NOT IN (<atributos promovidos en esta pasada>)
```

El conjunto de atributos promovidos sale de la propia consulta a la vista para `NEW.id`. Así, un CSV corregido que elimina un campo deja de tener el hecho correspondiente, y los hechos manuales (`bloque_id` null) nunca entran en ese `DELETE`.

## Detalle técnico

Migración con:

1. `promover_perfil_desde_bloque()` — `SECURITY DEFINER`, `search_path = public`, trigger `AFTER INSERT OR UPDATE ON public.visita_bloques FOR EACH ROW`.
2. Cuerpo envuelto en `BEGIN ... EXCEPTION WHEN OTHERS THEN RETURN NEW; END;` para que ningún fallo de promoción tumbe el guardado de la visita (punto 5). Se registra el error con `RAISE WARNING`.
3. Salida temprana sin hacer nada si la visita no tiene `cod_cliente` (visitas a cliente externo) o si el bloque no tiene campos mapeados.
4. Inserción desde `v_visita_bloques_campos` filtrada por `bloque_id = NEW.id`, unida a `motivo_campos` por `(motivo_key, campo_key)` con `perfil_atributo_key IS NOT NULL` y `is_active`, y a `perfil_atributos` para saber si el atributo es numérico:
   - `observado_en` = `fecha` de la visita (nunca `now()`),
   - `estado` = `'sin_confirmar'` siempre,
   - `valor_num` solo cuando `perfil_atributos.tipo = 'numero'`,
   - `ON CONFLICT (bloque_id, atributo_key) DO UPDATE` de valor, confianza, cita, fuente, fecha y comercial, **con `WHERE cliente_perfil_datos.fuente <> 'manual'`** como salvaguarda extra del punto 4.
5. `DELETE` de huérfanos descrito arriba.

No se incluye backfill de bloques existentes: se lanzará aparte tras verificar el trigger con una visita nueva.
