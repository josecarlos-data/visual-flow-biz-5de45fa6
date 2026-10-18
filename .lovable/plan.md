# Ofertas y Comunicaciones (revisado)

Marketing crea las ofertas. El comercial las envía por su propio WhatsApp desde la ficha del cliente, y el envío queda en el historial del cliente. Las visitas, la revisión de visitas y los incentivos no cambian.

## Datos pedidos (consultados hoy)

**Valores de `clientes.prohibicion_venta`** (11.604 clientes):

| Valor | Clientes |
|---|---|
| CLIENTE DESACTUALIZADO | 5.998 |
| (vacío) | 3.181 |
| PROHIBICION DE VENTA | 1.408 |
| AVISAR A ADMINISTRACION | 795 |
| GIRO DEVUELTO | 61 |
| MOROSO A PERDIDAS | 12 |
| CAMBIA DE CODIGO DE CLIENTE | 10 |
| CLIENTE DATOS ERRONEOS | 6 |
| CLIENTE A PERDIDAS (NO ABRIR) | 5 |
| Unos 120 valores sueltos de 1–3 clientes cada uno: «PASA AL nnnn» (unos 100), FRAS. PTES, HA CERRADO LA EMPRESA, EMPRESA EN LIQUIDACION, CONCURSO, DUEÑO FALLECIDO… | — |

**Clientes con móvil por delegación:**

| Delegación | Clientes | Con móvil | Con algún teléfono |
|---|---|---|---|
| GRANADA | 3.857 | 0 | 0 |
| ALMERIA | 2.731 | 0 | 0 |
| GUARROMAN | 2.305 | 0 | 0 |
| MALAGA | 2.139 | 0 | 0 |
| MANZANARES | 531 | 0 | 0 |
| (sin delegación) | 29 | 0 | 0 |

Además, ningún cliente tiene `persona_contacto` y ninguno tiene un móvil en `extra`. La importación actual no trae ni teléfonos ni contactos.

## Dos puntos que cambio respecto a tu propuesta (necesito tu decisión)

**1. Bloqueo por `prohibicion_venta`.** Con «no vacía = bloqueado» quedaría bloqueado el 73 % de los clientes. Casi todos son «CLIENTE DESACTUALIZADO» y «AVISAR A ADMINISTRACION», que no parecen motivos para no mandar una oferta.
- Propuesta: un ajuste `ofertas_prohibiciones_bloqueantes` (lista de valores), editable desde Seguridad o Datos.
- Valores iniciales propuestos: PROHIBICION DE VENTA, GIRO DEVUELTO, MOROSO A PERDIDAS, CLIENTE A PERDIDAS (NO ABRIR), HA CERRADO LA EMPRESA, EMPRESA EN LIQUIDACION, CONCURSO, DUEÑO FALLECIDO y cualquier valor que empiece por «PASA AL» (cliente que ha cambiado de código).
- El resto se muestra como aviso, sin bloquear.
- Si prefieres «no vacía = bloqueado» tal cual, se hace así.

**2. Teléfonos.** Hoy no hay ningún teléfono en el CRM, así que el móvil se pedirá en el 100 % de los envíos al principio. Opciones:
- (a) Seguir así: el comercial lo escribe una vez y se guarda en la ficha (`telefono_whatsapp`).
- (b) Revisar antes la importación del maestro por si el Excel sí trae las columnas de teléfono y se pierden al cargar. Lo compruebo como primer paso de la Fase 3, sin cambiar nada.

{contacto} seguirá saliendo «Hola» hasta que haya contactos.

## Paso 0 — Valor nuevo del rol

