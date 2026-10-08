# Avisos de seguridad por correo al administrador

## Respuestas previas

**Servicio de envío.** El correo propio de Lovable Cloud, el mismo que ya envía los correos de acceso. El dominio `notify.crmrimosa.josecarlossobrino.com` está verificado y sirve tal cual. Remitente: «CRM Rimosa <noreply@crmrimosa.josecarlossobrino.com>».
- Límite: es un cupo por hora del espacio de trabajo que depende del plan; no es una cifra fija que pueda dar desde aquí. Si se supera, el servicio responde «espera N segundos» y no se pierde nada: el aviso se reintenta en la siguiente pasada. Con el diseño propuesto el máximo teórico son unos 40 correos/hora (6 categorías × 6 pasadas) y lo normal es cero.
- Dos efectos del servicio que no se pueden desactivar: cada correo lleva un pie con enlace para darse de baja (si alguien lo pulsa, info3@rimosa.com deja de recibir **todos** los correos de la app, no los de acceso), y no admite adjuntos.
- El servicio solo permite correos ligados a un hecho concreto y a un destinatario; un aviso de seguridad al administrador encaja. No se envía nunca a listas.

**Cómo se dispara.**

| Opción | A favor | En contra |
|---|---|---|
| Trigger + pg_net por evento | Inmediato | Un ataque de 300 eventos lanza 300 llamadas; habría que agrupar igualmente; añade trabajo al camino del inicio de sesión |
| Tarea programada cada 10 min que lee `auditoria_eventos` | Agrupa por naturaleza; no toca inicio de sesión ni ninguna función existente; si falla, la siguiente pasada recupera; no hace falta tabla de cola | Retraso de hasta 10 min |

Propongo la **tarea programada**. `auditoria_eventos` ya es la cola: no se crea ninguna tabla nueva. Un retraso de 10 minutos es aceptable para avisos que hoy nadie ve hasta días después.

## Qué se avisa

Cada pasada lee los eventos nuevos desde la última pasada y los agrupa en estas categorías. Cada categoría con algo nuevo genera **un** correo con el recuento y hasta 20 líneas (las demás se resumen como «y N más»).

1. **Suspensión automática** (`suspension_automatica`). En el asunto se marca «CUENTA SOSPECHOSA» si algún evento es del ciclo 2 o posterior.
2. **Límite por IP alcanzado.** Hoy `iniciar-sesion` rechaza la petición pero no deja un evento propio. Para no tocar esa función, la pasada lo calcula sobre los mismos datos: IPs con 10 o más fallos de contraseña (sin contar `error_servicio`) en la ventana que usa el inicio de sesión. Se avisa una vez por IP y ventana.
3. **Configuración de seguridad.** Eventos que el trigger de servidor de `app_settings` ya escribe (no el evento que manda el navegador) para las claves de control de acceso, alta de equipos, sesiones simultáneas, modo del segundo factor y duración de sesión. Cada línea: «Clave: antes → después». Si se relaja una medida, el asunto lleva «MEDIDA RELAJADA»: control desactivado, segundo factor hacia `desactivado`, duración mayor o 0 (sin límite), más sesiones o equipos permitidos.
4. **Nuevo administrador.** Alta o cambio en `user_roles` cuyo valor nuevo es `admin`.
5. **Segundo factor restablecido** (`2fa_reseteado`).
6. **Baja de usuario** (`baja_usuario`).

Lo que añado:
- **Cambios en los propios avisos** (apagar el interruptor o cambiar el destinatario) cuentan como configuración relajada. Si se cambia el destinatario, el aviso se manda también a la dirección anterior: así nadie puede desviarlos sin que se note.
- **Suspensión manual por un administrador** (`cambio_estado_usuario` a suspendido/bloqueado) va en la categoría 1.

Lo que descarto: inicios de sesión correctos, fallos sueltos de contraseña, `2fa_fallido` sueltos, cambios de nombre o de usuario, y el fin de una suspensión.

## Contenido del correo

Asunto: `[CRM Rimosa] 3 suspensiones automáticas (1 cuenta sospechosa)`.
Cada línea dice qué ha pasado, a quién (nombre y usuario), cuándo (hora de Madrid) y desde qué IP, más quién lo hizo si fue un administrador. Al final, un botón «Abrir Auditoría» que lleva a la pantalla de Auditoría. Del detalle de cada evento solo se copian campos de una lista permitida: nunca se copian contraseñas, códigos, tokens, user-agent ni cabeceras.

