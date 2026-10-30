# Cierre de Ofertas y Comunicaciones: construida pero oculta

## Aviso previo: un punto no se puede hacer como está escrito
La herramienta de migraciones **rechaza cualquier escritura en `storage.buckets`** (INSERT/UPDATE), así que el `INSERT ... ON CONFLICT` del bucket no puede ir en la migración. Propuesta:
- Configurar el bucket `ofertas-publicas` (ya existe, privado) con la herramienta de almacenamiento: límite 10 MB y tipos `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. El límite se aplica en el servidor igual.
- Para reconstruir en servidor propio: dejar el SQL del bucket en un fichero aparte `docs/reconstruccion/ofertas_bucket.sql` (no ejecutado aquí) y anotarlo en roadmap.md.
Todo lo demás va en una sola migración.

## 1. Interruptor único `ofertas_activo`
- Ajuste en `app_settings`, valor `'false'` (`ON CONFLICT DO NOTHING`). Lo auditan los triggers de ajustes ya existentes.
- Helper `public.ofertas_activo()` (STABLE, SECURITY DEFINER, search_path fijo).
- Trigger sobre `app_settings`: al cambiar `ofertas_activo`, pone `dashboards.is_active` de `ofertas` y `comunicaciones` al mismo valor. La migración los deja en `false`. No se tocan las filas de `user_dashboard_access`.
- Las seis RPC (`registrar_envio_oferta`, `confirmar_envio_oferta`, `ofertas_para_cliente`, `ofertas_destinatarios`, `ofertas_recomendados`, `descartar_recomendacion`) lanzan «Ofertas desactivado» al empezar si el ajuste está apagado. `CREATE OR REPLACE`, mismas firmas, mismos permisos.
- `oferta_publica` devuelve vacío cuando está apagado, y la política de lectura anónima de adjuntos exige además `ofertas_activo()` → la página `/o/<token>` muestra «Oferta no disponible».
- Pantallas (con un hook `useOfertasActivo` que lee el ajuste):
  - Ficha de cliente: se ocultan el botón «Enviar oferta», el recuadro «Ofertas enviadas» y el apartado de ofertas del Perfil.
  - Datos: se oculta la tarjeta de patrones de prohibición.
  - App: `ConfirmarEnvioOferta` no se monta.
  - Seguridad: interruptor «Ofertas y Comunicaciones activas», solo admin.
- El admin puede seguir entrando a `/ofertas` y `/comunicaciones` por URL (la guarda deja pasar al admin aunque el panel esté inactivo); el envío sigue bloqueado.
- El cron diario se deja como está.

## 2. Ajustes de cierre
- Comunicaciones: columna Origen (Manual / Recomendación), filtro por origen, y en el resumen por oferta envíos, confirmados y compradores separados por origen (incluido en el Excel).
- Nueva `ofertas_recomendados_resumen(_oferta_id)`: recomendados por comercial y grupo; admin y director todo, jefe de zona solo su delegación. REVOKE de PUBLIC/anon, GRANT a authenticated. Tabla en la pestaña Recomendados para esos roles.
- Texto: «Al menos N clientes excluidos por bloqueos».

## 3. Comprobaciones (solo lectura)
- Antes: listar usuarios cuyo único panel sea ofertas o comunicaciones.
- Bautista con ajuste apagado: sin Ofertas/Comunicaciones en el menú; ficha de un cliente suyo sin botón, recuadro ni apartado, sin errores en consola; `ofertas_para_cliente` → «Ofertas desactivado».
- Admin por URL con 0 ofertas: `/ofertas`, `/comunicaciones` y Recomendados cargan vacías sin errores.
- Sin sesión: `/o/token-inventado` → «Oferta no disponible».
- Nadie cae en «Sin secciones asignadas».
- Typecheck y tests.

## 4. roadmap.md
Sección «Ofertas y Comunicaciones — construida, oculta (ofertas_activo = false), pendiente de revisión» con los seis pendientes indicados, más: aplicar el SQL del bucket al reconstruir en el servidor propio.

## Ficheros previstos
- Migración nueva en `drizzle/migrations/`
- `src/hooks/useOfertasActivo.ts` (nuevo), `src/App.tsx`, `src/components/ProtectedRoute.tsx` (si hace falta para el acceso del admin por URL)
- `src/pages/ClienteDetalle.tsx`, `src/components/ClientePerfilTab.tsx`, `src/pages/AdminData.tsx`, página de Seguridad
- `src/pages/Comunicaciones.tsx`, `src/components/ofertas/Recomendados.tsx`
- `docs/reconstruccion/ofertas_bucket.sql`, `roadmap.md`
