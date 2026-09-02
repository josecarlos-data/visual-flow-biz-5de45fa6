# Evitar comparaciones engañosas de año en curso en el análisis IA

Solo `supabase/functions/cliente-insights/index.ts`. Sin migraciones ni cambios de frontend.

## 1. Etiquetar los años en la lista de ventas

En el bloque "VENTAS POR AÑO (EUR)", cada año se marca como completo o parcial comparando con el año natural de `hoyLocal`:

```text
VENTAS POR AÑO (EUR):
  2024 (año completo): 247.371 EUR
  2025 (año completo): 290.478 EUR
  2026 (parcial, hasta 01/09): 184.914 EUR
```

El "hasta" es la fecha local de hoy en formato DD/MM (se reutiliza el helper `ddmm` ya existente sobre `hoyIso`). Importes con `eur0` (separador de miles es-ES).

## 2. Bloque COMPARACIÓN VÁLIDA

Justo debajo de la lista, y solo si `kpis.importe_anio_anterior_ytd` viene informado y es distinto de 0:

```text
COMPARACIÓN VÁLIDA (mismo periodo del año anterior):
  2025 hasta 01/09: 201.640 EUR  ·  2026 hasta 01/09: 184.914 EUR  ·  -8,3 %
```

- Año en curso: `kpis.importe_anio_actual`; año anterior mismo periodo: `kpis.importe_anio_anterior_ytd`.
- Porcentaje calculado en la función: `(actual - ytd) / ytd * 100`, un decimal, formato es-ES, con signo.
- Si `importe_anio_anterior_ytd` es null o 0, o no hay registro de KPIs, se omite el bloque entero (nunca división por cero).

## 3. Regla en el system prompt

Se añade al final del mensaje de sistema, sin quitar nada de lo actual:

"El año en curso está incompleto. NUNCA compares su importe con el total de un año cerrado ni presentes esa diferencia como una caída o una subida. Para cualquier afirmación sobre la evolución anual usa exclusivamente el bloque COMPARACIÓN VÁLIDA. Si ese bloque no aparece, no afirmes nada sobre la tendencia anual."

## 4. Revisión del resto del prompt

Se revisa el resto de instrucciones y del contexto por si alguna invita a comparar años completos con el año en curso. La única frase con riesgo hoy es la de referencias caídas, que se refiere a "últimos 12 meses vs. 12 anteriores" (comparación ya homogénea) y se deja como está; si al revisar aparece algo ambiguo, se ajusta la redacción para acotarlo a esa ventana de 12 meses.

## Fuera de alcance

No se toca el modelo, el bloque de productos, el perfil, la situación ni el saneado de la respuesta.
