# Ajustes pequeños en Auditoría y Consultas

Una sola migración nueva: `drizzle/migrations/0013_auditoria_ip_y_consultas_ajustes.sql`. Todo con `CREATE OR REPLACE`, mismas firmas y tipo de retorno, sin DROP ni cambios de permisos.

## 1. Margen de historial
En `consultas_por_usuario`, la comprobación pasa a `v_primera <= v_base_desde + interval '2 days'`. El resto de la función, igual.

## 2. IP y navegador
- `auditar_cambio`: añade `ip` y `user_agent` desde `request.headers`, con el mismo bloque que la 0011 (cf-connecting-ip o primer valor de x-forwarded-for, dentro de BEGIN/EXCEPTION). Sigue ignorando los cambios sin usuario, así que siempre hay usuario cuando se guarda.
- `consultas_por_usuario` y `consultas_por_cliente`: el evento `consulta_actividad` guarda también `ip` y `user_agent` con ese mismo bloque.
- Copio la definición vigente de cada función (de la base) y solo añado esto.

## 3. Resumen de la pestaña Consultas
- `consultas_por_usuario` devuelve además `clientes_periodo` (clientes distintos en el periodo) y `clientes_base` (en los 90 días anteriores). Las claves actuales se mantienen, así que el tipo de retorno no cambia.
- En pantalla: «Clientes distintos en el periodo: N» y «En los 90 días anteriores: M», en lugar de la frase de clientes al día.

## 4. Detalle de Auditoría
- `sin_confirmar` se muestra como «Sin confirmar».
- Se ocultan las líneas antes → después en las que ambos valores están vacíos.

## Prueba (sin tocar datos de clientes)
- Comparar definición antes/después y permisos de las tres funciones.
- Con la sesión de Bautista, comprobar que no puede llamar a las funciones de administración (sigue igual).
- Revisar la pantalla compilada. Las pruebas que generen eventos con cambios de clientes, y la consulta como administrador, las haces tú.

## Detalles técnicos
- Front: `ConsultasAuditoria.tsx` (resumen) y `AdminAuditoria.tsx` (traducción y filtro de líneas vacías).
- Si al aplicar algo no coincide con esto (por ejemplo, una firma distinta), me detengo y te lo explico.
