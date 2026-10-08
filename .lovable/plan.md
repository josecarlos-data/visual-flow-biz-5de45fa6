# Ajuste de la pestaña de Auditoría

Solo se modifica `src/pages/AdminAuditoria.tsx`. Sin migraciones, sin cambios en base de datos ni en funciones del backend.

## Qué se corrige

### 1. El bloque `seguridad` deja de verse como texto sin formato

Hoy los eventos «Usuario: cambio» guardan los valores anteriores y nuevos dentro de una clave `seguridad`, y la pantalla pinta ese objeto entero como JSON. Se recorre ese objeto y cada valor se pinta como una línea propia, con las mismas etiquetas traducidas que el resto:

```text
Campos modificados: Sesiones simultáneas, Máximo de equipos
Sesiones simultáneas: 1 → 2
Máximo de equipos: 8 → 3
```

- La clave `seguridad` no se muestra como tal.
- Se ignoran los grupos vacíos (un `seguridad: {}` no pinta nada).
- Los valores siguen con las reglas ya aplicadas: booleanos como Sí / No, vacíos como «—».
- Se ocultan también dentro de estos grupos las claves técnicas de red (dirección de origen, etc.).

### 2. Etiquetas de «Operación» y «Origen»

- `operacion` se traduce: INSERT → Alta, UPDATE → Modificación, DELETE → Baja. La etiqueta es «Operación».
- `origen` se muestra con mayúscula inicial: Usuario / Sistema. La etiqueta sigue siendo «Origen».

### 3. Columna Entidad

Hoy solo se resuelve el nombre cuando la entidad es `usuario`; para el resto se ve `profiles: 6b97411d-…`.

Se resuelve el nombre también cuando la entidad es `profiles`, `user_roles` o `user_dashboard_access`, usando la lista de perfiles ya cargada para el filtro de usuarios (sin consultas por fila) y mostrando **solo el nombre**, sin el prefijo de la tabla:

```text
antes: profiles: 6b97411d-a43b-45d2-…
ahora: Bautista …
```

Si el identificador no está entre los perfiles cargados, se mantiene el comportamiento actual (`tabla: identificador`) para que se vea que no se ha podido resolver.

En móvil, el detalle desplegable de cada tarjeta se beneficia automáticamente del punto 1, ya que usa el mismo componente.

## Criterio de comprobación

- Filtrar por «Usuario: cambio» y desplegar una fila con cambios de sesiones o máximo de equipos: se ven las líneas «Sesiones simultáneas: 1 → 2» y «Máximo de equipos: 8 → 3», nunca JSON.
- La misma fila muestra «Operación: Modificación» y «Origen: Usuario».
- Una fila con `exige_2fa` muestra «Exigir segundo factor: No → Sí».
- La columna Entidad de esas filas muestra el nombre de la persona, no un UUID.
- Los eventos de ajustes (`antes` / `despues` sueltos, como `sesion_duracion_horas`) siguen viéndose como hasta ahora.

## Detalles técnicos

- `lineasDetalle` (en `src/pages/AdminAuditoria.tsx`) pasa a recorrer, además de los pares sueltos, cualquier objeto anidado cuyas entradas sean pares antes/después o valores simples, saltando grupos vacíos y aplicando `CAMPOS_OCULTOS` también dentro del grupo.
- Orden de las líneas: «Campos modificados», después los pares del grupo de seguridad, después el resto de valores simples (Operación, Origen, etc.) y por último los pares sueltos de siempre.
- `NOMBRES_CAMPO` incorpora `operacion` → «Operación» y `seguridad` deja de usarse como etiqueta visible.
- Traducción de valores dependiente de la clave: un pequeño helper `valorDeClave(clave, valor)` devuelve «Alta/Modificación/Baja» para `operacion` y capitaliza `origen`; el resto pasa por `valorLegible` sin cambios.
- `nombreEntidad` pasa a usar un conjunto `{usuario, profiles, user_roles, user_dashboard_access}` para buscar en `usuarios` por `entidad_id`; si encuentra coincidencia devuelve solo `full_name || email`, si no, el prefijo actual.
