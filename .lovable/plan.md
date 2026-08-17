# Dónde se van los 8 s de objetivos_seguimiento (solo diagnóstico)

## 1) Cuerpo completo y puntos sospechosos

```sql
CREATE OR REPLACE FUNCTION public.objetivos_seguimiento(_anio integer)
RETURNS TABLE(...) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_q int; v_f date; v_todos boolean; v_vend text;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RETURN; END IF;              -- (A) 1 llamada
  v_todos := public.is_admin(auth.uid()) OR public.has_role(...);          -- (A) 2 llamadas
  v_vend  := public.get_user_employee_code(auth.uid());                    -- (A) 1 llamada
  v_q := public.quincena_corte(_anio);                                     -- (B) max(fecha) de ventas_diarias
  v_f := public.fecha_corte_datos();                                       -- (B) max(fecha) otra vez

  RETURN QUERY
  WITH obj AS (...),                                                       -- 19 filas
       rutas_obj AS (...),                                                 -- DISTINCT sobre obj
       ventas AS ( ... ventas_diarias JOIN clientes
                   WHERE v.fecha >= make_date(_anio-1,1,1)
                     AND v.fecha <  make_date(_anio+1,1,1)
                     AND (v_todos OR c.vendedor = v_vend)
                   GROUP BY 1,2,3,4 ),                                     -- (C) 262.545 filas leídas -> 722
       agg AS ( obj JOIN ventas ON ... OR ... NOT IN (SELECT ruta FROM rutas_obj) ), -- (D)
       serie AS ( jsonb_agg sobre agg )                                    -- (E)
  SELECT ..., (SELECT SUM(...) FROM agg WHERE id=o.id AND anio=_anio),     -- (F) 3 subconsultas
              (SELECT SUM(...) ... anio=_anio-1 AND q<=v_q),               --     correladas sobre agg
              (SELECT SUM(...) ... anio=_anio-1), ...
  FROM obj o LEFT JOIN serie s ON s.id=o.id ORDER BY ...;
END $$;
```

Inventario de lo que pediste:

- **LOOP explícito: ninguno.** No hay `FOR`, `WHILE` ni cursores. Todo es una única `RETURN QUERY`.
- **Llamadas a funciones dentro de una consulta: una sola**, `public.quincena_de(v.fecha)` en el CTE `ventas`. Es `IMMUTABLE` y `LANGUAGE sql` de una línea, así que **el planificador la inlinea** (se ve en el plan como `EXTRACT(month...)` desnudo, no como llamada). No cuesta nada.
- **Llamadas fuera de consulta (una vez cada una):** `is_approved`, `is_admin`, `has_role`, `get_user_employee_code`, `quincena_corte` (que a su vez llama a `fecha_corte_datos`) y `fecha_corte_datos`. Las dos últimas hacen `max(fecha)` sobre `ventas_diarias`: con índice, microsegundos.
- **Subconsultas correladas: cuatro.** El `NOT IN (SELECT ruta FROM rutas_obj)` dentro del `JOIN` de `agg` (se resuelve como *hashed SubPlan*, una sola vez) y las **tres** `(SELECT SUM(a.importe) FROM agg a WHERE a.id = o.id ...)` del `SELECT` final, que se ejecutan 19 veces cada una sobre un CTE `agg` materializado de 722 filas.

## 2) Tiempo por sección (medido hoy, sin instrumentación de EXPLAIN)

Primero un aviso importante sobre el método: **en esta instancia `EXPLAIN ANALYZE` miente por exceso**. El mismo escaneo de `ventas_diarias` que tarda **346 ms** cronometrado con `clock_timestamp()` aparece como **10.106 ms** dentro de `EXPLAIN ANALYZE`. El reloj del VM es carísimo y la instrumentación por fila multiplica ×30 en nodos de 262.545 filas. Todo lo que sigue está cronometrado sin `EXPLAIN`.

