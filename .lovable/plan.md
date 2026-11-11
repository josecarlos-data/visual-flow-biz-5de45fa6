# Análisis IA del cliente: leer lo dictado en las visitas

## Problema (comprobado)
El apartado «ÚLTIMAS VISITAS» del informe solo usa los campos y observaciones de la cabecera de la visita. En las visitas de la app lo dictado vive en los bloques, así que el modelo no ve nada. Además, las etiquetas de campo se buscan solo por campo y se pisan entre plantillas.

## Cambios (solo el fichero del análisis del cliente)
1. Visitas: se siguen pidiendo las 8 últimas, añadiendo id, tipo, resultado y comercial.
2. Bloques: segunda consulta para esos ids (motivo, campos, validación, orden), hecha con la sesión del usuario para que manden las reglas de acceso. Orden por visita y orden del bloque.
3. Etiquetas por motivo + campo, y el nombre del motivo desde el catálogo de motivos (la consulta de etiquetas pasa a incluir el motivo; se añade la de nombres de motivo).
4. Formato por visita:
```text
  2026-11-05 · Cliente · Francisco Pérez
    - Seguimiento: Acuerdos: ... | Próxima acción: ...
  2026-10-20 · Llamada · Francisco Pérez · resultado: cliente_ausente
    Observaciones: ...
```
   Se omiten campos vacíos, claves que acaban en _nombre, rutas de adjuntos y «documentos». Bloques NO CORRECTO no se envían. Si no queda ningún bloque visible, se usan las observaciones como hoy.
5. Una frase nueva en las instrucciones: usar acuerdos, próximas acciones y ofertas pendientes de las últimas visitas para proponer qué retomar, y no volver a proponer lo que el cliente ya rechazó.

## No se toca
Esquema de salida, modelos, modo prueba, guardado del informe, resto de ficheros. Sin migraciones.

## Prueba
- Cliente con visitas de la app con bloques (candidatos: 5004, 10833, 1337).
- Generar el análisis en modo prueba (no guarda) con una sesión de prueba para confirmar que responde bien.
- Como el modo prueba no devuelve el texto enviado, el texto exacto de «ÚLTIMAS VISITAS» se obtiene ejecutando la misma función de formato con los datos de ese cliente en un script temporal fuera del proyecto, y se pega tal cual. Se indicará que ese script lee los datos sin las reglas de acceso del comercial.
- Despliegue de la función y comprobación de sus registros.
