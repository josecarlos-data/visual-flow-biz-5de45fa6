# Por qué las RLS de visita_bloques hacen seq scan completo de visitas

## 1. Políticas actuales de `visita_bloques` (texto exacto)

Las cuatro son PERMISSIVE, rol `authenticated`.

**SELECT — "ver bloques de visitas visibles"** (USING):
```sql
EXISTS (
  SELECT 1 FROM visitas v
  WHERE v.id = visita_bloques.visita_id
    AND ( is_admin(auth.uid())
       OR has_role(auth.uid(), 'director_comercial')
       OR v.user_id = auth.uid()
       OR ( has_role(auth.uid(), 'jefe_de_zona')
            AND v.cod_cliente IN (SELECT cod_cliente FROM clientes_permitidos(auth.uid())) ) ) )
```

**UPDATE — "editar bloques propios o revisables"** (USING y WITH CHECK, idénticos):
```sql
EXISTS (
  SELECT 1 FROM visitas v
  WHERE v.id = visita_bloques.visita_id
    AND ( v.user_id = auth.uid() OR is_admin(auth.uid()) OR puede_revisar_visitas(auth.uid()) ) )
```

**INSERT — "crear bloques en visitas propias"** (WITH CHECK): mismo cuerpo que el UPDATE.

**DELETE — "borrar bloques propios o admin"** (USING): mismo cuerpo que el UPDATE.

## 2. Funciones auxiliares

Todas son `STABLE SECURITY DEFINER`, `search_path = public`, `COST 100`, y **no** son `LEAKPROOF`:

| Función | Volatilidad | SECURITY DEFINER | Cuerpo |
|---|---|---|---|
| `is_approved(uuid)` | STABLE | sí | EXISTS sobre `profiles` |
| `is_admin(uuid)` | STABLE | sí | EXISTS sobre `user_roles` |
| `has_role(uuid, app_role)` | STABLE | sí | EXISTS sobre `user_roles` |
| `puede_revisar_visitas(uuid)` | STABLE | sí | `is_approved AND (is_admin OR has_role(director) OR has_role(jefe_de_zona))` |
| `clientes_permitidos(uuid)` | STABLE, SRF | sí | recorre `clientes` con `is_approved/is_admin/has_role/get_user_*` |
| `get_user_delegacion / get_user_employee_code` | STABLE | sí | lectura de `profiles` |

Es decir: la marca STABLE ya está bien puesta. Ese no es el fallo.

## 3. Políticas de `visitas`

**SELECT — "Role-scoped view visitas"**:
```sql
is_approved(auth.uid()) AND (
     is_admin(auth.uid())
  OR has_role(auth.uid(),'director_comercial')
  OR (has_role(auth.uid(),'jefe_de_zona') AND cod_cliente IN (SELECT c.cod_cliente FROM clientes c WHERE c.delegacion = get_user_delegacion(auth.uid())))
  OR user_id = auth.uid()
  OR (has_role(auth.uid(),'comercial') AND cod_cliente IN (SELECT c.cod_cliente FROM clientes c WHERE c.vendedor = get_user_employee_code(auth.uid()))) )
```
UPDATE y DELETE siguen la misma forma; INSERT exige `is_approved AND user_id = auth.uid()`.

## 4. Diagnóstico: por qué se hashea en vez de usar el índice

El plan medido lo muestra con precisión:

```text
Filter: (ANY (visita_id = (hashed SubPlan 20).col1)) AND (ANY (visita_id = (hashed SubPlan 28).col1))
  SubPlan 20 -> Seq Scan on visitas v_2   2.000 ms  rows=21492   (política USING de UPDATE)
  SubPlan 28 -> Seq Scan on visitas v_3     744 ms  rows=21492   (política SELECT, con clientes_permitidos)
SubPlan 3 / 10 -> Index Scan using visitas_pkey  3,4 ms / 0,9 ms (WITH CHECK, correlados)
```

El patrón `EXISTS (...)` **ya está escrito como pides**. El problema es que el planificador lo deshace: cuando un `EXISTS` correlaciona por una igualdad simple sobre una columna del relation externo (`v.id = visita_bloques.visita_id`), Postgres aplica `convert_EXISTS_to_ANY` y lo reescribe como

```sql
visita_bloques.visita_id = ANY (SELECT v.id FROM visitas WHERE <resto de condiciones>)
```

Al hacerlo, la correlación desaparece: la subconsulta pasa a ser **independiente de la fila externa**, y el planificador la ejecuta una sola vez, hasheada. Materializar ese hash exige recorrer las 21.492 visitas.

