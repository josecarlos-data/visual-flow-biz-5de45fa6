# Escribir o pegar el texto de la visita (NuevaVisita)

## Diagnóstico (HEAD 52b7581) y comparación con la propuesta

1. **La caja solo aparece tras dictar** — Confirmado. Se muestra con `{transcripcion && ...}`. Además hay un detalle que la propuesta no menciona: si el comercial borra todo el texto (p. ej. seleccionar todo para pegar encima), la caja desaparece en ese momento y pierde el foco. Hay que mantenerla abierta mientras esté en modo «Escribir».
2. **Crear bloques funciona con cualquier texto** — Confirmado: `pedirCrearBloques` → `analizarTranscripcion(transcripcion, …)`, sin depender del audio. El aviso «Has cambiado el texto», el borrador (incluye `transcripcion`) y el guardado (`transcripcion: transcripcion || null`) ya tratan el texto igual venga de donde venga. «Reanalizar» en Revisión usa la transcripción guardada: también sirve.
3. **Botón «Escribir» junto al micro, mismas condiciones** — De acuerdo: desactivado sin cliente, mientras se transcribe o se extrae.
4. **Misma caja vacía, foco y placeholder** — De acuerdo, sin campo nuevo.
5. **Dictar después → Añadir/Sustituir** — Ya ocurre: con texto en una visita efectiva, el dictado nuevo pregunta Añadir/Sustituir. Sin cambios.
6. **No efectivas: igual que el dictado** — Matiz importante: hoy la caja «Lo que he entendido» está dentro del bloque solo para visitas efectivas; en no efectivas el dictado va a **Observaciones** (siempre visible abajo). Por tanto, en no efectivas «Escribir» llevará el foco a Observaciones, sin abrir la caja ni crear bloques. Es el mismo comportamiento que el dictado, no un enfoque distinto.
7. **Misma posición en móvil y escritorio** — De acuerdo: fila centrada micro + botón, igual en ambos.
8. **Sin migraciones ni edge functions** — Confirmado, no hacen falta.

No veo necesario un enfoque distinto.

## Plan final (solo `src/pages/NuevaVisita.tsx`)

- Estado local `escribiendo` (no se guarda en el borrador: al recuperar un borrador con texto la caja ya aparece por tener texto).
- Botón `variant="outline"` con icono de lápiz y texto «Escribir» junto al `VoiceRecorder`, mismo `disabled`.
- Al pulsar:
  - Efectiva: `escribiendo = true`, se muestra la caja y se enfoca el Textarea (ref + `focus()` tras render, con scroll a la vista en móvil).
  - No efectiva: foco y scroll a Observaciones.
- La caja se muestra si `transcripcion || escribiendo`; placeholder «Escribe o pega lo que has hablado con el cliente»; el texto de ayuda y el botón Crear/Actualizar bloques siguen igual (desactivado con texto vacío).
- `escribiendo` vuelve a `false` al descartar borrador / reiniciar formulario, y al cambiar a no efectiva.
- Título de la caja: se mantiene «Lo que he entendido» si viene de dictado; si está vacía en modo escribir, mismo título (sin cambiar textos existentes) — salvo que prefieras «Texto de la visita».

## Pruebas
- Typecheck y tests existentes. Comprobación en navegador con sesión: elegir cliente, «Escribir», pegar texto, Crear bloques, ver bloques; luego dictado no se prueba (sin micrófono).
