# Conversación por bloque entre revisor y comercial

## Datos actuales (consultados)
- Notas de bloque no vacías: **1.321**.
  - **9 de visitas de la app**: todas tienen revisor, fecha de revisión y comercial dueño.
  - **1.312 de visitas importadas de Gespromo**: sin revisor, sin fecha de revisión y sin comercial dueño (user_id vacío). Son notas importadas, no preguntas de Fran.
- Revisores = admin, director comercial y jefe de zona (este último, solo de sus clientes). Esta regla ya existe en la base de datos y la reutilizo.

## Punto a decidir antes de aplicar (paso c)
Las 1.312 de Gespromo no tienen autor ni comercial al que avisar. Propuesta: **pasan como mensajes con autor vacío y nombre «Gespromo (importado)»**, con la fecha de la visita. No cuentan como novedad para nadie (no hay dueño y se dan por leídas), y se siguen viendo en la ficha del cliente.
Alternativa: pasar solo las 9 de la app y dejar las de Gespromo en la columna histórica. Si no indicas otra cosa, aplico la propuesta.

## 1. Migración única (drizzle/migrations/0029_visita_mensajes.sql)
- **visita_mensajes**: campos pedidos; texto con `CHECK (length(btrim(texto)) > 0)`; índices por (visita_id, created_at) y bloque_id.
  - Trigger BEFORE INSERT `visita_mensajes_autor()` SECURITY DEFINER: con sesión, fija autor_id = auth.uid() y autor_nombre = profiles.full_name (o email). REVOKE EXECUTE a PUBLIC, anon, authenticated.
  - Permisos: SELECT, INSERT, DELETE a authenticated; ALL a service_role. Sin UPDATE.
  - RLS (permisiva), helper `puede_conversar_visita(visita_id)` SECURITY DEFINER: aprobado y (dueño `visitas.user_id = auth.uid()` o admin o puede_revisar_visitas + puede_ver_bloque). SELECT/INSERT con ese helper (INSERT además exige que bloque_id, si hay, sea de esa visita); DELETE solo admin.
- **visita_lecturas** (visita_id FK cascade, user_id, leido_en), PK (visita_id, user_id). RLS: user_id = auth.uid() en SELECT/INSERT/UPDATE. Grants a authenticated y service_role.
- **Backfill** de notas según la decisión anterior (autor revisado_por, nombre del perfil, fecha revisado_en o fecha de la visita). La columna nota_revision se comenta como DEPRECATED (histórico). Informo conteo final por origen.
- **RPCs** SECURITY DEFINER, GRANT EXECUTE a authenticated, filtro y paginación en servidor:
  - `mis_revisiones(_filtro text, _limite int, _offset int)`: visitas propias con novedades desde mi última lectura (mensajes de otro o bloque No correcto revisado por otro después de mi lectura). Filtros `sin_leer`, `esperando` (último mensaje de algún bloque es de otro), `todas`. Devuelve cliente, fecha, bloques con estado, último mensaje, número sin leer, total.
  - `revision_respuestas_nuevas(_limite, _offset)` y una columna/flag para la lista de Revisión: visitas de mi ámbito con mensajes del dueño posteriores a mi lectura.
  - `contadores_mensajes()`: { mis_revisiones, respuestas_nuevas }.
  - `marcar_visita_leida(_visita_id)`: upsert de la lectura (solo si puede conversar).
  - `mensajes_visita(_visita_id)`: mensajes de una visita (para ficha y diálogos).

## 2. Revisión de visitas
- Por bloque: mensajes (autor, fecha, texto) y cuadro de nuevo mensaje en lugar de «Nota para el comercial». Se envía con Guardar junto al estado; ya no se escribe nota_revision.
- Marcas en bloque pendiente: «Esperando al comercial» (último mensaje del revisor) / «Respuesta nueva» (último del comercial no leído).
- Lista: marca «Respuesta nueva» y filtro «Solo respuestas nuevas».
- Abrir visita la marca como leída.
- Observaciones: en origen app, solo lectura con etiqueta «Observaciones del comercial»; editables solo en Gespromo.

## 3. Mis revisiones (/visitas/revisiones, dashboardKey "visitas")
- Lista móvil, no leídas primero; filtros «Sin leer», «Esperando mi respuesta», «Todas»; paginación.
- Detalle: cada bloque con estado, mensajes y cuadro para responder (envío inmediato). Al abrir, queda leída.

## 4. Menú
- Comerciales: «Mis revisiones» con número. Revisores: número junto a «Revisión de visitas». Refresco al volver a la pestaña y cada 3 minutos; se invalida al enviar o leer.

## 5. Ficha del cliente (pestaña Visitas)
- «Nota de revisión» se sustituye por los mensajes del bloque; dueño y revisores pueden escribir.

## No se toca
Validación por bloque y su trigger, políticas de visitas/visita_bloques, registro de visitas, IA. Sin drizzle-kit push/generate.

## Prueba
1. Crear visita de prueba de Bautista, cliente externo «PRUEBA», en domingo, con un bloque.
2. Admin escribe y guarda: «Esperando al comercial».
3. Sesión de Bautista: aparece en Mis revisiones y contador; responde.
4. Admin: fila con «Respuesta nueva» y contador; al abrir desaparecen.
5. Otro comercial: no ve mensajes en pantalla ni con consulta directa (si no hay otra cuenta comercial de prueba, compruebo por consulta simulando su identidad y te lo indico).
6. Borrar la visita de prueba (sus mensajes y lecturas se van en cascada).

## Detalles técnicos
- Nuevo hook `useVisitaMensajes` (mensajes por visita, envío, marcar leída) y `useContadoresMensajes`.
- Ficheros: RevisionVisitas.tsx, nueva MisRevisiones.tsx, App.tsx (ruta lazy), AppSidebar.tsx, ClienteDetalle.tsx, useCrm.ts (dejar de escribir nota_revision).
- Test de la regla de «novedad» (mensaje de otro tras última lectura) en helper puro.
