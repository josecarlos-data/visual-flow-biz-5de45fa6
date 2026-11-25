# Fase 4.7: ejemplo y contraejemplo de competencia

## Cambio (solo `supabase/functions/_shared/visita-voz-prompt.ts`)

La regla no cambia. Justo detrás de la regla de COMPETENCIA añado dos ejemplos juntos, para que se vea que lo que decide es el precio:

- «compran las baterías a Autorecambios Alboran, la de 240 AH a 194,70» => bloque competencia, porque hay precio del competidor.
- «el aceite lo compran a CEPSA» => sin bloque; va a informacion_potencial, porque no hay ningún dato de comparación.

## Banco

- Repito el banco completo con fase4.7, 5 veces por caso, con el mismo modelo de extracción (GPT-5.6 Luna) y el verificador con conteo exacto y motivos prohibidos.
- Fase4.7 se da por buena solo si se cumplen las cuatro condiciones:
  - «3 baterías» saca exactamente 3 bloques de competencia en las 5 ejecuciones.
  - El caso de Rafael saca 0 bloques de competencia en las 5 ejecuciones.
  - Icer no baja de 5/5.
  - Los 8 casos cortos siguen en 40/40.
- Te doy la tabla por caso y el tiempo medio, comparados con la ejecución anterior.

## Fuera del alcance

Sin desplegar, sin migraciones y sin otros cambios en las reglas.