## Protección contra avalanchas

- Una pasada cada 10 minutos, como máximo un correo por categoría en cada pasada.
- Por cada categoría, si ya se envió un correo en los últimos 30 minutos, los eventos nuevos se guardan para el siguiente correo en lugar de mandar otro. Así, un ataque continuado da como mucho 2 correos/hora por categoría, cada uno con el recuento acumulado.
- Clave de no duplicado por categoría y tramo: si una pasada se reintenta, no sale el mismo correo dos veces.

## Panel de seguridad

En la tarjeta de seguridad ya existente se añade un bloque «Avisos por correo»:
- Interruptor «Enviar avisos de seguridad» (`avisos_seguridad_activo`, por defecto activado).
- Campo «Correo destinatario» (`avisos_seguridad_email` = `info3@rimosa.com`), con validación de formato.
- Texto: «Último aviso enviado: …» leído de Auditoría.

## Registro de cada aviso

Cada envío deja un evento en `auditoria_eventos`: `aviso_seguridad` con resultado `ok` (enviado), `denegado` (destinatario dado de baja) o `fallo` (con código de error, sin el contenido del correo). El detalle guarda la categoría, el recuento y la dirección. En Auditoría aparece con la etiqueta «Aviso de seguridad» y su filtro. La pasada ignora estos eventos al leer, para no avisar de sus propios avisos.

## Garantía de no romper nada

La pasada vive aparte: ningún inicio de sesión, ningún registro en auditoría y ninguna operación de usuario espera por ella ni depende de ella. Si el envío falla, solo queda el evento `fallo` y el cursor no avanza para esa categoría, así que se reintenta en la siguiente pasada.

## Fuera de alcance

No se tocan `iniciar-sesion`, `cambiar-password`, `registrar_sesion` ni `verificar_sesion`. En `auth-email-hook` solo cambia `SITE_NAME` a «CRM Rimosa».

## Detalles técnicos

- **Migración única** (`drizzle/migrations/0009_avisos_seguridad.sql`):
  - `INSERT ... ON CONFLICT DO NOTHING` en `app_settings`: `avisos_seguridad_activo='true'`, `avisos_seguridad_email='info3@rimosa.com'`, `avisos_seguridad_estado='{}'` (cursor y última hora de envío por categoría, en jsonb). La última clave no se muestra en el panel y no se puede escribir desde el navegador (la escribe solo la función, con service role; la política de escritura de admin sobre `app_settings` excluye esa clave).
  - Programación `pg_cron` + `pg_net` cada 10 min, en el minuto 3 (`3-59/10 * * * *`), llamando a la función. Advertencia: la URL del proyecto queda escrita en la migración; si se lleva la base a otra instancia hay que volver a crear esa programación con la URL nueva.
- **Plantillas de correo de la app**: se crea la estructura una sola vez y una plantilla `aviso-seguridad` (React Email, fondo blanco, verde corporativo, todo en castellano).
- **Función `avisos-seguridad`** (nueva, no acepta datos de entrada; destinatario y plantilla fijos en servidor; idempotente gracias al cursor, así que llamarla de más no genera correos). Con service role: lee ajustes, sale si el interruptor está apagado, consulta eventos con `ocurrido_en > cursor` y `tipo <> 'aviso_seguridad'`, agrupa, aplica la ventana de 30 min, envía con `sendTemplateEmail` y `idempotencyKey = avisos-<categoria>-<cursor>`, registra el evento y avanza el cursor por categoría solo si se envió o el destinatario estaba dado de baja. Si responde 429, respeta el tiempo de espera y lo deja para la siguiente pasada. Va con su `deno.json` y una entrada en `config.toml`.
- Constantes de la ventana y el límite por IP copiadas de `iniciar-sesion` (10 fallos), con un comentario que diga que tienen que coincidir.
- `SeguridadAccesoCard.tsx`: nuevo bloque, guarda con el mismo `upsert` que el resto.
- `AdminAuditoria.tsx`: etiqueta y filtro para `aviso_seguridad`; nombres traducidos de `categoria`, `recuento` y `destinatario`.
- `auth-email-hook/index.ts`: `SITE_NAME = "CRM Rimosa"` y despliegue.
- Comprobación: activar, provocar un cambio de un ajuste de seguridad en un campo inocuo y devolverlo a su valor, lanzar la función a mano, ver que llega el correo y el evento `aviso_seguridad/ok`; volver a lanzarla y ver que no sale un segundo correo.
