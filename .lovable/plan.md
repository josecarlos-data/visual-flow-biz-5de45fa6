# Fase 2 — Ofertas

Siguiente fase del plan «Ofertas y Comunicaciones». El Paso 0 y la Fase 1 (rol Marketing) ya están aplicados. Esta fase crea las ofertas y las preferencias del cliente; todavía no se envía nada por WhatsApp (eso es la Fase 3).

**Qué promociona la oferta**
- `marcas text[]`: código de `productos.marca`; en pantalla se ve `marca_nombre`.
- `referencias text[]`.
- `familias text[]`, opcional.
- Los selectores tienen búsqueda y se sirven por RPC.

**Bloqueos por marca:** cuentan las marcas de la oferta más la marca de cada referencia ofertada.

**A quién va dirigida**
- Delegaciones.
- Tipos de cliente, con un selector que muestra código y nombre (por ejemplo, «A · TC A»).
- Requisitos de perfil.

**Estados y borrado**
- Estados guardados: borrador, publicada y archivada. «Vencida» se calcula al leer.
- Solo se eliminan borradores sin envíos. Al eliminarlos se borran también sus archivos.
- Archivar no borra archivos.

**Mensaje**
- Admite `{contacto}`.
- Termina con un pie fijo no editable: RIMOSA + «Responde BAJA si no quieres recibir más ofertas». Texto provisional, pendiente de la asesoría.

**Página pública `/o/<token>`**
- Token aleatorio, URL base en `app_settings.ofertas_url_base`.
- Oferta vencida: «Esta oferta ha vencido».
- Oferta archivada o en borrador: «Oferta no disponible».

**Adjuntos:** bucket público `ofertas-publicas`, con rutas aleatorias. Solo pueden subir archivos admin, director y marketing.

**Fuera de alcance:** la miniatura de WhatsApp.

**Preferencias del cliente:** tabla propia `cliente_preferencias_ofertas`, con `no_quiere_ofertas`, `marcas_excluidas` y `telefono_whatsapp`.
- Se ve y se edita en la pestaña Perfil, y los cambios se auditan.
- Marcar `no_quiere_ofertas`: cualquiera que vea al cliente, salvo marketing.
- Desmarcarlo: solo admin o director, con motivo obligatorio. La regla se aplica en la base de datos.

**Patrones de prohibición:** ajuste `ofertas_patrones_prohibicion` en Datos.
- La pantalla tiene una vista previa de valores y clientes afectados, servida por RPC.
- La comparación se hace sin mayúsculas ni tildes (`unaccent`/`upper`).

**Panel `ofertas`:** con filas de acceso para marketing y director. Se prueba con una cuenta que no sea admin.

## Reglas comunes

- Una migración por fase, en `drizzle/migrations/`. El Paso 0 va solo.
- `GRANT EXECUTE` explícito en cada función nueva o cambiada.
- `anon` solo tiene acceso a la función de la página pública.

## Al aprobar

Se construye solo la Fase 2, en una única migración. Las fases 3 a 5 siguen pendientes de aprobación por separado.
