# Contraseñas: política, cambio voluntario, restablecer y forzar cambio

## Respuestas previas

1. **URL de redirección.** El código no fija hoy ningún `redirectTo` (no existe ningún flujo de restablecimiento), así que los correos usarían la Site URL del backend. No he podido leer la Site URL ni la lista de URLs permitidas: ninguna herramienta disponible las muestra. Para fijarla: Cloud → Users → Auth Settings → URL Configuration. Ahí se pone `https://crmrimosa.josecarlossobrino.com` como Site URL y se añade `https://crmrimosa.josecarlossobrino.com/**` a las Redirect URLs. Hay que comprobarlo ahí antes de probar.
2. **Envío de correos.** No hay ningún dominio de correo configurado. Los correos de autenticación salen hoy con el remitente por defecto de Lovable, con un límite de envíos por hora bajo, pensado para pruebas y no para producción (no consta la cifra exacta). El remitente y las plantillas en español solo se pueden personalizar después de configurar un dominio propio, por ejemplo `notify.josecarlossobrino.com`. Recomiendo hacerlo antes de usar «Restablecer contraseña» con usuarios reales.

## DETENCIÓN: punto A.3 no es viable tal como está

En Lovable Cloud no se pueden crear triggers en el esquema `auth`. `on_auth_user_created` es una excepción que heredó la plantilla, no un permiso general. Así que no puedo crear `AFTER UPDATE OF encrypted_password ON auth.users`.

**Alternativa propuesta (no es una RPC llamable sin cambiar la contraseña).** Una función de servidor `cambiar-password`:
- Valida el JWT y obtiene el usuario con `auth.getUser()`.
- Valida la política (12 caracteres o más, coincidencia) también en el servidor.
- Cambia la contraseña con la API de administración (`auth.admin.updateUserById(uid, { password })`).
- **Solo si ese cambio tiene éxito**, pone `debe_cambiar_password=false` y `password_cambiada_en=now()` con la clave de servicio, que no pasa por el trigger anti-escalado.
- Traduce los errores (contraseña filtrada, débil, igual que la anterior, sesión caducada) a códigos que el cliente muestra en español.
- Registra `password_cambiada` en `auditoria_eventos`.

La marca solo se limpia en el mismo paso que cambia el hash. Si alguien llama a `updateUser` directamente desde el navegador, la contraseña cambia pero la marca sigue en true, que es el lado seguro. La política mínima de 12 se aplica en el servidor en esta vía.

Si apruebas esta alternativa, el resto del plan queda así:

## A. Migración (una, en drizzle/migrations/)
- `profiles`: `debe_cambiar_password boolean NOT NULL DEFAULT false`, `password_cambiada_en timestamptz NULL`.
- `CREATE OR REPLACE public.prevent_profile_self_escalation` conservando íntegras las nueve comprobaciones y añadiendo las dos columnas nuevas. Antes se lee la definición vigente y se copia literal.
- La RPC de admin `admin_forzar_cambio_password(_user_id uuid)` es SECURITY DEFINER, con `search_path=public` y `is_admin` obligatorio. Pone la marca a true. Se revoca de PUBLIC/anon y se concede a authenticated.
- Ampliar la RPC de listado de usuarios del panel para que devuelva las dos columnas, si el panel usa RPC. Si no, basta con la lectura actual.

## B. useAuth
- Nuevo estado `pide_password`, que solo escribe `resolverAcceso`. Cadena: sesión → perfil → equipo → contraseña → activo.
- `cargarDatosUsuario` lee `debe_cambiar_password`.
- El evento `PASSWORD_RECOVERY` activa una marca `recuperacionRef` y lanza la cadena diferida con setTimeout. Con esa marca, el resultado es `pide_password` aunque la columna sea false.
- Al guardar con éxito, se limpia `recuperacionRef` y se vuelve a lanzar `resolverAcceso`. La generación y los límites de 8 s no cambian.
- Se expone `pidePassword`.

## C. Página Establecer contraseña
- Componente `EstablecerPassword` con dos usos: pantalla bloqueante en App.tsx (con cerrar sesión) y ruta `/cuenta/contrasena` con enlace en el menú del usuario.
- Mínimo 12 caracteres, sin reglas de composición, las dos contraseñas deben coincidir, contador en vivo y el texto de ayuda indicado.
- Guarda llamando a la función `cambiar-password`. Errores siempre en español.
- En Auth.tsx se quita `minLength={6}`.

## D. Panel de usuarios
- «Restablecer contraseña» (con confirmación): `resetPasswordForEmail(email, { redirectTo: "https://crmrimosa.josecarlossobrino.com" })` más la RPC de forzar. Evento `password_restablecer_enviado`.
- «Forzar cambio de contraseña» (con confirmación): solo la RPC. Evento `password_cambio_forzado`.
- Junto a cada usuario: insignia «Cambio pendiente» y la fecha de `password_cambiada_en`.

## E. Auditoría
- Lista blanca de `registrar-evento`: se añaden `password_cambiada`, `password_restablecer_enviado` y `password_cambio_forzado`. Nada más.

## Fuera de alcance
Estado de usuario, bloqueo por intentos, acceso por nombre de usuario y 2FA. No se tocan `registrar_sesion` ni `verificar_sesion`.
