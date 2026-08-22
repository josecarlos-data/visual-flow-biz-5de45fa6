# Restaurar la posición de scroll al volver a un listado

Objetivo: si estabas a mitad de un listado y entras a una ficha, al volver la página aparece en el mismo punto.

## 1. Hook nuevo: `src/hooks/useScrollRestore.ts`

`useScrollRestore(key: string, ready: boolean)`

- Guarda `window.scrollY` en `sessionStorage` bajo `scroll:${key}` desde el listener `scroll` de `window`, con throttle vía `requestAnimationFrame`.
- Restaura en un `useLayoutEffect` que solo actúa cuando `ready` es `true`, una única vez por montaje (bandera con `useRef`). Si no hay valor guardado, no hace nada.
- Limpia el listener (y el frame pendiente) al desmontar.
- Sin dependencias nuevas, sin `localStorage`.

## 2. Aplicación en los seis listados (una línea por página)

| Página | key | ready |
| --- | --- | --- |
| Clientes.tsx | `clientes` | `!isLoading` |
| Ventas.tsx | `ventas` | `!loading` (estado local existente) |
| Visitas.tsx | `visitas` | `!isLoading` |
| Agenda.tsx | `agenda` | `!!plan` (la agenda no expone isLoading) |
| RevisionVisitas.tsx | `revision` | `!isLoading` |
| RutaDetalle.tsx | `ruta:${ruta}` | `!isLoading` |

RutaDetalle guarda por ruta para que cada ruta recuerde su propia posición.

## 3. Fuera de alcance

No se tocan los enlaces `?volver=`, los filtros, ni ningún hook de datos.
