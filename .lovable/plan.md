# Segundo factor TOTP

## Respuestas previas

1. **TOTP (enroll / challenge / verify).** El servicio de acceso lo trae activado por defecto. No veo ningún ajuste que lo apague y mis herramientas de configuración no tienen opción de MFA, ni para encenderlo ni para apagarlo. **No lo he confirmado en vivo:** hace falta una sesión de usuario real y una inscripción, y eso cambia datos. Por eso es el paso 0 del plan. Si falla, me detengo y te lo digo, sin alternativas propias.
2. **Claim `aal`.** Sí. Todos los JWT llevan `aal` (`aal1` o `aal2`) y `amr`, y en SQL se lee con `auth.jwt()->>'aal'`. Lo confirmo en el paso 0 decodificando un token real.
3. **Borrar factores de otro usuario.** Sí. Desde una función de servidor con la clave de servicio se usan `auth.admin.mfa.listFactors({ userId })` y `auth.admin.mfa.deleteFactor({ id, userId })`.

## Paso 0. Verificación (antes de tocar nada más)
Con la cuenta de pruebas que me indiques:
- inscribo un TOTP, compruebo `challenge` y `verify` y que el token pasa a `aal2`;
- después borro ese factor con la API de administración.

Si alguno de los tres puntos falla, me detengo.

## A. Migración (una, en drizzle/migrations)
1. Añadir `profiles.exige_2fa boolean NOT NULL DEFAULT false`. Recreo `prevent_profile_self_escalation` con una copia literal de la versión vigente (exención de service_role y admin, más las 18 comprobaciones) y una comprobación nueva para `exige_2fa`.
2. Fila `segundo_factor_modo = 'desactivado'` con `ON CONFLICT DO NOTHING`.
3. `requiere_2fa(_user_id)`: STABLE y SECURITY DEFINER, con `search_path=public`. Comprueba el rol directamente en `user_roles`, sin pasar por `is_admin`.
4. `sesion_cumple_2fa()`: STABLE y SECURITY DEFINER.
5. `is_approved` e `is_admin`: `CREATE OR REPLACE` con una copia literal y un único añadido: `AND (_user_id IS DISTINCT FROM auth.uid() OR (SELECT public.sesion_cumple_2fa()))`. Sin DROP y sin tocar GRANT.
6. Funciones nuevas: REVOKE de PUBLIC y anon, GRANT EXECUTE a authenticated.

Comprobaciones:
- `pg_get_functiondef` y `proacl` antes y después: solo cambia la línea añadida;
- con el modo en `desactivado`, la misma consulta devuelve lo mismo que antes para un usuario aprobado y para uno no aprobado.

## B. Cadena de acceso (useAuth)
- Estados nuevos `pide_2fa` y `alta_2fa`. Solo los escribe `resolverAcceso`.
- Orden: sesión -> perfil y estado -> segundo factor -> equipo -> contraseña -> activo. Se aplica igual en `PASSWORD_RECOVERY`, antes de la pantalla de nueva contraseña.
- Tras el perfil, llamada a `requiere_2fa` y `getAuthenticatorAssuranceLevel()`:
  - sin factor verificado: `alta_2fa`;
  - con factor y nivel `aal1`: `pide_2fa`;
  - con `aal2`: sigue adelante.

  Mismo control de generación y límite de 8 s por paso.
- Tras verificar o dar de alta, `refreshSession()` y se relanza `resolverAcceso`.
- Riesgo a revisar al construir: con una sesión `aal1`, la cadena debe poder leer el propio perfil y llamar a `requiere_2fa`. Si alguna policy del perfil depende de `is_approved(auth.uid())`, esa lectura fallaría con el modo activo. Leo las policies antes de migrar. Si alguna depende, me detengo y te lo explico.

## C. Pantallas bloqueantes (como la del código de alta)
- **Alta:** QR, clave para teclear a mano y campo de 6 dígitos. Texto: «Escanea el código con Microsoft Authenticator o Google Authenticator». Si había un factor sin verificar a medias, se borra antes de inscribir otro.
- **Verificación:** campo de 6 dígitos.
- Ambas con botón de cerrar sesión.
- Eventos `2fa_alta`, `2fa_verificado` y `2fa_fallido`, con sus etiquetas legibles en Auditoría.

## D. Panel de usuarios
- Por usuario:
  - interruptor «Exigir segundo factor». En administradores con el modo en `activo`, aparece marcado y deshabilitado, con la nota «obligatorio para administradores»;
  - estado «Configurado» o «Pendiente», obtenido de la nueva función de servidor (acción `estado`, que lista los factores verificados de cada usuario).
- «Restablecer segundo factor», con una confirmación que recuerda verificar la identidad de quien lo pide. Llama a la función de servidor `admin-segundo-factor`, que:
  - exige que quien llama sea admin y tenga una sesión `aal2`;
  - borra los factores del usuario;
  - registra `2fa_reseteado`.
- Selector global del modo, con advertencia. Bloquea el paso a `activo` si el administrador no tiene su propio factor verificado. Registra `cambio_config_seguridad`.

## Fuera de alcance
Códigos de recuperación, avisos por correo, `has_role`, `iniciar-sesion`, `registrar_sesion` y `verificar_sesion`.

## Necesito de ti
La cuenta de pruebas para el paso 0. El paso 0 también resuelve la tarea pendiente de comprobar el límite del servicio de autenticación.
