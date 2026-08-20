# Ajuste tarjeta "Top 10 clientes" en Ventas

## Objetivo
Enriquecer la tarjeta de clientes principales del panel de ventas (`src/pages/Ventas.tsx`) mostrando el peso relativo de cada cliente sobre la cartera total del año, sin añadir consultas ni tocar backend.

## Cambios a aplicar

### 1. Denominador
Usar `kpiActual` que ya existe en el componente (`kpis.find(k => k.anio === anioActual)`). El total de cartera es `kpiActual.importe`. No se hará ninguna llamada nueva ni se modificará SQL/RPC.

### 2. Acumulado en cabecera
- Importar `CardDescription` desde `@/components/ui/card`.
- Bajo el `CardTitle` de la tarjeta, añadir un `CardDescription`.
- Texto: "Estos N clientes representan el X,Y % de tu cartera".
- N = número real de clientes mostrados en `topClientes`.
- X,Y = `sum(topClientes.map(c => c.importe)) / kpiActual.importe * 100`, con un decimal y coma decimal española.
- Solo se muestra si `kpiActual` existe y `kpiActual.importe > 0`.

### 3. Porcentaje individual
En cada fila, dentro del bloque derecho (debajo del importe), añadir una segunda línea:
- Texto: "X,Y % de cartera".
- Clases: `text-xs text-muted-foreground`.
- Obligatorio incluir la palabra "cartera" para distinguirlo del porcentaje de margen que ya aparece cuando `verMargen` es true.
- Solo se muestra si `kpiActual` existe y `kpiActual.importe > 0`.

### 4. Formato
- Un decimal.
- Separador decimal español (coma).
- Espacio antes del símbolo `%`.
- Ejemplo: "12,4 % de cartera".

### 5. Casos límite
- Si `kpiActual` es `undefined` o `kpiActual.importe <= 0`, no se muestra ni el acumulado ni los porcentajes individuales; la tarjeta queda exactamente como está hoy.
- Nunca dividir por cero ni renderizar `NaN`/`Infinity`.

## Ficheros afectados
- `src/pages/Ventas.tsx` (único fichero, cambios frontend aislados).

## No se toca
- SQL, RPCs, Edge Functions, RLS, hooks, otros componentes ni los enlaces/parámetros `?volver=` existentes.
