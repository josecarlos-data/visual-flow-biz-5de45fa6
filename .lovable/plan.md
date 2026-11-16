# Panel de KPI por motivo de visita

## 1. Datos pedidos (consulta agregada, solo lectura)

Bloques por mes, origen, motivo y validación (entre paréntesis: cliente+día distintos).

**Octubre 2026 — app (7 bloques):** competencia 1 NO CORRECTO + 1 pendiente; gestion_cobro 1 CORRECTO; gsmart 1 NO CORRECTO; revision_seguimiento 1 NO CORRECTO; seguimiento 2 NO CORRECTO + 1 pendiente.

**Octubre 2026 — Gespromo (CORRECTO / pendiente / NO CORRECTO):**
- promocion 591 (546) / 39 / 1
- revision_seguimiento 401 (388) / 4 / 1
- competencia 214 (165) / 26 / 3
- informacion_potencial 64 (62) / 59 / 2
- gsmart 55 / 2 / 0
- viaje_incentivo 28 / 7 / 0
- seguimiento 26 / 221 / 1; incidencia 14 / 9 / 0
- inactivos: alta_reapertura 7/8, gestion_cobro 3/3, visita_partner 3/0; sin motivo 4 pendientes

**Noviembre 2026 — app:** solo 2 CORRECTO (revision_seguimiento 1, seguimiento 1); pendientes: revision_seguimiento 15 (11), competencia 8 (6), promocion 8 (5), informacion_potencial 6, incidencia 2, gsmart 1, seguimiento 4.

**Noviembre 2026 — Gespromo CORRECTO:** promocion 94 (91), revision_seguimiento 74 (71), competencia 35 (26), informacion_potencial 11 (+15 pendientes), gsmart 7, viaje_incentivo 4.

**Quién validó los CORRECTO de octubre:** todos, app y Gespromo, figuran como José Carlos (el único CORRECTO de app es gestion_cobro, motivo inactivo). Los CORRECTO de noviembre no tienen validador (veredicto importado con revisado_por vacío).

**Claves reales:** competencia, promocion, revision_seguimiento, gsmart, viaje_incentivo, informacion_potencial. Sin línea: seguimiento, incidencia.

### Decisiones que te corresponden
A. **¿Cuenta Gespromo?**
- A1. Sí, app + Gespromo (hoy es casi todo el volumen; sin él los KPI de octubre/noviembre salen a cero).
- A2. Solo app (KPI reflejaría la adopción de la app; cero en octubre).
- A3. Ajuste editable «origenes que cuentan» (por defecto ambos), para cambiarlo sin migración.

B. **Validaciones de octubre a nombre de José Carlos:**
- B1. Contar como válidas (parecen el veredicto importado de Gespromo, no pruebas).
- B2. Empezar a contar en noviembre 2026 (cambiar el «contar desde» inicial).
- B3. Excluir solo los bloques de app de octubre (los 7 son pruebas: ninguno de una línea KPI es CORRECTO, así que en la práctica B3 = B1).

Nota: los bloques app de octubre no afectan a ninguna línea (no hay CORRECTO en motivos con línea). La decisión real es A.

## 2. Mi diagnóstico y comparación con la propuesta de Claude

| Punto | Claude | Mío | Final |
|---|---|---|---|
| Tablas | kpi_lineas + kpi_linea_motivos | Igual; regla_conteo con CHECK en 3 valores; umbral por defecto = 2×objetivo en el trigger si viene vacío | Igual + defaults |
| Fecha de referencia | visitas.fecha | Igual; validación case-insensitive como en 0046 (`upper(validacion)='CORRECTO'`) | Igual |
| Conteo «cliente y día» | por motivo | clave = (comercial, motivo, cod_cliente o cliente_externo normalizado, día/mes/bloque); motivo por separado y suma | Igual |
| Comercial | user_id | Gespromo usa `vendedor`/`comercial_nombre`; el comercial se identifica por user_id si existe, si no por nombre de vendedor enlazado al perfil | Clave «comercial» = user_id o vendedor |
| RPC | una agregada | `kpi_resumen(desde, hasta)` SECURITY INVOKER: la RLS de visitas ya limita (comercial: lo suyo; jefe: su delegación; director/admin: todo). Así el jefe de zona ve su zona sin lógica nueva | INVOKER, jefe = su zona vía RLS existente |
| Pendientes | contados | sí, por línea; NO CORRECTO ni suman ni salen como pendientes | Igual |
| Detalle | lista de visitas | `kpi_detalle(linea, comercial, mes)` INVOKER, paginada (máx. 200), con estado y enlace | Igual |
| «Contar desde» | ajuste | `app_settings.kpi_contar_desde = '2026-10'`, editable director/admin desde Ajustes (lo audita el trigger existente) | Igual |
| Edición | pestaña en /admin/objetivos | Igual, sin tocar lo actual; auditoría con auditar_cambio como plantillas | Igual |
| Acceso | fila en dashboards | dashboards key `kpi_visitas`, ruta `/kpi`; asignable en user_dashboard_access; admin siempre | Igual |
| Datos iniciales | 4 líneas | Insertadas en la misma migración (backfill de tabla nueva) | Igual |

Riesgo: la RLS de visitas sobre ~26.000 Gespromo puede hacer lenta la vista anual del jefe. Índice nuevo `visita_bloques(motivo_key, visita_id)` solo si la medida supera 2 s; si no, no se crea.

## 3. Plan final (Build)

**Migración única (0049):**
- `kpi_lineas`, `kpi_linea_motivos` con GRANT (select a authenticated aprobados; escritura director/admin vía RLS), RLS permisiva, auditoría.
- Ajuste `kpi_contar_desde` (y `kpi_origenes` si eliges A3).
- RPCs `kpi_resumen` y `kpi_detalle`, SECURITY INVOKER, `search_path` fijo, REVOKE PUBLIC/anon, GRANT EXECUTE authenticated.
- Fila en dashboards y las 4 líneas iniciales.

**Pantallas:**
- `/kpi` (móvil primero): comercial con mes actual/anterior, tarjeta por línea con barra, conseguidos, pendientes y bonus.
- Director/admin/jefe: tabla anual mes × comercial con totales anuales y bonus.
- Detalle por línea con enlaces a las visitas.
- Pestaña «Líneas KPI» en /admin/objetivos.
- Ítem en el menú.

**Pruebas:** totales por rol (admin, director, comercial y jefe) con identidades simuladas en transacción revertida; test unitario de la regla de umbral por defecto. Sin cuentas reales y sin tocar registro ni revisión.

**Créditos estimados del Build:** 15–25.
