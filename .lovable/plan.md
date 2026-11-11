# Observaciones en visitas de Gespromo con bloques vacíos

Solo cambia `supabase/functions/cliente-insights/index.ts` (función `formatearVisitas`). Sin migraciones.

## Comportamiento nuevo (solo filas que no son de la app)
1. Un bloque sin ningún campo con texto no se escribe (desaparece la línea con solo el nombre del motivo).
2. Si ninguna fila del grupo ha escrito un bloque con contenido, se añade debajo del grupo una única sección «Observaciones: …» con `observaciones` o, si está vacía, `observaciones_original` de cada fila, sin repetir textos iguales (comparación tras normalizar espacios), separados por « | ».
3. Si alguna fila del grupo tiene bloques con contenido, no se añaden observaciones de ese grupo (como hoy).
4. Visitas de la app: sin cambios (bloques como ahora y sus observaciones siempre).

Decisión: un bloque cuyo contenido se omite porque ya figura en PERFIL DEL TALLER cuenta como «con contenido» (no dispara observaciones), igual que hoy.

## Después
- Redesplegar `cliente-insights`.
- Pegar «ÚLTIMAS VISITAS» del cliente 10833 (vista sin reglas de acceso), comprobando el 21/09.
- Confirmar que solo ha cambiado ese fichero.
