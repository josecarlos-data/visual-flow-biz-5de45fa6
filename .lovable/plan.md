Plan: Navegación contextual "volver" en ficha de cliente

## Alcance
Cambio exclusivo de frontend. La flecha atrás de `src/pages/ClienteDetalle.tsx` debe devolver al listado desde el que el usuario llegó, en lugar de siempre enviarlo a `/clientes`. El origen se transporta en la URL mediante los parámetros de búsqueda `volver` (ruta destino) y `volverTxt` (etiqueta a mostrar). No se modifican filtros de listados, ni otra navegación, ni backend.

## Ficheros a modificar

### 1. `src/pages/ClienteDetalle.tsx`
- Importar `useSearchParams` de `react-router-dom`.
- Leer los parámetros `volver` y `volverTxt` de la URL.
- Validar `volver`: si no existe, no empieza por `/` o empieza por `//`, usar `"/clientes"` como fallback.
- Si `volverTxt` no existe o está vacío, usar `"Clientes"` como fallback.
- Sustituir el `<Link to="/clientes">` de la línea ~178 por un `<Link>` que apunte al destino resuelto y muestre la etiqueta resuelta.
- Ambos valores se reciben ya codificados; el componente solo los decodifica con `decodeURIComponent` cuando los presenta.

### 2. `src/pages/Ventas.tsx`
- Línea ~445: el `<Link>` a `/clientes/${c.cod_cliente}` pasa a:
  ```text
  /clientes/${c.cod_cliente}?volver=${encodeURIComponent('/ventas')}&volverTxt=${encodeURIComponent('Ventas')}
  ```
- Línea ~518: el `<Link>` de `FilaAlerta` a `/clientes/${a.cod_cliente}` recibe el mismo tratamiento.

### 3. `src/pages/Visitas.tsx`
- Línea ~135: el `<Link>` a `/clientes/${v.cod_cliente}` pasa a:
  ```text
  /clientes/${v.cod_cliente}?volver=${encodeURIComponent('/visitas')}&volverTxt=${encodeURIComponent('Visitas')}
  ```

### 4. `src/pages/Agenda.tsx`
- Línea ~194: el `<Link>` a `/clientes/${p.cod_cliente}` pasa a:
  ```text
  /clientes/${p.cod_cliente}?volver=${encodeURIComponent('/agenda')}&volverTxt=${encodeURIComponent('Agenda')}
  ```

### 5. `src/pages/RutaDetalle.tsx`
- El componente ya dispone del parámetro de ruta `codigo` y de la variable `ruta = decodeURIComponent(codigo ?? "")`, que es el nombre/código de la ruta que se muestra en el título (`Ruta {ruta}`).
- Línea ~254: el `<Link>` a `/clientes/${c.cod_cliente}` pasa a:
  ```text
  /clientes/${c.cod_cliente}?volver=${encodeURIComponent(`/rutas/${codigo}`)}&volverTxt=${encodeURIComponent(`Ruta ${ruta}`)}
  ```
  Se usa `codigo` (valor crudo de `useParams`) para reconstruir la ruta exacta, y `ruta` (ya decodificado) para la etiqueta legible.
- Línea ~306: el `<Link>` a `/clientes/${c.cod_cliente}` dentro del `<DropdownMenuItem>` recibe el mismo tratamiento.

### 6. `src/pages/RevisionVisitas.tsx`
- Línea ~282: el `<Link>` a `/clientes/${v.cod_cliente}` pasa a:
  ```text
  /clientes/${v.cod_cliente}?volver=${encodeURIComponent('/visitas/revision')}&volverTxt=${encodeURIComponent('Revisión de visitas')}
  ```
  La ruta real definida en `src/App.tsx` es `/visitas/revision`.

### 7. `src/pages/Clientes.tsx`
- Línea ~131: el `<Link>` a `/clientes/${c.cod_cliente}` pasa a:
  ```text
  /clientes/${c.cod_cliente}?volver=${encodeURIComponent('/clientes')}&volverTxt=${encodeURIComponent('Clientes')}
  ```

## Ficheros que NO se tocan
- `src/pages/NuevaVisita.tsx` (línea ~388): el enlace a la ficha de cliente aparece tras guardar una visita; volver al formulario sería incorrecto.

## Seguridad de la redirección
- `ClienteDetalle` solo acepta rutas que empiecen por `/` y no por `//`. Cualquier otro valor se ignora y se usa `/clientes`.
- Esto evita redirecciones abiertas a dominios externos introducidos mediante parámetros manipulados.

## Backend
- No se crean ni modifican migraciones, funciones SQL, tablas ni políticas RLS.

## Resumen de variables clave
- Ruta real de RevisionVisitas: `/visitas/revision` (según `src/App.tsx`).
- Nombre de la ruta en `RutaDetalle`: la variable `ruta` (decodificación de `codigo` desde `useParams`), que ya se usa en el título `Ruta {ruta}`.
