# Auditoría legible y página propia de Seguridad

## Comprobado antes de proponer
- **Duplicados.** Cada cambio hecho desde el panel deja hoy dos eventos: el que registra la base y el que manda el navegador.
  - Base: `dato_cambio` (ajustes) o `usuario_cambio` (perfil de usuario).
  - Navegador: `cambio_config_seguridad`, `aprobacion_usuario`, `baja_usuario`, `cambio_rol` y `cambio_ver_margen`.
  - Lo mandan Seguridad (cada ajuste), Usuarios (exigir segundo factor, aprobar, rechazar, rol, ver margen) y Dispositivos (límites de sesiones y equipos).
- **Qué aporta el del navegador.** Solo la IP y la pantalla desde la que se hizo, que el de la base no guarda. Todo lo demás (quién, qué campo, antes → después) ya lo tiene el de la base.
- **Asignar un rol** borra el rol anterior y crea el nuevo, así que la base deja dos eventos: «Usuario: baja» y «Usuario: alta».
- **Rechazar un usuario pendiente** manda desde el navegador un evento «Baja de usuario». La tarea de avisos lo trata como una baja real y envía un aviso falso.
- **Sin trigger en la base:** la gestión de equipos y la generación de códigos. Esos eventos del navegador se quedan.
- **Ajustes:** la base guarda `antes` y `despues` como valores simples, y hoy la pantalla no los pinta.

## 1. Conservar la IP: una migración (justificada)
Si quito el evento del navegador sin más, Auditoría pierde la IP de los cambios de configuración. La base puede leerla de la propia petición: la cabecera que acompaña a cada cambio hecho desde la app.

La migración modifica las dos funciones que registran desde la base, `auditar_cambio_ajustes` y `auditar_cambio_usuario`. No se toca `auditar_cambio`.
- Rellenan `ip` y `user_agent` con el mismo criterio que la función que registra los eventos del navegador: `cf-connecting-ip` primero y, si no está, la primera dirección de `x-forwarded-for`.
- Si no hay petición (editor SQL, procesos internos), los dos campos quedan vacíos y el evento se registra igual.
- Mismas firmas, mismos triggers, mismos permisos; el resto de la lógica no cambia.

La pantalla desde la que se hizo el cambio no llega a la base y se pierde. Se puede deducir del tipo de evento, porque los ajustes solo se cambian en Seguridad y los usuarios en Usuarios.

Antes de quitar nada del navegador compruebo con un cambio real que la IP llega a la base. **Si no llega, me detengo y te lo explico** sin quitar los eventos del navegador.

## 2. Quitar los duplicados del navegador
- Seguridad: deja de mandar `cambio_config_seguridad` al guardar un ajuste.
- Usuarios: dejan de mandarse exigir segundo factor, aprobar, rechazar (que es lo que provoca el aviso falso de baja), rol y ver margen.
- Dispositivos: deja de mandarse el guardado de límites. **Se quedan** las acciones sobre equipos (autorizar, bloquear, renombrar) y «Código generado».
- No cambia cómo se guarda nada.
- Los eventos antiguos siguen en Auditoría tal cual: no borro ni oculto historial.

