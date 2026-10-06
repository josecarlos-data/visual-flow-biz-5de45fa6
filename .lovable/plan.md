# Pruebas del segundo factor con la cuenta de Bautista

## Dos puntos a resolver antes de empezar

1. **Credenciales.** El mensaje me llegó con los marcadores `<usuario de Bautista>` y `<contraseña temporal>`, no con los valores reales. Hay dos opciones:
   - **(a)** Me pegas el usuario y la contraseña reales. Los uso solo para entrar y no los repito en ningún sitio.
   - **(b)** No me pasas la contraseña y yo abro las sesiones de prueba de esa misma cuenta con la herramienta interna de pruebas. Te saldrá una tarjeta para aprobarlo. Con esta opción no se prueba el formulario de inicio de sesión, aunque sí toda la cadena que va detrás.
2. **Prueba 6 (reseteo).** La función de reseteo solo la puede usar un administrador, y la cuenta de pruebas es comercial. Para la prueba 6 tengo que llamarla como administrador con tu propia sesión. Esa llamada será la única excepción a «ninguna otra cuenta»: con tu sesión no se inicia sesión en la aplicación ni se cambia ningún dato tuyo. Si no lo autorizas, la prueba 6 la tendrías que hacer tú desde el panel.

## Preparación
- Pongo `exige_2fa = true` en la cuenta de pruebas.
- Los códigos de 6 dígitos los calculo yo a partir de la clave que da el alta, como haría la aplicación del móvil.

## Pruebas (navegador automatizado sobre la vista previa)
1. **Modo «desactivado»:** la cuenta entra, termina en la pantalla normal y lee clientes y ventas igual que antes.
2. **Modo «marcados», sin factor:** termina en la pantalla de alta (`alta_2fa`).
3. **Alta:** QR, clave y código correcto. Compruebo:
   - que el nivel de la sesión pasa a aal2;
   - que el perfil y los dashboards se recargan;
   - que el menú no queda vacío.
4. **Nuevo inicio de sesión:** termina en la pantalla de verificación (`pide_2fa`).
   - Un código erróneo falla y deja `2fa_fallido`.
   - El código correcto da aal2.
5. **Clientes según el nivel de la sesión:**
   - con la sesión aal1, la consulta a clientes devuelve 0 filas;
   - con la sesión aal2, devuelve los clientes de Bautista.
6. **Reseteo** con la función de servidor. Vuelvo a entrar con la cuenta de pruebas y compruebo que termina en `alta_2fa`.
7. **Rendimiento:** la misma consulta de ventas que la vez anterior, como Bautista, en modo «desactivado» y en modo «activo». Si «activo» es más de un 20 % más lento, me detengo y te lo explico.

## Limpieza obligatoria (también si alguna prueba falla)
- Borro todos los factores de la cuenta de pruebas.
- Dejo el modo en «desactivado» y `exige_2fa = false`.
- Compruebo las tres cosas con consultas antes de cerrar.

## Informe
- Resultado de cada prueba: correcto o fallo, con la evidencia (pantalla final, nivel de sesión, número de filas).
- Los dos tiempos de la prueba 7.
- Lista de los eventos de Auditoría generados durante la prueba: tipo, resultado y hora.
