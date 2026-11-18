# KPI de visitas dentro de Objetivos, con trazabilidad

## Diagnóstico propio (comprobado)
- Confirmo lo que describes: /kpi en App.tsx, dashboard `kpi_visitas`, `kpi_ambito` exige ese dashboard, `kpi_detalle` sin uso y con LIMIT 200, `AdminObjetivos.tsx` sin pestañas, y ninguna ruta abre una visita (en revisión se abre en un diálogo de edición).
- Datos de octubre 2026 (lectura, motivos de las líneas KPI):
  - Gespromo: 1.270 visitas, 1.550 bloques, 1.403 «Correcto». Solo 264 tienen revisor individual (`revisado_por`), así que unos 1.139 heredan la validación de la visita. 237 visitas aportan más de un bloque.
  - App: 3 visitas, 4 bloques.
  - Esto respalda tu sospecha: casi todo el «Correcto» de octubre es heredado. El detalle debe distinguir entre «validado individualmente» y «heredado».

## Comparación con tu propuesta
1. Interruptor `kpi_visible_para` (admin | gestores | todos) en servidor: de acuerdo. Matiz: no hace falta cambiar lo que devuelve `kpi_ambito`, basta añadir la condición dentro, así que no hay que borrarla y recrearla ni restaurar permisos. Con valor `admin`, el director y los comerciales no ven nada, tampoco su propio detalle.
2. Retirar /kpi: de acuerdo en redirigir a /objetivos y desactivar la fila del dashboard (`is_active=false`). Discrepo en borrar filas: hoy nadie salvo admin tiene ese acceso (comprobado), y borrar deja rastro de auditoría sin aportar nada. Desactivar y marcar como retirado.
3. Objetivo y umbral desde `kpi_resumen`: de acuerdo, pero con un problema: si un mes no tiene bloques, `kpi_resumen` no devuelve fila y la tarjeta se quedaría sin objetivo. Uso la fila cuando exista y, si no, la línea. Ubicación: propongo «KPI del mes» encima de los objetivos de venta, porque cambia cada día y los de venta son trimestrales o anuales. Orden idéntico en todos los tamaños: una sola columna con `orden` de la línea.
4. Tabla anual para admin y director: de acuerdo. La celda solo abre detalle si hay una línea filtrada. Con «Todas las líneas», la celda suma varias líneas y el detalle no sería de una sola. Al pulsar sin filtro, se pide elegir línea.
5. Trazabilidad: de acuerdo, con dos añadidos:
   - Columna «tipo de validación»: individual (con revisor) / heredada (sin revisor) / pendiente. Es la que explica la inflación.
   - «Ver también lo que no cuenta»: lo recomiendo en Build 2 y no como opcional, porque sin ello no se puede contrastar con el Excel de Fran (lo anterior a `kpi_contar_desde` y lo No correcto no aparece en ningún sitio).
   - Nueva función con nombre propio (`kpi_trazabilidad`) en vez de rehacer `kpi_detalle`: evita borrar y recrear, y `kpi_detalle` se marca como retirada.
   - Diálogo de visita de solo lectura: no existe uno reutilizable; el de Revisión es de edición. Propongo extraer un componente de solo lectura en Build 2 (a confirmar al leer `ClienteDetalle.tsx`).
6. Pestaña «Líneas KPI» en /admin/objetivos: de acuerdo. Los motivos se cambian borrando e insertando (no hay UPDATE), y el desplegable de motivos sale de `motivos_visita` activos (pocas filas, sin riesgo de corte a 1.000). Los ajustes `kpi_*` los edita solo admin: lo compruebo en las políticas de `app_settings` antes de construir y, si no lo cumplen, lo resuelvo en la migración de Build 1.
7. Metas por comercial: no se construye. Entraría como tabla `kpi_linea_excepciones (linea_id, vendedor, objetivo_mes, umbral, activo)` que `kpi_resumen` uniría con `coalesce`. La pantalla ya leerá objetivo y umbral por fila (punto 3), así que no cambiaría.
8. Reparto: de acuerdo.

Críticas a tu propuesta: borrar accesos (punto 2) es innecesario; el detalle sobre «Todas las líneas» no tiene sentido (punto 4); y falta la columna de validación heredada, que es lo que demuestra la inflación.

Políticas de `kpi_lineas` que empiezan por `is_admin`: `is_admin` ya exige aprobación y segundo factor en el servidor (regla del proyecto), así que no hace falta añadir `is_approved`. La rama del director sí lo lleva.

## Build 1 (puntos 1–4 y 6) — 1 migración, unos 5–7 créditos
Migración 0051:
- Ajuste `kpi_visible_para='admin'`.
- `kpi_ambito`: exige acceso a 'objetivos' en vez de 'kpi_visitas' y aplica el interruptor (gestores = admin + director; todos = además jefes y comerciales).
- Dashboard `kpi_visitas` desactivado y comentado como retirado.
- Si hace falta, política que limita la edición de los ajustes `kpi_*` a admin.

Ficheros:
- `src/App.tsx`: /kpi redirige a /objetivos.
- `src/components/kpi/KpiTarjetasMes.tsx` y `src/components/kpi/KpiTablaAnual.tsx`: sacados de `KpiVisitas.tsx`, que se borra.
- `src/hooks/useKpiVisitas.ts`: CRUD de líneas y motivos.
- `src/pages/Objetivos.tsx`: bloque KPI arriba; tabla anual para admin y director.
- `src/pages/AdminObjetivos.tsx`: pestañas «Objetivos» y «Líneas KPI».
- `src/components/kpi/LineasKpiAdmin.tsx` (nuevo).
- `src/components/AppSettingsCard.tsx`: los tres ajustes, solo admin.

Pruebas: totales por rol (admin, director, comercial) para cada valor del interruptor, con identidades simuladas en transacción revertida y acceso a 'objetivos' real (no admin). No reproduce la llamada desde la app (token real y 2FA).

## Build 2 (punto 5) — 1 migración, unos 6–9 créditos
Migración 0052:
- `kpi_trazabilidad(linea, año, mes, vendedor, incluir_excluidos, página, tamaño)`, `SECURITY DEFINER`, `search_path` fijo, `statement_timeout` en la definición y filtro de fechas por rango.
- Devuelve:
  - resumen: bloques encontrados → unidades → conseguidos/pendientes, y total para paginar;
  - una fila por unidad: fecha, semana ISO, cliente (código y nombre), motivo, nº de bloques, origen, estado, tipo de validación, revisor y fecha, ids de visitas;
  - si se piden excluidos, el motivo de cada exclusión.
- Mismo ámbito que el resumen (comercial: solo lo suyo).
- `kpi_detalle` marcada como retirada.

Ficheros:
- `src/components/kpi/KpiDetalleDialog.tsx`.
- `src/components/VisitaSoloLectura.tsx` (extraído).
- `src/hooks/useKpiVisitas.ts`.
- `KpiTablaAnual`/`KpiTarjetasMes`: enlace al detalle.

Pruebas: totales por rol; que la suma de unidades del detalle cuadre con la celda del resumen en octubre.

## Fuera de alcance
- Motor de objetivos v2 y objetivos de 2026.
- Metas por comercial.

Si al construir hace falta otro enfoque (p. ej. cambiar lo que devuelve `kpi_ambito`), me detengo y lo explico.
