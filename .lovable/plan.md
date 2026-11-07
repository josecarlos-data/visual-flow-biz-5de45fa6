# Limpieza de pruebas de revisión antes de publicar

Una sola migración (0033) con ids concretos. Al principio comprueba los recuentos esperados; si alguno no coincide, falla sin tocar nada. Al final, prueba con identidades simuladas en una transacción que se deshace.

## Lo que se escapaba (revisado en los datos)

1. **Son 7 mensajes con autor, no 6.** Hay un «ok» tuyo en EDUARDO JAREÑO GOMEZ (06/11 15:09) escrito después de mi listado. Es probablemente uno de los 3 avisos sin leer de Bautista.
2. **«Hoy» es el 06/11, no el 07/11.** Todas tus pruebas son del 06/11. Si se filtrara por la fecha del día, no saldría nada. Por eso se usan ids concretos.
3. **Ninguna nota de prueba está en un bloque de Gespromo.** No hay que restaurar nada desde «Gespromo (importado)».
4. **Hay dos cuentas «Fran».** Francisco Martinez (director, la real) validó CALEROTRUCKS 970ae290. La cuenta «Malaga», con usuario `fran` y rol director, hizo pruebas el 06/11 en TALLERES PEREZ GOMEZ y CALEROTRUCKS 10fea99d. El punto 3 de Claude («cualquier validación en visitas de noviembre») y el punto 4 («no tocar las de otros usuarios») chocan en estas visitas. Abajo lo separo para que decidas.
5. **Validaciones de prueba de octubre (16/10).** Las hiciste con tu usuario y van junto a las notas antiguas. No cuentan para el KPI de noviembre y ya están dadas por leídas, así que no generan avisos. Propongo **no tocarlas** salvo la nota (punto B). Dime si también quieres pasarlas a Pendiente.
6. **Lecturas:** las de prueba no hacen falta tocarlas. Después de la limpieza no queda nada nuevo que leer. Las lecturas de Bautista se quedan.
7. **Auditoría:** la limpieza dejará eventos de cambio en Auditoría como «sistema». Es lo esperado y no se borra nada de Auditoría.
8. **Revisiones antiguas en Gespromo:** 2 visitas y 3 bloques revisados en agosto con usuarios de la app. No se tocan; solo te aviso.

## A. Mensajes que se borran (7)

| Visita | Cliente | Comercial | Autor | Texto | id |
|---|---|---|---|---|---|
| 554685af (06/11) | EDUARDO JAREÑO GOMEZ | Bautista | Bautista | porque me pones esto? | 80109dd0-8b05-4708-8b2c-fd1ef2ce5612 |
| 554685af | EDUARDO JAREÑO GOMEZ | Bautista | Bautista | hola | 38aa83e5-cb9d-45c7-9972-7c6b111aed66 |
| 554685af | EDUARDO JAREÑO GOMEZ | Bautista | José Carlos | Vaya mensaje | 02ee9a74-2fcb-4854-a3b1-3a422620cf7d |
| 554685af | EDUARDO JAREÑO GOMEZ | Bautista | Bautista | que pasa | bb3c32da-5e3e-43f0-9400-af2cbe2feb40 |
| 554685af | EDUARDO JAREÑO GOMEZ | Bautista | José Carlos | ok | fb9f193e-f1bc-4e57-8099-37b4a88a94c7 |
| 970ae290 (06/11) | CALEROTRUCKS ENGINEERING | Rafael | José Carlos | Hola | 012d1de7-ba73-4d9a-83c0-64e82cdaef32 |
| b610c146 (27/08) | ELECTROMECANICA LA LOMA | Bautista | Bautista | JAOOSA | 91f2e859-e819-4b86-a7c8-8f25941c4e77 |

## B. Notas antiguas que se vacían (todas con tu usuario)

Bloques:
| Bloque id | Visita | Cliente | Comercial | Nota actual |
|---|---|---|---|---|
| 113036b4-a4ac-47b9-92af-f959e619fe8a | d861960d (09/10) | TRANS LOYPE | Bautista | Lo has verificado con administracion? |
| 57865c2a-0733-47fb-b2df-7ae381b3b5e2 | 6cb353b5 (03/09) | PERFECT CAR JAEN | Bautista | apruebo bloque pero no visita |
| 7efc4f3e-2339-4ee1-b32e-a421845db261 | f3f74247 (20/10) | TRANS-ASISTENCIA DE LA CHICA | Bautista | Esto no se hace asi |
| b067a3d2-57d5-4470-ab0a-dc0f2be30c1c | f3f74247 | TRANS-ASISTENCIA DE LA CHICA | Bautista | Haces contraorfeta? |
| cea9192e-15d9-4e76-9dd6-89e8dcedcec3 | 10fea99d (06/11) | CALEROTRUCKS | Rafael | HEMOS TENIDO OPCIÓN A CONTRAOFERTA ?? |
| 21954013-fbab-4aae-a7a6-b0254c52c8f6 | 554685af (06/11) | EDUARDO JAREÑO GOMEZ | Bautista | te parece esto correcto??? |
| c7118b91-0684-4c24-8336-a5636b77329f | 06b6de26 (06/11) | TALLERES RAMISUR | Rafael | DE acuerdo falta algo |
| 1b6e91fc-908f-42d2-8998-c2a7f6d44592 | 9152137f (09/10) | EDUARDO JAREÑO GOMEZ | Bautista | Lo miramos |
| 252a50c9-b795-4c4f-8494-186e3a3d458e | b610c146 (27/08) | ELECTROMECANICA LA LOMA | Bautista | Vale |
| 98a757d1-e683-4309-9544-45714db9ea81 | b610c146 | ELECTROMECANICA LA LOMA | Bautista | No lo veo |
| cedbece3-ff1c-4839-bc67-26d6b3315851 | b610c146 | ELECTROMECANICA LA LOMA | Bautista | Ok |

