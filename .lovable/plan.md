# Avisos de seguridad por correo — construcción sin el secreto

Todo lo que no depende del secreto lo construyo yo. Las tres piezas que tocan el almacén de secretos de la base no puedo aplicarlas: la herramienta las rechaza. Van en un único bloque SQL que ejecutas tú, abajo, y que se puede revisar línea a línea. Ninguna clave aparece en el repositorio ni en la configuración de las funciones.

## 1. Bloque SQL que ejecutas tú (revísalo antes)

Hace tres cosas, en este orden:
- Crea el secreto. Su valor lo genera la base con `gen_random_bytes`.
- Crea la función que lo comprueba. Solo puede ejecutarla `service_role`.
- Programa la tarea. Se puede ejecutar más de una vez sin duplicar nada.

```sql
-- 1) Secreto: valor aleatorio generado por la base; no se escribe en ningún sitio.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'avisos_seguridad_token') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'avisos_seguridad_token',
      'Credencial de la tarea programada de avisos de seguridad');
  END IF;
END $$;

-- 2) Comprobación del secreto: solo service_role puede ejecutarla.
CREATE OR REPLACE FUNCTION public.avisos_token_valido(_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(_token) = 64 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'avisos_seguridad_token' AND decrypted_secret = _token), false)
$$;
REVOKE EXECUTE ON FUNCTION public.avisos_token_valido(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avisos_token_valido(text) TO service_role;

-- 3) Tarea programada: cada 10 minutos (minutos 3, 13, 23...).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisos-seguridad') THEN
    PERFORM cron.unschedule('avisos-seguridad');
  END IF;
END $$;
SELECT cron.schedule('avisos-seguridad', '3-59/10 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://mxsnnxnqzrdydcpzdqmu.supabase.co/functions/v1/avisos-seguridad',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-avisos-token', (SELECT decrypted_secret FROM vault.decrypted_secrets
                         WHERE name = 'avisos_seguridad_token')),
    body := '{}'::jsonb);
$cron$);
```

Un cambio respecto a tu punto 2: la función no devuelve el secreto, solo dice si el que recibe es correcto. Así el valor nunca sale de la base, ni siquiera hacia la función de avisos. Si prefieres que lo devuelva y que la comparación se haga en la función de avisos, la cambio.

El proyecto aparece en la URL. Eso no es secreto: es la misma dirección pública que ya usa la app.

## 2. Lo que construyo yo

**Migración única** (sin nada del almacén de secretos):
- Activa las extensiones `pg_cron` y `pg_net`.
- Crea la tabla `avisos_estado` con las columnas `categoria`, `cursor` y `ultimo_envio`, más una fila especial `_latido` para la última comprobación. Tiene RLS activado y ninguna política, con `REVOKE ALL` a `anon` y `authenticated` y `GRANT ALL` a `service_role`.
- Crea `avisos_resumen_panel()`, una función SECURITY DEFINER que solo devuelve datos si quien llama es administrador. Da la última comprobación y el último aviso registrado (fecha y resultado). El panel no puede leer la tabla directamente, así que lo lee a través de esta función.
- Añade los ajustes `avisos_seguridad_activo='true'` y `avisos_seguridad_email='info3@rimosa.com'` con `ON CONFLICT DO NOTHING`. No toco las políticas de `app_settings`.

**Límite por IP en un único sitio:** un fichero compartido con `LIMITE_IP = 20` y la ventana de 15 minutos. `iniciar-sesion` lo importa en lugar de su constante local y su comportamiento no cambia. Vuelvo a desplegar esa función.

**Función `avisos-seguridad`**, que se ejecuta en cada pasada:
1. Si la cabecera `x-avisos-token` falta o `avisos_token_valido` no devuelve verdadero, responde 401 y no hace nada más. En ese caso tampoco se guarda la hora de comprobación, y por eso el panel lo delata.
2. Guarda la hora de comprobación, aunque no haya nada que enviar.
3. Si el interruptor está apagado, termina.
4. Si está encendido, sigue el plan aprobado:
   - Agrupa por categoría los eventos nuevos.
   - Calcula el límite por IP con la constante compartida.
   - Envía como mucho un correo por categoría cada 30 minutos.
   - Registra cada aviso en Auditoría como `aviso_seguridad`: `ok`, `denegado` o `fallo`.
   - Avanza el cursor de la categoría solo si el correo se envió o el destinatario está dado de baja.
   - Si se cambia el destinatario, avisa también a la dirección anterior.

**Plantilla de correo** `aviso-seguridad`, en castellano, con un botón «Abrir Auditoría».

**Panel de seguridad**, en un nuevo bloque «Avisos por correo»:
- Interruptor para activar o desactivar los avisos, y campo del destinatario.
- «Último aviso enviado: …». Si el último aviso registrado es `denegado` o `fallo`, aparece en rojo «Los avisos no están llegando».
- «Última comprobación: hace X minutos». Si han pasado más de 30 minutos o nunca ha habido comprobación, aparece en rojo «Los avisos no se están comprobando».

**Otros cambios:**
- Auditoría: etiqueta y filtro para «Aviso de seguridad».
- En los correos de acceso, el nombre del remitente pasa a ser «CRM Rimosa». No cambia nada más de esa función.

## 3. Orden

1. Construyo y despliego todo lo anterior. Hasta que ejecutes el bloque, el panel mostrará en rojo «Los avisos no se están comprobando», que es lo esperado.
2. Ejecutas el bloque SQL.
3. En la siguiente pasada, como mucho 10 minutos después, compruebo que se ha guardado la hora de comprobación. Después hago la prueba: cambio un ajuste de seguridad inocuo, lo devuelvo a su valor, compruebo que llega un correo y que queda el evento `aviso_seguridad/ok`, y compruebo que una llamada sin el secreto recibe 401.

**Coste:** 144 ejecuciones al día. Cada una es una consulta corta, pero las comprobaciones frecuentes mantienen la base en marcha. Ese es el precio de que un aviso llegue con 10 minutos de retraso como máximo.
