# Build 2 KPI: detalle por línea con trazabilidad

## Orden
1. Migración 0052 y prueba en transacción revertida. Si no cuadra, me detengo y lo explico antes de tocar pantallas.
2. Pantallas.

## Migración 0052 (`drizzle/migrations/`, SQL plano)
- `kpi_trazabilidad(linea, año, mes, vendedor, incluir_excluidos, página, tamaño)`: SECURITY DEFINER, `search_path` fijo, `statement_timeout` en la definición, rango de fechas del mes, ámbito vía `kpi_ambito` (comercial solo lo suyo, jefe su delegación, director/admin todo, sin acceso vacío). REVOKE PUBLIC/anon; GRANT authenticated.
- Lo que cuenta sale de `kpi_base` (sin modificarla) y se agrupa con la misma regla de conteo que `kpi_resumen`, para que la suma cuadre por construcción.
- Devuelve el resumen (bloques encontrados → unidades → conseguidos/pendientes, total para paginar) y una fila por unidad: fecha, semana ISO, cliente (código y nombre), motivo, nº de bloques, origen, estado, tipo de validación, revisor y fecha, ids de visitas.
- Tipo de validación por origen: «Revisada en el CRM» (con revisor y fecha), «Importada de Gespromo», «Pendiente». Los bloques app en Correcto sin revisor no entran en ninguno: los cuento y te los digo.
- Excluidos (si se piden): una fila por bloque con motivo «No correcto», «Anterior a contar desde» u «Origen no incluido»; reviso si aparecen otros casos (p. ej. motivo sin línea activa) y te los listo.
- COMMENT de retirada del dashboard `kpi_visitas` dentro de la migración; `kpi_detalle` marcada como retirada, sin borrarla.
- No toco `kpi_resumen`, `kpi_base` ni el motor de objetivos v2.

## Punto a vigilar (me detengo si ocurre)
`kpi_base` ya descarta los bloques No correcto y los anteriores a «contar desde». Para los excluidos tendré que repetir dentro de la nueva función la misma asignación de nombre de comercial (Gespromo → perfil). Si eso no puede hacerse sin cambiar `kpi_base`, me paro y te lo explico.

## Pruebas (identidades simuladas, transacción revertida)
- Octubre 2026: 2 comerciales × 4 líneas = 8 celdas; suma del detalle = celda de `kpi_resumen`.
- Ámbito: un comercial no ve filas de otro; con interruptor en «admin», director y comercial no obtienen nada.
- Totales de octubre por tipo de validación.
- Aviso de lo que la prueba simulada no reproduce de una llamada real desde la app.

## Pantallas
- `KpiDetalleDialog`: desde la celda de `KpiTablaAnual` (si no hay línea filtrada, pide elegir línea) y desde «Ver detalle» en cada tarjeta de `KpiTarjetasMes`. Arriba el resumen; debajo la tabla paginada con interruptor «Ver también lo que no cuenta»; en móvil, filas como tarjetas.
- «Descargar CSV» de la celda completa (todas las páginas, con excluidos si están activos), recorriendo páginas desde el navegador; incluye semana ISO. Sin dependencias nuevas.
- `VisitaSoloLectura`: diálogo de solo lectura con visita y bloques usando consultas y RLS existentes; reutilizo lo de ClienteDetalle si es separable.
- Objetivos: el jefe de zona ve la tabla anual de su delegación, no las tarjetas.

## Al terminar
Ficheros cambiados, migración aplicada (solo 0052), resultados de pruebas, nº de bloques app Correcto sin revisor y lo no probado en pantalla.
