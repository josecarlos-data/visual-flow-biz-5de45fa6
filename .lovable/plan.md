# NuevaVisita.tsx: selector de Motivo al principio del bloque

Cambio en un solo fichero: `src/pages/NuevaVisita.tsx`. Sin SQL, migraciones, edge functions ni otros componentes.

## Problema (confirmado en el código actual)

Dentro de cada bloque de visita (`AccordionContent`, líneas 808-886), el selector de Motivo se renderiza en último lugar (líneas 849-871): después de los campos de la zona A, del colapsable "Ver los otros N campos" y justo antes del botón "Quitar bloque".

Al cambiar el motivo se limpian `valores` y `meta` y se re-fija la partición de zonas, de modo que el bloque muestra más o menos campos según el motivo elegido. Con el selector al final, el flujo obliga a bajar → cambiar motivo → volver a subir a rellenar los campos.

## Cambio

Mover el bloque `<div className="space-y-2">` que contiene el `Label` "Motivo", el `Select` y la `descripcion` del motivo (líneas 849-871) para que sea el primer hijo del contenedor `<div className="space-y-3">` (línea 809), justo antes de los campos `atencion`.

Antes (estructura del `AccordionContent`):

```tsx
<div className="space-y-3">
  {atencion.length > 0 && (/* campos zona A */)}
  {otros.length > 0 && (/* Collapsible "Ver los otros N campos" */)}
  <div className="space-y-2">{/* Label Motivo + Select + descripcion */}</div>
  {bloques.length > 1 && (/* Quitar bloque */)}
</div>
```

Después:

```tsx
<div className="space-y-3">
  <div className="space-y-2">{/* Label Motivo + Select + descripcion */}</div>
  {atencion.length > 0 && (/* campos zona A */)}
  {otros.length > 0 && (/* Collapsible "Ver los otros N campos" */)}
  {bloques.length > 1 && (/* Quitar bloque */)}
</div>
```

El `onValueChange` del Select se traslada tal cual, sin tocar su lógica (vaciar `valores`/`meta` y limpiar `zonaAFijada[uid]`).

## Notas

- Aplica por igual a bloques manuales y extraídos por voz: es el mismo render compartido.
- El botón "Quitar bloque" se queda al final, donde está.
- El `AccordionTrigger` (título con el nombre del motivo y badges) no se toca.
- Sin cambios de comportamiento: cambiar el motivo sigue vaciando los valores y re-fijando la partición de zonas (efecto existente en `[bloques]`).

## Verificación

- Build y typecheck limpios.
- Manual en la vista previa: añadir bloque a mano → el motivo aparece arriba del todo; cambiarlo reordena los campos hacia abajo sin subir y bajar.