## 3. Pantalla de Auditoría en castellano
- **Tipos.** Todos los que existen hoy tienen nombre: «Cambio de ajuste», «Cambio de usuario», «Alta de usuario», «Suspensión automática», «Fin de suspensión», «Cambio de estado de usuario», «Cambio de nombre de usuario», «Código usado», «Código no válido», «Equipo autorizado», «Equipo denegado», «Sesión expulsada», «Cambio de configuración de seguridad» (los antiguos y los de equipos), etc. El filtro de tipos usa la misma lista.
- **Ajustes.** Cada cambio muestra «Duración máxima de sesión: 12 → 1». Las claves de ajuste tienen nombre legible, y algunos valores también: «bloqueo» → «Bloqueo», «true» → «Sí», etc.
- **Entidad.** Muestra el nombre del ajuste («Duración máxima de sesión»), del usuario, «Equipo» o «Aviso», nunca el nombre técnico.
- **Avisos.** Las categorías se traducen («configuracion» → «Configuración de seguridad», «limite_ip» → «Límite de intentos por conexión»…). «via: iniciar-sesion» pasa a «Vía: pantalla de acceso».
- **Cambio de rol.** El par «Usuario: baja» y «Usuario: alta» del mismo rol, hecho por el mismo administrador sobre el mismo usuario en menos de 5 segundos, se muestra como una sola fila «Cambio de rol: Comercial → Administrador». Solo cambia la pantalla: en la base siguen siendo dos eventos. La alternativa es cambiar cómo se guarda el rol para que sea una sola modificación; no la hago porque toca cómo se guarda.
- **Sin traducción.** Lo que no tenga nombre se muestra en gris y con su nombre técnico, para que se note.
- **Usuario.** «Sistema» en lugar de «Sin sesión».
- **Móvil.** Sin desplazamiento horizontal; el detalle se despliega dentro de la tarjeta, como ahora.

## 4. Página Seguridad
- **Acceso.** Nueva entrada «Seguridad» en el menú de Administración, en `/admin/seguridad`, con el mismo control de acceso que Usuarios y Auditoría (solo administradores).
- **Contenido.** Todo el panel actual: control de acceso, alta de equipos, sesiones simultáneas, acceso con correo, segundo factor, duración de sesión y avisos por correo. Cada ajuste lleva debajo una línea que explica qué hace.
  - Duración máxima de sesión: «Cuenta desde que el usuario inició sesión, no desde su última actividad. Para equipos desatendidos, usar el bloqueo de pantalla del dispositivo.»
  - Añado las líneas que faltan en los avisos (interruptor y destinatario).
- **Comprobación de nombres de usuario.** La página calcula por su cuenta cuántos usuarios activos no tienen nombre de usuario, para seguir impidiendo que se desactive el acceso con correo mientras haya alguno.
- **Lógica.** Los ajustes se guardan exactamente igual que ahora; solo cambian de sitio.

**Usuarios** deja de mostrar el panel. Sigue leyendo el modo del segundo factor, que necesita para marcar a los administradores como obligatorios. Arriba solo aparece un aviso breve con el enlace «Ir a Seguridad», y solo cuando algo requiere atención:
- los avisos no están llegando;
- los avisos no se están comprobando;
- el modo bloqueo está activo.

## Prueba
1. Cambio un ajuste desde Seguridad y lo devuelvo a su valor. Compruebo que queda un único evento por cada cambio, con IP, que se lee como «ajuste: antes → después», y que llega el aviso.
2. En Usuarios, activo y desactivo «ver margen» en la cuenta de Bautista. Compruebo que queda un único evento por cada cambio, con IP.
3. Con un cambio desde el editor SQL compruebo que la IP queda vacía y el origen es «Sistema».
4. Reviso Auditoría en escritorio y en móvil sin desplazamiento horizontal.

## Detalles técnicos
- Archivos que cambian:
  - Migración: `auditar_cambio_ajustes` y `auditar_cambio_usuario` leen `current_setting('request.headers', true)`.
  - Página nueva y ruta: `src/pages/AdminSeguridad.tsx`, y su ruta en `App.tsx` con `ProtectedRoute adminOnly`.
  - Menú: `AppSidebar.tsx`.
  - Panel: `SeguridadAccesoCard.tsx` (sin el `registrarEvento` del ajuste, con los textos de ayuda) y `AvisosSeguridadBloque.tsx` (textos).
  - Usuarios y equipos: `AdminUsers.tsx` y `DispositivosUsuarioDialog.tsx`.
  - Auditoría: `AdminAuditoria.tsx`.
- Sin cambios en `iniciar-sesion`, `cambiar-password`, `registrar_sesion`, `verificar_sesion`, `avisos-seguridad` ni `registrar-evento`.
