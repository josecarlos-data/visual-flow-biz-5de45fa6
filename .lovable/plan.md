# Crear usuarios desde el panel de Usuarios

Hoy el panel solo gestiona usuarios que ya existen; no hay forma de darlos de alta. Como el registro público está cerrado, el administrador será la única vía.

## Qué verá el administrador
- Botón **«Nuevo usuario»** arriba del panel de Usuarios.
- Formulario: nombre completo, correo, nombre de usuario (para el acceso por usuario), rol, delegación / código de comercial (si aplica), paneles a los que accede y una **contraseña temporal** (botón para generarla automáticamente, mínimo 12 caracteres).
- Al crear: el usuario queda **aprobado y activo**, con correo ya confirmado, y **obligado a cambiar la contraseña** en su primer acceso.
- Se muestra la contraseña temporal una sola vez con botón «Copiar» para entregársela.
- Queda registrado en Auditoría quién creó a quién.

## Reglas
- Solo administradores (con su segundo factor si está exigido) pueden crear usuarios; se comprueba en el servidor.
- Se rechazan correos o nombres de usuario repetidos con mensaje claro.
- Si algún paso falla tras crear la cuenta, se deshace para no dejar usuarios a medias.

## Detalles técnicos
- Nueva función de servidor `admin-crear-usuario` (JWT verificado): valida admin con `is_admin(auth.uid())` usando el token del llamante; con service role hace `auth.admin.createUser({email, password, email_confirm:true, user_metadata:{full_name}})`. El trigger `handle_new_user` crea el perfil; luego actualiza `profiles` (employee_code, delegacion, is_approved=true, estado='activo', debe_cambiar_password=true, username), inserta rol en `user_roles` y accesos en `user_dashboard_access`. Si falla, `auth.admin.deleteUser`. Eventos de auditoría por los triggers existentes más un `usuario_creado`.
- Validación de contraseña con el mismo mínimo de 12 y comprobación HIBP del servicio.
- Frontend: diálogo nuevo `CrearUsuarioDialog` en `AdminUsers.tsx`, recarga la lista al terminar.
- Sin cambios de tablas.
