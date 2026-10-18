# Ofertas y Comunicaciones (revisión 3)

Marketing crea las ofertas. El comercial las envía por su WhatsApp desde la ficha del cliente y el envío queda en el historial del cliente. No cambian ni las visitas, ni la revisión de visitas, ni los incentivos.

## Decisiones cerradas

- **Bloqueo por `prohibicion_venta`:** se usa una lista de patrones editable en Datos.
  - Un cliente queda bloqueado si su valor contiene alguno de los patrones. No distingue mayúsculas ni tildes.
  - Patrones iniciales: PROHIBICION, PERDIDAS, GIRO DEVUELTO, CERRAD, LIQUIDACION, CONCURSO, FALLECID, PASA AL, CAMBIA DE CODIGO.
  - La pantalla muestra qué valores y cuántos clientes quedan bloqueados con los patrones actuales.
  - El resto de valores solo genera un aviso, sin bloquear.
- **Teléfonos:** opción (a). El comercial escribe el móvil y se guarda en la ficha. No se revisa la importación: el Excel no trae teléfonos.

## Datos consultados para esta revisión

**Orden de los paneles.** Ventas y Clientes tienen los dos el orden 10, así que hay empate. Los demás:

| Panel | Orden |
|---|---|
| Objetivos | 15 |
| Agenda | 20 |
| Visitas | 30 |
| Documentos | 40 |
| Rutas | 45 |
| Actividad interna | 90 |

Hoy todos los usuarios que no son admin tienen asignados los mismos 7 paneles, Ventas incluido.

**Tipo de cliente.** La columna `tipo_cliente` está vacía. El código está en `cod_tipo_cliente` y el nombre en `extra->>'Tipo de cliente'`:

| Código | Nombre | Clientes |
|---|---|---|
| C | TC C | 10.692 |
| A | TC A | 452 |
| B | TC B | 429 |
| D | SIN CATEGORIA | 8 |
| AA | TC AA | 3 |
| (sin código) | — | 8 |

**Baja en ISI.**

| `extra->>'Estado'` | Clientes | Con motivo de baja |
|---|---|---|
| Activo | 11.584 | — |
| Baja | 8 | 8 |

- Ningún cliente tiene «Fecha de baja», aunque la importación sí la lee.
- Regla propuesta para la Fase 3: bloquear si `extra->>'Estado'` no es «Activo» (sin distinguir mayúsculas) o si «Fecha de baja» tiene fecha. El motivo visible será «Cliente de baja en ISI», con el motivo de baja si lo hay.
- Un cliente sin «Estado» no se bloquea.

**`vendedores_objetivos()`.** Solo la usa la pantalla de administración de Objetivos, que es para admin y director comercial.

## Paso 0 — Valor nuevo del rol (todavía no aplicado)