Visitas (nota de la visita):
| Visita id | Cliente | Comercial | Nota actual |
|---|---|---|---|
| d861960d-4112-40fb-bb31-c9e4a72b918a | TRANS LOYPE (09/10) | Bautista | Lo has verificado con administracion? |
| 6cb353b5-b102-418c-a694-54ed0bfadfc3 | PERFECT CAR JAEN (03/09) | Bautista | apruebo bloque pero no visita |
| 9e91d838-9331-4841-84cf-010fc722b888 | TRANS-ASISTENCIA DE LA CHICA (16/10) | Bautista | Puede ser |

En las 9 notas de la app, la base tiene 5 textos distintos (2 en bloque y 2 en visita en TRANS LOYPE y PERFECT CAR), más «Haces contraorfeta?», que ya está arriba. Las otras dos «Prueba» son de la cuenta Malaga (punto D).

## C. Validaciones con tu usuario el 06/11 que vuelven a Pendiente (sin revisor ni fecha)

| id | Tipo | Cliente (fecha) | Comercial | Actual |
|---|---|---|---|---|
| 7efc4f3e-… | bloque | TRANS-ASISTENCIA (20/10) | Bautista | CORRECTO |
| efb8aa2a-02c5-4d80-bb1e-0e84289c9d20 | bloque | TRANS-ASISTENCIA (20/10) | Bautista | NO CORRECTO |
| b067a3d2-… | bloque | TRANS-ASISTENCIA (20/10) | Bautista | CORRECTO |
| 1b6e91fc-… | bloque | EDUARDO JAREÑO (09/10) | Bautista | NO CORRECTO |
| 252a50c9-… | bloque | LA LOMA (27/08) | Bautista | CORRECTO |
| 98a757d1-… | bloque | LA LOMA (27/08) | Bautista | NO CORRECTO |
| cedbece3-… | bloque | LA LOMA (27/08) | Bautista | NO CORRECTO |
| cea9192e-… | bloque | CALEROTRUCKS 10fea99d (06/11) | Rafael | pendiente (solo se quita revisor/fecha) |
| 21954013-… | bloque | EDUARDO JAREÑO (06/11) | Bautista | pendiente (solo revisor/fecha) |
| c7118b91-… | bloque | TALLERES RAMISUR (06/11) | Rafael | pendiente (solo revisor/fecha) |
| 9e91d838-… | visita sin bloques | TRANS-ASISTENCIA (16/10) | Bautista | CORRECTO → pendiente |

El trigger recalcula la cabecera de f3f74247, 9152137f y b610c146, que pasan a Pendiente.

## D. Validaciones de otros usuarios: decides tú

| id | Tipo | Cliente (fecha) | Comercial | Quién | Actual / nota |
|---|---|---|---|---|---|
| 511c71ee-96e1-4d4e-bd09-60c739727142 | bloque | CALEROTRUCKS 970ae290 (06/11) | Rafael | Francisco Martinez | CORRECTO / «El embrague lo tiene almacen MALAGA ?? NOTA REVISION» |
| 970ae290-140b-458c-bfb2-92bca8c1ec75 | visita | CALEROTRUCKS (06/11) | Rafael | Francisco Martinez | pendiente con revisor / misma nota |
| 2bc3edb7-a0cc-450d-9191-c1865e7c8a49 | bloque | TALLERES PEREZ GOMEZ (05/11) | Jose Moleon | cuenta Malaga (`fran`) | CORRECTO / «Prueba» |
| 74b3f838-ae31-4880-b717-787ce9e022dc | bloque | TALLERES PEREZ GOMEZ (05/11) | Jose Moleon | cuenta Malaga | CORRECTO / «Prueba» |
| 24c556ba-775e-49b6-88f6-0564d2bce918 | visita | TALLERES PEREZ GOMEZ (05/11) | Jose Moleon | cuenta Malaga | CORRECTO / «Prueba» |
| 10fea99d-9fa7-4c09-b635-e4f7a7312823 | visita | CALEROTRUCKS (06/11) | Rafael | cuenta Malaga | pendiente con revisor / «HEMOS TENIDO OPCIÓN A CONTRAOFERTA ??» |

Mi propuesta: tú incluiste CALEROTRUCKS 970ae290 en el punto 3, así que esas dos filas de Francisco Martinez vuelven a Pendiente y se vacía su nota. Las cuatro de la cuenta Malaga parecen pruebas («Prueba»): también vuelven a Pendiente y se vacía la nota. Así TALLERES PEREZ GOMEZ deja de contar en el KPI de noviembre. Si alguna es real, dime cuál y la quito de la migración.

## E. Comprobación final (se deshace)

Simulo a Bautista, Rafael, Jose Moleon, José Carlos, Francisco Martinez y Malaga. Ninguno debe tener avisos sin leer ni respuestas nuevas por estas visitas. No debe quedar ninguna visita de noviembre validada por pruebas. Te doy la lista de lo que cambió, con el antes y el después.

## Detalles técnicos
- La migración empieza con un bloque que cuenta los ids esperados con su valor actual (7 mensajes, 11 + 3 notas, etc.). Si algo no cuadra, lanza un error y no toca nada.
- Pasa a pendiente con `revisado_por/revisado_en = NULL` y `nota_revision = NULL`. Primero los bloques, para que el trigger recalcule la visita. Después las visitas sin bloques o con revisor directo.
- No se tocan las lecturas, Auditoría ni los 1.312 mensajes importados.
