# Mejorar legibilidad de Resumen en ClienteDetalle

## Objetivo
Ajustar la pestaña **Resumen** de `src/pages/ClienteDetalle.tsx` para que en móvil se lean completos los datos de ficha, los teléfonos/email sean accionables, y los gráficos horizontales "Top familias" / "Top marcas" muestren todas las categorías sin desperdiciar ancho.

## Alcance
- Único fichero modificado: `src/pages/ClienteDetalle.tsx`.
- Sin migraciones, sin cambios en `supabase/`, `package.json`, hooks, RPCs ni RLS.
- No tocar las pestañas Visitas, Productos, Documentos, Perfil ni Análisis IA.
- No tocar la serie mensual ni el gráfico por año, ya corregidos.
- No cambiar el tipo de gráfico: barras horizontales.

## Cambios

### Bloque 1 — Datos de ficha

#### 1.1 Extender el componente `Dato` con multilínea
En la función `Dato` (línea ~60):

- Añadir prop opcional `multilinea?: boolean`.
- Si `multilinea === true`, aplicar `break-words` en lugar de `truncate`.
- En el modo truncado por defecto, añadir `title={String(value)}` al `<p>` del valor, solo cuando `value` sea `string` o `number`.

#### 1.2 Marcar campos como multilínea
Aplicar `multilinea` a los `Dato` de:

- Razón social
- Dirección
- Población
- Alta
- Comercial
- Web
- Persona de contacto
- Email

#### 1.3 Tramos rappel como lista propia
En la ficha de cliente (línea ~660):

- Eliminar `<Dato label="Tramos rappel" value={cliente.tramos_rappel} />`.
- Añadir un bloque propio que ocupe toda la fila:
  ```
  <div className="col-span-2 md:col-span-3 lg:col-span-4">
    <p className="text-xs text-muted-foreground">Tramos rappel</p>
    ...
  </div>
  ```
- Dividir `cliente.tramos_rappel` por `"|"`, hacer `trim()` y descartar vacíos.
- Si el resultado es exactamente un elemento, renderizarlo como `<p className="text-sm break-words">{tramo}</p>`.
- Si hay varios elementos, renderizar cada uno como `<span className="inline-block rounded-md border px-2 py-0.5 text-xs">` dentro de un contenedor `<div className="mt-1 flex flex-wrap gap-1">`.
- Si `cliente.tramos_rappel` es `null` o vacío, no renderizar el bloque.

#### 1.4 Teléfono y email como enlaces accionables
Para los campos Teléfono, Teléfono 2 y Email, envolver el valor en un enlace:

- Teléfonos: `<a href={`tel:${valor.replace(/\s/g, "")}`} className="text-primary underline underline-offset-2">{valor}</a>`
- Email: `<a href={`mailto:${valor}`} className="text-primary underline underline-offset-2">{valor}</a>`

Pasarlos como `value` (ReactNode) al componente `Dato`.
No modificar el resto de campos.

### Bloque 2 — Top familias / Top marcas

Ambos gráficos comparten el mismo bloque renderizado con el array:
```
{ title: "Top familias", rows: topFamilias },
{ title: "Top marcas", rows: topMarcas },
```

Aplicar a ambos:

#### 2.1 Reducir margen izquierdo y ancho del eje Y
- Cambiar `margin={{ top: 4, right: 16, left: 8, bottom: 0 }}` a `margin={{ top: 4, right: 16, left: 0, bottom: 0 }}`.
- Cambiar `<YAxis ... width={120}>` a `<YAxis ... width={72}>`.

#### 2.2 Forzar todas las etiquetas del eje Y
- Añadir `interval={0}` y `tick={{ fontSize: 10 }}` al `<YAxis>`.

#### 2.3 Ajustar altura del CardContent
- Si las etiquetas quedan cortadas con la altura actual, subir `CardContent className="h-72"` a `CardContent className="h-80"`.

## Verificación

1. `tsgo` sin errores y build limpia.
2. En móvil a 360 px, los campos marcados como multilínea se leen completos sin truncarse.
3. El bloque "Tramos rappel" se renderiza como chips o texto plano, ocupando toda la fila, y desaparece cuando el campo está vacío.
4. Tocar el teléfono o el email abre la app de llamada o correo correspondiente.
5. En "Top familias" y "Top marcas" se ven todas las categorías y las barras arrancan más a la izquierda que antes.
