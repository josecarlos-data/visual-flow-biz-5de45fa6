# Plan: filtros por URL en Documentos y navegación contextual desde Ventas

## Alcance
Solo dos ficheros de frontend. No se tocan RPCs, funciones SQL, paginación, ordenación ni dependencias.

## A) `src/pages/Documentos.tsx` — hidratar filtros desde query string

1. Importar `useSearchParams` de `react-router-dom`.
2. Leer al montar (una sola vez, con `useRef` de guarda) los parámetros opcionales:
   - `anio`, `canal`, `motivoAbono`, `operacion`, `vendedor`, `delegacion`, `importeMin`, `volver`, `volverTxt`.
3. Reglas de hidratación:
   - Si `anio` existe y es válido, usarlo como año inicial en lugar del último año con datos.
   - `importeMin`: si el parámetro está presente, usar su valor (incluido `0`); si no, mantener `UMBRAL_DEFAULT` (300).
   - El resto de valores mapean directamente a los campos de `Filtros`. Valores no reconocidos se ignoran.
   - Después del montaje, los cambios manuales de filtros no reescriben la URL ni se re-hidratan.
4. Botón de volver:
   - Replicar el patrón de `ClienteDetalle.tsx`:
     - Validar que `volver` empiece por `/` y no por `//`, con fallback a `/clientes`.
     - Mostrar `volverTxt` decodificado.
     - Usar icono `ArrowLeft` arriba del todo, con clase `inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground`.
   - Si no viene `volver`, no se renderiza el enlace.
5. Los chips de filtros activos y el panel lateral ya existentes seguirán funcionando sin cambios adicionales.

## B) `src/pages/Ventas.tsx` — enlaces hacia Documentos

1. **"Mix por canal"**: convertir cada fila de `<div>` a `<Link>` hacia:
   ```text
   /documentos?anio={anioActual}&canal={encodeURIComponent(c.canal)}&importeMin=0&volver=%2F&volverTxt=Ventas
   ```
   Añadir `transition-colors hover:bg-accent`.
2. **"Devoluciones" — pestaña Motivos**: convertir cada fila a `<Link>` hacia:
   ```text
   /documentos?anio={anioActual}&operacion=Abono&motivoAbono={encodeURIComponent(d.etiqueta)}&importeMin=0&volver=%2F&volverTxt=Ventas
   ```
3. **"Devoluciones" — pestaña Vendedores**: convertir cada fila a `<Link>` hacia:
   ```text
   /documentos?anio={anioActual}&operacion=Abono&vendedor={encodeURIComponent(d.etiqueta)}&importeMin=0&volver=%2F&volverTxt=Ventas
   ```
4. **"Devoluciones" — pestaña Referencias**: dejar las filas como `<div>` sin enlace, porque `documentos_listado` no expone filtro por referencia.
5. **Componente `Kpi`**: en la línea del hint, sustituir `truncate` por `leading-tight` para evitar que la proyección de cierre se corte en móvil.

## C) Validación

- `tsgo` sin errores.
- Build OK según `build-errors.log`.