| Sección | Tiempo | Notas |
|---|---|---|
| (A) rol: `is_approved` + `is_admin` + `has_role` + `get_user_employee_code` | < 5 ms | cuatro llamadas escalares |
| (B) `quincena_corte` + `fecha_corte_datos` | < 5 ms | dos `max(fecha)` |
| (C) CTE `ventas` aislado, en frío | 1.817 ms | primera ejecución |
| (C) CTE `ventas` aislado, en caliente (3 pasadas seguidas) | **427 / 515 / 477 ms** | 15.039 buffers, todos *hit* |
| (C)+(D) `ventas` + `agg` | 528 ms | el join con `agg` añade ~50 ms |
| (C)+(D)+(E) hasta `serie` (jsonb_agg) | 810 ms | |
| (F) las tres subconsultas correladas sobre `agg` ya materializado | **3,5 ms** | 57 escaneos de 722 filas |
| Consulta completa con literales, una pasada | 5.396 ms | ver punto 3 |
| Consulta completa con literales, otra pasada | **814 ms** | mismo SQL, mismos buffers |

Las secciones (A), (B), (E) y (F) **suman menos de 20 ms**. No hay ningún bucle ni ninguna correlada cara. Con literales, la función entera debería costar ~800 ms.

## 3) Dónde están los ~7 s

No están en una sección distinta: están en **la misma sección (C)+(D) ejecutada con otro plan**. La prueba es de contabilidad de buffers:

- Tus 19 llamadas reales vía PostgREST: **media 5.230 ms, máximo 7.985 ms, 303.048 buffers en total = 15.950 buffers por llamada.**
- Mi consulta ad-hoc con literales: **814 ms, 15.047 buffers.**

Mismos datos, mismos bloques leídos, **6-10× el tiempo**. No se lee nada de más: se calcula de más. Y lo que cambia entre las dos no es el SQL, es que en la función el año es un **parámetro en tiempo de ejecución** (`_anio`), y `v_todos` / `v_vend` son variables plpgsql.

Reproducido hoy sustituyendo los literales por un valor que el planificador no puede ver:

```text
Hash Join (cost rows=10422) (actual rows=262534)      <- 25× de error
  -> Bitmap Heap Scan on ventas_diarias
       Recheck: fecha >= make_date((pr.a - 1),1,1)     <- estimado 48.135, real 262.545
  Join Filter: (pr.todos OR (c.vendedor = pr.vend))    <- no se puede plegar
Execution Time: 1.205 ms  (y esto solo hasta el CTE ventas)
```

Con literales el planificador estima 263.407 filas y acierta; con el año como parámetro estima 48.135 y se equivoca por 5×, y tras el `GROUP BY` por 25×. Ese error se propaga a `agg` y al `ORDER BY`, y es exactamente el plan que ya vimos la vez anterior: *Nested Loop* con Memoize de 262.545 iteraciones y *Sort* volcando 5,6 MB a disco. Nada de eso consume buffers compartidos extra — de ahí que sean 8 segundos con solo 16.725 buffers.

**Conclusión:** los 465 ms que medí antes eran del CTE `ventas` **con literales**, es decir, de un plan que la función nunca usa. El filtro sargable sí ayudó (permite el *Bitmap Index Scan*), pero no arregla la causa real, que es la **estimación de cardinalidad bajo parámetros** y el plan que se deriva de ella.

### Lo que falta para cerrar el diagnóstico al 100 %

Todo lo anterior está medido de forma indirecta: en modo plan no puedo ejecutar `objetivos_seguimiento` (el rol de consulta no tiene `EXECUTE`) ni hacer `SET LOCAL ROLE authenticated`. La prueba definitiva es un único paso de medición en modo build:

1. Copia temporal de la función instrumentada con `clock_timestamp()` entre secciones (A, B, C, D+E, F), ejecutada bajo `SET LOCAL ROLE authenticated` con tu UUID, y borrada al terminar.
2. `EXPLAIN (ANALYZE, TIMING OFF, BUFFERS)` del cuerpo con los parámetros reales, para ver el plan que se elige de verdad — con `TIMING OFF` para no repetir el error de medición de este hilo.

Eso confirma o desmiente en una sola pasada que el reparto es ~20 ms de todo lo demás y ~7,9 s en `ventas`+`agg`. Sin correcciones hasta tener ese número.
