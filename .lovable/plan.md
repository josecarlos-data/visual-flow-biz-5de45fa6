# Build 1 (cierre): 0050 de rendimiento y pantalla /kpi

## 1. Migración 0050 (única de rendimiento)
- Cambiar solo la función base de cálculo de KPI usada por kpi_resumen y kpi_detalle:
  - resolver nombre de vendedor y delegación una sola vez por código de Gespromo (tabla temporal/CTE agrupada), no por bloque;
  - quitar la delegación por fila y filtrar por zona al final.
- kpi_resumen y kpi_detalle siguen SECURITY DEFINER con search_path fijo, misma firma y misma respuesta.
- Medir el resumen anual: si queda por debajo de 5 s, se acepta; si no, detenerse y explicarlo sin proponer 0051.

## 2. Pruebas acordadas (transacción revertida, identidades simuladas)
- Un total anual por rol: admin, director, jefe de zona, comercial.
- Bautista (código 23) obtiene total mayor que cero en octubre.
- Nada más.

## 3. Pantalla /kpi
- Página con selector de año y mes, tarjetas por línea KPI (objetivo, conseguido, bonus) y detalle.
- El resumen se pide una vez por año (clave de caché por año, staleTime de varios minutos); cambiar de mes filtra en cliente sin nueva consulta.
- Ruta en App.tsx con los roles de la sección; el menú ya existe.

## Entrega
- Ficheros cambiados, confirmación de que las únicas migraciones nuevas son 0049 y 0050, totales por rol, tiempo medido y lo no probado en pantalla.
