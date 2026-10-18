# Ofertas y Comunicaciones

Dos secciones nuevas: **Ofertas**, donde marketing o la dirección crea las ofertas, y **Comunicaciones**, donde se ve lo que se ha enviado. El comercial envía la oferta por su propio WhatsApp desde la ficha del cliente, y el envío queda guardado como visita de tipo «llamada».

## Fase 1 — Rol Marketing

- Rol nuevo «Marketing / Soporte». Solo ve **Ofertas** y **Comunicaciones** (consulta). No ve Ventas, Clientes, Visitas ni nada más.
- Pueden crear, editar, archivar y eliminar ofertas: admin, director comercial y marketing.
- Comerciales y jefes de zona: solo ven las ofertas **vigentes** que les corresponden.

## Fase 2 — Ofertas

Cada oferta tiene:
- Título, texto del mensaje y fecha de inicio y de vencimiento.
- Adjuntos: una imagen (lo normal) y, si hace falta, un PDF. Quedan guardados en el CRM y el mensaje lleva un enlace para abrirlos.
- **A quién va dirigida**:
  - Delegaciones: todas (por defecto) o solo algunas.
  - Tipos de cliente: todos o solo algunos.
  - Requisitos opcionales del perfil del cliente: por ejemplo, «trabaja la marca X», «segmento Camión» o «tipo de negocio Taller».
  - **Exclusiones** por marca: la oferta se marca con la marca o marcas que promociona (Sachs, Valeo…).
- Estado: borrador, publicada, vencida (pasa sola al vencer) o archivada.
- Vista previa de cómo se verá el mensaje en WhatsApp.

En el perfil del cliente se añade el dato **«Marcas que no quiere»**. Si un cliente rechaza Sachs, cualquier oferta marcada con Sachs le sale bloqueada.

## Fase 3 — Envío y registro

- En **Mi cuenta**, cada comercial pone su teléfono de trabajo.
- En la ficha del cliente, botón **«Enviar oferta»**: aparecen las ofertas vigentes.
  - Las que se pueden enviar, normales.
  - Las que no, en gris, tachadas y con el motivo («No quiere Valeo», «Otra delegación», «Tipo de cliente no incluido»…). No se pueden enviar.
- Al pulsar Enviar se abre el WhatsApp del comercial con el texto y el enlace ya escritos, dirigido al teléfono del cliente. El comercial pulsa Enviar en WhatsApp.
- En ese momento el CRM guarda:
  - una **visita de tipo llamada** con el motivo «Envío de oferta», visible en la pestaña Visitas del cliente;
  - una línea en Comunicaciones (oferta, cliente, comercial, fecha y teléfono).
- Si el cliente no tiene teléfono, se avisa y se puede escribir uno a mano.
- Envío a varios clientes: el comercial elige la oferta, marca los clientes y el CRM va abriendo WhatsApp cliente a cliente.
- La misma comprobación de bloqueos se hace también en el servidor: aunque alguien manipule la pantalla, no se puede registrar el envío a un cliente bloqueado.

Limitación: como el mensaje se manda desde el móvil del comercial, el CRM no puede saber si al final lo envió ni si el cliente lo leyó. Queda registrado como «abierto para enviar».

## Fase 4 — Comunicaciones

- Listado de todo lo enviado, con filtros por comercial, oferta, cliente, delegación y fechas.
- Resumen por comercial (envíos por oferta) y por oferta (clientes alcanzados).
- Quién ve qué:
  - Admin, dirección y marketing: todo.
  - Jefe de zona: su delegación.
  - Comercial: solo lo suyo.
- Desde cada oferta: «enviada a N clientes».

## Fase 5 — Recomendaciones

- Para cada comercial, la lista **«Ofertas sugeridas»**: pares oferta–cliente que cumplen las reglas, no están bloqueados y no han recibido esa oferta antes.
- Orden: primero los clientes que compran la familia o marca de la oferta, luego los que llevan tiempo sin comprar y luego los que tienen más potencial.
- El comercial marca «Enviar» o «Descartar». Lo descartado no vuelve a salir para esa oferta.
- Al principio son reglas claras (sin IA). Más adelante se puede añadir un texto personalizado con IA.

## Orden de construcción

Cada fase se entrega y se prueba por separado. Cada fase con cambios en la base lleva una sola migración.

```text
1 Rol -> 2 Ofertas -> 3 Envío + llamada -> 4 Comunicaciones -> 5 Recomendaciones
```

## Detalles técnicos

- Añadir `marketing` al tipo `app_role`. Las reglas de acceso de ventas, clientes y visitas ya filtran por rol, así que hay que comprobar que marketing no entra en ninguna. Marketing tendrá acceso a los paneles `ofertas` y `comunicaciones` de `dashboards`.
- Tablas nuevas:
  - `ofertas`: delegaciones[], tipos_cliente[], marcas[], requisitos jsonb, vigencia, estado, adjuntos jsonb.
  - `comunicaciones`: oferta_id, cod_cliente, user_id, telefono, visita_id, enviado_en.
  - `oferta_descartes`.
  - Todas con permisos explícitos, RLS y `is_approved`, y auditadas con `auditar_cambio`.
- Bucket privado `ofertas-adjuntos`. El enlace del mensaje es un enlace firmado de larga duración o una página pública mínima por oferta (a decidir en la fase 3).
- Función `ofertas_para_cliente(cod)`: devuelve cada oferta con `permitida` y `motivo_bloqueo`. La usan la ficha y las recomendaciones.
- Función `registrar_envio_oferta(oferta, cod, telefono)`: vuelve a validar, crea la visita (`tipo='llamada'`, motivo `envio_oferta`) y la comunicación en una sola operación.
- `perfil_atributos`: nuevo atributo `marcas_excluidas` (multiselect, catálogo `marcas_vehiculo`/marcas de producto).
- Teléfono del comercial: columna nueva `profiles.telefono_trabajo`, que puede editar el propio usuario. Hay que añadirla al trigger anti-escalada como campo permitido.
- Enlace de WhatsApp: `https://wa.me/<tel>?text=<encodeURIComponent>`, con el teléfono normalizado a +34.
- Las migraciones van en `drizzle/migrations/`.