Una migración sola, en `drizzle/migrations/`, que solo contiene:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';
```

Se aplica antes y por separado de la migración de la Fase 1.

## Fase 1 — Rol Marketing (lo que se construye al aprobar)

**Pantallas**
- **Usuarios:** «Marketing» aparece en el selector de rol, con su etiqueta legible en listas y filtros.
- **Auditoría:** etiqueta «Marketing» en los detalles de cambio de rol.
- **Sin paneles asignados:** en lugar de redirigir a «/» y dejar la pantalla en blanco, se muestra «Sin secciones asignadas. Contacta con el administrador.», con botón de cerrar sesión. No se registra ningún `acceso_denegado`.
- **Destino tras el login:** quien tiene Ventas entra en Ventas, como hoy. El resto va a su primer panel permitido, ordenado por orden y después por nombre. Así no se registra un `acceso_denegado` falso en cada inicio de sesión.
  - Las demás redirecciones de inicio (`/auth`, `/pending`, fallback de `ProtectedRoute`) usan ese mismo destino.

**Base de datos (una migración, después del Paso 0)**
- **Desempate de paneles:** Clientes pasa a orden 11, para que Ventas quede delante de forma fija.
- **`vendedores_objetivos()`:** `CREATE OR REPLACE`, misma firma. Mantiene `is_approved` y añade una lista blanca: `has_role(admin)` o `has_role(director_comercial)`. Cualquier otro rol, incluido uno nuevo, recibe cero filas.
- **`situaciones_activas()`:** `CREATE OR REPLACE`, misma firma. Mantiene `is_approved` y añade `public.can_view_cliente(auth.uid(), s.cod_cliente)`. Marketing no ve situaciones; cada rol ve solo las de sus clientes.
  - Antes y después de aplicarla, se mide `panel_alertas` con la cuenta de Bautista, solo leyendo.
  - Si va más de un 20 % más lenta, me detengo y te lo explico.
- **Lo que no se toca:** `get_distinct_vendedores`, `get_distinct_delegaciones` y `buscar_productos`. Marketing necesita las delegaciones y el catálogo, y no son datos de cliente.
- **Comprobaciones antes de aplicar:**
  - Se vuelve a sacar la lista de funciones SECURITY DEFINER que solo comprueban `is_approved`, por si ha cambiado.
  - Se comprueba que ninguna política de clientes, ventas, visitas o resúmenes deja pasar a un rol que no esté en su lista. Si alguna lo deja pasar, me detengo y te lo explico.
- **Permisos:** las firmas no cambian, así que los permisos de ejecución tampoco. Se comparan antes y después.

**Pruebas (sin crear ni cambiar datos de clientes)**
- Con Bautista: entra en Ventas y `vendedores_objetivos` le devuelve 0 filas.
- `situaciones_activas` devuelve solo situaciones de clientes que Bautista puede ver.
- La prueba con una cuenta de marketing real la haces tú cuando crees el usuario.

## Fase 2 — Ofertas (pendiente de aprobación)

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

## Fase 3 — Envío (pendiente)

**Teléfono**
- Se usa el primer móvil español que haya en `telefono_whatsapp`, `telefono` o `telefono2`.
- En el enlace de WhatsApp va `34XXXXXXXXX`.
- Si no hay móvil, se pide, con la casilla «Guardar en la ficha» marcada.

**Bloqueos**
1. Oferta no vigente.
2. Delegación.
3. Tipo de cliente.
4. Requisitos de perfil.
5. Marca excluida.
6. `no_quiere_ofertas`.
7. `prohibicion_venta`, según los patrones.
8. Situación activa con efecto «ocultar».
9. **Baja en ISI**, con la regla de arriba.

«Ya enviada el …» es un aviso, no un bloqueo.

**Permisos:** `ofertas_para_cliente` y `registrar_envio_oferta` son SECURITY DEFINER. Exigen `is_approved`, `can_view_cliente` y rol admin, director, jefe de zona o comercial.

**Estados del envío**
- `abierto` pasa a `enviado` o `no_enviado`.
- Al volver al CRM, se pregunta «¿Se envió?».
- En el envío múltiple, «Siguiente» va de cliente en cliente.

**Historial:** los envíos aparecen en la pestaña Visitas de la ficha con estilo propio. No crean visitas ni bloques y no cuentan como visita.

**Acceso:** el panel `ofertas` se da a jefes de zona y comerciales.

## Fase 4 — Comunicaciones (pendiente)

**Quién ve qué**
- Comercial: lo de sus clientes.
- Jefe de zona: su delegación.
- Admin, director y marketing: todo.

**Contenido**
- RPC paginada que devuelve el nombre del cliente.
- Ventas en lo ofertado 30 días antes y 30 días después del envío, solo cuando `fecha_corte_datos()` ya cubre esos 30 días.
- Resumen por oferta, con la etiqueta «asociación, no causa».
- Cada envío muestra la oferta tal como se envió, también si está archivada.
- Panel `comunicaciones` y sus filas de acceso.

## Fase 5 — Recomendaciones (pendiente)

Orden de los clientes recomendados:
1. Compraron lo ofertado en los últimos 12 meses.
2. Lo compraban y lo han dejado.
3. El resto, por días sin comprar.

Se aplican los mismos bloqueos que en el envío, y lo descartado no vuelve a salir.

## Reglas comunes

- Una migración por fase, en `drizzle/migrations/`. El Paso 0 va solo.
- `GRANT EXECUTE` explícito en cada función nueva o cambiada.
- `anon` solo tiene acceso a la función de la página pública.

## Al aprobar

Se construyen el **Paso 0** (migración sola) y después la **Fase 1**. Las fases 2 a 5 esperan a que las apruebes una a una.