Una migración sola, en `drizzle/migrations/`, con únicamente:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';
```

Nada más en esa migración ni en la misma ejecución.

## Fase 1 — Rol Marketing

- Añadir «Marketing» al selector de rol de Usuarios y a las etiquetas de Auditoría.
- Usuario sin ningún panel asignado: mostrar «Sin secciones asignadas» en lugar de la pantalla en blanco.
- Tras iniciar sesión, llevar a cada usuario a su primer panel permitido, no siempre a Ventas. Así no se registra un `acceso_denegado` falso en cada inicio de sesión.
- Marketing no lee clientes, ventas ni visitas.

Funciones SECURITY DEFINER que solo comprueban `is_approved`, y qué hacer con cada una:

| Función | Qué devuelve | Propuesta |
|---|---|---|
| `situaciones_activas()` | Situaciones de todos los clientes | Filtrar por `can_view_cliente(auth.uid(), cod_cliente)` dentro de la función. Así queda acotada por rol, también para marketing. Sus llamantes (`panel_alertas`, `panel_dormidos`, `ruta_clientes`) ya filtran por clientes visibles, así que no cambia lo que ven hoy. Antes de cambiarla, mido el coste con la cuenta de Bautista. |
| `vendedores_objetivos()` | Lista de vendedores con objetivos | Exigir rol distinto de marketing. |
| `get_distinct_vendedores()` / `get_distinct_delegaciones()` | Nombres de vendedores y delegaciones | Se dejan: marketing necesita las delegaciones para dirigir ofertas y no son datos de cliente. |
| `buscar_productos()` | Catálogo de productos | Se deja: marketing lo necesita para elegir referencias. |
| `auditar_cambio_usuario` | — | Es un trigger, no aplica. |

Antes de construir la fase vuelvo a sacar esta lista, por si ha cambiado.

## Fase 2 — Ofertas

**Contenido de la oferta:**
- Título y texto.
- Lo que promociona:
  - `marcas` (código de `productos.marca`; en pantalla se muestra `marca_nombre`);
  - `referencias`;
  - `familias` (opcional).
- Selectores de marca y referencia con búsqueda, servidos por RPC.
- Fechas de inicio y de vencimiento.
- Adjuntos: imagen y/o PDF.

**A quién va dirigida:** delegaciones (por defecto todas), tipos de cliente y requisitos opcionales de perfil.

**Marcas que bloquean la oferta:** las marcas de la oferta más la marca de cada referencia ofertada.

**Estados:**
- Guardados: borrador, publicada, archivada.
- «Vencida» se calcula al leer, sin tareas programadas.
- Solo se pueden eliminar los borradores sin envíos. Una oferta con envíos solo se puede archivar.

**Mensaje:**
- Admite `{contacto}`, que se sustituye por `persona_contacto` o por «Hola» si no hay.
- Termina con un pie fijo que el comercial no puede editar: identifica a RIMOSA e indica «Responde BAJA si no quieres recibir más ofertas». Texto provisional hasta que lo valide la asesoría.

**Página pública `/o/<token>`:**
- Sin login. Muestra el texto, la imagen y el PDF.
- Token aleatorio de al menos 128 bits, no el id.
- Si la oferta ha vencido, la página lo indica.
- La URL base sale de `app_settings.ofertas_url_base`; si está vacía, se usa el origen actual.

**Adjuntos:** bucket **público** `ofertas-publicas`, con rutas aleatorias (`<uuid>/<uuid>.<ext>`).
- Riesgos:
  - (1) Quien tenga el enlace puede reenviarlo. Es lo buscado, porque es material para clientes.
  - (2) Un archivo no se puede «retirar» por caducidad. Al eliminar o archivar la oferta, se borran sus archivos.
  - (3) No se puede listar el bucket: solo se puede leer quien conoce la ruta.
- Solo admin, director y marketing pueden subir archivos.
- Nunca se guardan ahí datos de clientes.

**Fuera de alcance:** la miniatura de la oferta en WhatsApp.

**Preferencias del cliente:** tabla nueva `cliente_preferencias_ofertas`, una fila por cliente:
- Campos: `no_quiere_ofertas`, `marcas_excluidas text[]` y `telefono_whatsapp`.
- Se ven y se editan en la pestaña Perfil, y los cambios se auditan con `auditar_cambio`.
- Pueden editarla quienes pueden ver el cliente. Marketing no puede.

**Panel `ofertas`** en `dashboards`:
- Filas de `user_dashboard_access` para los usuarios actuales de marketing y director.
- Prueba con una cuenta que no sea admin.

## Fase 3 — Envío

**Teléfono:**
- Se usa el primer móvil español (6 o 7 y 9 dígitos) que aparezca en `telefono_whatsapp`, `telefono` o `telefono2`.
- Se tolera que el campo traiga espacios, prefijo o dos números.
- El enlace de WhatsApp lleva `34XXXXXXXXX`, sin «+».
- Si no hay móvil, se pide, con la casilla «Guardar en la ficha» marcada por defecto.

**Bloqueos** (los mismos en pantalla y en servidor, cada uno con su motivo visible):
1. oferta no vigente;
2. delegación;
3. tipo de cliente;
4. requisitos de perfil;
5. marca excluida;
6. `no_quiere_ofertas`;
7. `prohibicion_venta`, según la decisión 1;
8. situación activa con efecto «ocultar».

«Ya enviada el …» es un aviso, no un bloqueo.

**Funciones `ofertas_para_cliente` y `registrar_envio_oferta`:**
- Son SECURITY DEFINER.
- Exigen `is_approved`, `can_view_cliente(auth.uid(), cod)` y rol admin, director, jefe de zona o comercial.
- Marketing no envía.

**Seguimiento del envío:**
- `comunicaciones.estado` pasa de `abierto` a `enviado` o `no_enviado`.
- Al volver al CRM (`visibilitychange`), se pregunta «¿Se envió?».
- En el envío a varios clientes, la misma pregunta y luego «Siguiente», con un toque por cliente. La lista de clientes sale por RPC.
- El envío se muestra en la pestaña Visitas de la ficha, mezclado por fecha y con estilo propio (WhatsApp, oferta, quién, estado). No suma al contador de visitas.
- No se crean filas en `visitas` ni en `visita_bloques` ni el motivo `envio_oferta`.

**Acceso y teléfono del comercial:**
- Acceso al panel `ofertas` para jefes de zona y comerciales.
- Sin teléfono del comercial ni «Mi cuenta». `prevent_profile_self_escalation` no se toca.

## Fase 4 — Comunicaciones

**Quién ve qué:**
- Comercial: lo de sus clientes (`can_view_cliente`).
- Jefe de zona: su delegación.
- Admin, director y marketing: todo.

**Listado y resúmenes:**
- Por RPC paginada, que devuelve el nombre del cliente.
- Medición por envío: ventas del cliente en lo ofertado 30 días antes y 30 días después. Solo se calcula cuando `fecha_corte_datos()` ya cubre esos 30 días; mientras tanto se muestra «pendiente».
- Por oferta: clientes alcanzados, cuántos compraron después e importe, con la etiqueta «asociación, no causa».

**Panel `comunicaciones`** y sus filas de acceso.

## Fase 5 — Recomendaciones

Pares oferta–cliente sin bloqueos y que no han recibido esa oferta. Orden:
1. clientes que compraron lo ofertado en los últimos 12 meses;
2. clientes que lo compraban y lo han dejado;
3. el resto, por días sin comprar.

El comercial elige «Enviar» o «Descartar»; lo descartado no vuelve a salir para esa oferta. Usa los mismos bloqueos que el envío.

## Migraciones

```text
Paso 0 (enum, sola) -> F1 -> F2 -> F3 -> F4 -> F5
```

- Una migración por fase, en `drizzle/migrations/`.
- `GRANT EXECUTE` explícito en cada función nueva o cambiada.
- `anon` solo puede ejecutar la función de la página pública (`oferta_publica(token)`), que devuelve solo campos públicos de ofertas publicadas.
- Tablas nuevas con GRANT, RLS y `is_approved`; las de negocio, auditadas.

## Al aprobar

Solo se construye el **Paso 0**. Las fases 1 a 5 esperan a tu decisión sobre los puntos 1 y 2, y cada una se aprueba por separado.