Dos razones por las que el `EXISTS` no se convierte en un semi-join normal (que sí usaría el índice):

- `visita_bloques` es la **relación destino** del UPDATE, y las quals de RLS se evalúan a nivel de scan de esa relación, no como join; el sublink no se puede subir a semijoin.
- El escaneo interno de `visitas` arrastra su **propia RLS**, que Postgres trata como subconsulta con barrera de seguridad. Las funciones `is_admin`, `has_role`, `clientes_permitidos` no son LEAKPROOF, así que sus condiciones se aplican **antes** que la qual correlada, impidiendo el acceso por `visitas_pkey`.

Coste real: 21.492 filas × varias llamadas STABLE de coste 100 (`is_approved`, `is_admin`, `has_role`×3, `get_user_*`) = ~2 s por subplan, 221.483 buffers para tocar una fila. Y se paga **dos veces por UPDATE** (política SELECT + política UPDATE). El mismo mecanismo golpea el `SELECT` de bloques por `visita_id`.

Prueba de que la ruta indexada existe y es barata: los `WITH CHECK` (SubPlan 3 y 10) sí se ejecutan correlados y tardan **3,4 ms y 0,9 ms** con 8 buffers. Es el mismo predicado, ejecutado de la forma correcta: 0,03 % del coste.

## 5. Reformulación propuesta

Reescribir el `EXISTS` no basta: **es precisamente la forma que el planificador convierte en hash**. Añadir `OFFSET 0` o `LIMIT 1` dentro del EXISTS bloquearía la conversión, pero es un truco frágil que depende de la versión de Postgres y no elimina la RLS anidada de `visitas`.

La reformulación correcta es sacar la comprobación de la qual y meterla en una función auxiliar, igual que ya hace el resto del proyecto (`can_view_cliente`, `clientes_permitidos`):

```sql
CREATE FUNCTION public.puede_ver_bloque(_visita_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.visitas v
    WHERE v.id = _visita_id
      AND ( is_admin(auth.uid()) OR has_role(auth.uid(),'director_comercial')
         OR v.user_id = auth.uid()
         OR ( has_role(auth.uid(),'jefe_de_zona')
              AND v.cod_cliente IN (SELECT cod_cliente FROM clientes_permitidos(auth.uid())) ) ) )
$$;
-- y su gemela puede_editar_bloque(_visita_id) con la condición de UPDATE/INSERT/DELETE
```

Las políticas quedan en `USING (puede_ver_bloque(visita_id))` y `USING/WITH CHECK (puede_editar_bloque(visita_id))`, con la misma semántica exacta.

Por qué esto sí usa el índice:

1. No hay sublink en la qual, así que no hay nada que `convert_EXISTS_to_ANY` pueda hashear. La función se invoca una vez por fila candidata, y aquí solo hay una (`id = ...` por PK).
2. Dentro de la función, `_visita_id` es un parámetro constante: el `EXISTS` se resuelve con `visitas_pkey` — la ruta de 0,9 ms ya medida.
3. Al ser SECURITY DEFINER, la lectura interna de `visitas` no reaplica la RLS de `visitas`, que es la que arrastraba `clientes` y `get_user_*` fila a fila. La autorización no se debilita: la condición evaluada es literalmente la misma que hoy contiene la política.

Estimación: de ~1.500 ms a unos pocos ms por fila. Con eso, las 1.104 filas de la importación dejan de acercarse al `statement_timeout` de 8 s y no hace falta tocar el tamaño de instancia.

## 6. Cómo lo verificaríamos antes de dar nada por bueno

1. Crear las dos funciones y reemplazar las cuatro políticas en una migración.
2. Repetir el mismo `EXPLAIN (ANALYZE, BUFFERS)` sobre el bloque `4420d557-…` bajo rol `authenticated`, y exigir: sin `hashed SubPlan`, sin `Seq Scan on visitas`, buffers en decenas y no en cientos de miles.
3. Comprobar la autorización con tres usuarios reales (comercial, jefe de zona, admin): que un comercial siga sin ver ni editar bloques ajenos.
4. Solo después, reintentar la importación completa y medir.

## Fuera de alcance por ahora

`panel_ventas_kpis()` y el `SELECT` lento de bloques comparten síntoma, pero su causa aún no está medida individualmente. Se revisan después de confirmar la mejora en `visita_bloques`.

## Nota de seguridad

Las nuevas funciones son SECURITY DEFINER intencionadas y encajan con la política ya registrada en la memoria de seguridad del proyecto: son funciones auxiliares que las propias RLS necesitan y que comprueban rol internamente. No se amplía ningún permiso: `anon` no recibe EXECUTE.
