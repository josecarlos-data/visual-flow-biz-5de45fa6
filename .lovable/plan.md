# Línea de contexto comercial en las paradas de Agenda

## Objetivo

Añadir a cada parada de la Agenda una línea de contexto comercial (días sin comprar, volumen del año en curso y variación) usando únicamente datos que ya devuelve `useClientes()`. Se modifica **solo** `src/pages/Agenda.tsx`; sin migraciones, funciones SQL ni hooks nuevos.

## Cambios en src/pages/Agenda.tsx

1. **Import** — añadir `import { eur, num } from "@/lib/format";` (el fichero existe y Agenda aún no lo usa).

2. **`useClientes(false)`** (línea 37) — para que las paradas de clientes inactivos también encuentren su nombre y sus datos.

3. **`clienteMap`** (líneas 52-56) — ampliar el tipo del mapa para guardar también `importe_actual: number`, `importe_anterior: number` y `ultima_compra: string | null`, ya presentes en la respuesta de `clientes_visibles`.

4. **Helper `diasDesde(fecha: string | null): number | null`** — días transcurridos desde `ultima_compra` hasta hoy (comparando a medianoche local); devuelve `null` si la fecha es `null` y `0` si fuera futura. Se coloca junto a `addDays`.

5. **Línea de contexto comercial** — debajo de la línea de localidad, **fuera** del `<Link>` que envuelve nombre y localidad, dentro del div `min-w-0 flex-1`, y **solo si `clienteMap` tiene el código** (`c` definido):

   - **Días sin comprar**: `"{n} días sin comprar"` (singular `"1 día"`), con la clase `font-medium text-destructive` si `> 90` y `text-muted-foreground` en caso contrario (mismo criterio que ClienteDetalle.tsx línea 454). Si `ultima_compra` es `null`: texto `"Sin compras"`.
   - **Volumen**: `eur(importe_actual)` (0 decimales, formato es-ES).
   - **Variación** frente a `importe_anterior` en porcentaje con signo (`+8,4 %` / `-2,1 %`, 1 decimal). Si `importe_anterior` es `0` o `null`, **no** se calcula (evitar división por cero) y se muestra `"Nuevo"`. Positiva → `text-primary` (verde corporativo del tema); negativa → `text-destructive`; cero → `text-muted-foreground`.
   - Separados por `" · "`, con `flex flex-wrap`, todo en `text-xs`, sin iconos nuevos.

6. **Sin cambios** en la maquetación existente, el orden de los elementos ni la columna derecha de acciones; sin clases `order-*`.

## Notas técnicas

- Verde/rojo se implementan con los tokens semánticos del tema (`--primary` = turquesa/verde corporativo, `--destructive` = rojo), igual que en el KPI de variación de ClienteDetalle, sin colores hardcodeados.
- El texto de "días sin comprar" replica el formato de ClienteDetalle (`num(n)` + "día"/"días").
- Orden visual de la línea: días sin comprar · volumen · variación, con wrap en móvil.