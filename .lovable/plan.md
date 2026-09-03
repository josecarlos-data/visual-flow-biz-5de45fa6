# NuevaVisita.tsx: selector de Motivo arriba solo en bloques manuales

Cambio en un solo fichero: `src/pages/NuevaVisita.tsx`. Sin SQL, migraciones, edge functions ni otros componentes. No se crea ni modifica `roadmap.md` ni ningún otro fichero.

## Problema (confirmado en el código actual)

- El selector de Motivo se renderiza al final de cada bloque (`AccordionContent`, líneas 849-871): después de los campos de la zona A, del colapsable "Ver los otros N campos" y justo antes del botón "Quitar bloque".
- En un bloque manual, cambiar el motivo reordena los campos (se vacían `valores`/`meta` y se re-fija la partición de zonas), así que tener el selector al final obliga a bajar → cambiar → subir a rellenar.
- En un bloque extraído por voz el motivo lo decide la IA: subir el selector al principio convertiría un roce accidental en la pérdida de toda la extracción (el cambio de motivo vacía `valores` y `meta` sin deshacer). Ahí el selector se queda al final, protegido.

## Cambio 1 — Motivo arriba SOLO en bloques manuales

1. Dentro del `map` de bloques (junto a las derivadas de las líneas 776-781), extraer el div de las líneas 849-871 a una variable local, sin duplicar JSX ni lógica:

```tsx
const selectorMotivo = (
  <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Motivo</Label>
    <Select value={b.motivoKey} onValueChange={/* mismo onValueChange + limpieza de zonasBAbiertas */}>
      <SelectTrigger><SelectValue placeholder="Selecciona motivo" /></SelectTrigger>
      <SelectContent>
        {motivosActivos.map((m) => (
          <SelectItem key={m.key} value={m.key}>{m.nombre}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    {motivo?.descripcion && <p className="text-xs text-muted-foreground">{motivo.descripcion}</p>}
  </div>
);
```

2. En el JSX del bloque, una sola instancia en cada posición según `b.manual`:

```tsx
<div className="space-y-3">
  {b.manual && selectorMotivo}
  {atencion.length > 0 && (/* campos zona A */)}
  {otros.length > 0 && (/* Collapsible "Ver los otros N campos" */)}
  {!b.manual && selectorMotivo}
  {bloques.length > 1 && (/* Quitar bloque */)}
</div>
```

La extracción re-indenta de paso `value={b.motivoKey}` (hoy a columna 0 en la línea 852), que pasa a vivir dentro de `selectorMotivo`.

## Cambio 2 — Limpiar también zonasBAbiertas al cambiar de motivo

En el `onValueChange` del Select, junto a la limpieza existente de `zonaAFijada`, añadir:

```tsx
setZonasBAbiertas((prev) => {
  if (!(b.uid in prev)) return prev;
  const next = { ...prev };
  delete next[b.uid];
  return next;
});
```

Motivo: el efecto de las líneas 126-134 solo inicializa `zonasBAbiertas[b.uid]` si la clave no existe; sin borrarla, la zona B heredaría el estado abierto/cerrado del motivo anterior en vez de recalcularse con los campos del motivo nuevo.

## Cambio 3 — Restaurar la indentación

Devolver su indentación (solo espacios; contenido intacto) a las líneas que el build anterior dejó a columna 0, alineándolas con su línea hermana:

| Línea | Contenido | Indentación correcta |
|---|---|---|
| ~125 | `});` (cierre de `setBloquesAbiertos`) | 4 espacios |
| ~235 | `.filter((b) => motivoDe(b.motivo_key))` | 8 espacios (como el `.map` de la 236) |
| ~352 | `(c) => bloqueantes.has(...) || ...` | 6 espacios (argumento del `.filter` de `atencionDe`) |
| ~778 | `const hayResultado = Object.keys(b.valores).length > 0;` | 12 espacios (como `const estado` de la 777) |
| ~788 | `<div className="flex items-center gap-1.5">` | 20 espacios (hermana del `<span>` de la 787) |
| ~852 | `value={b.motivoKey}` | queda re-indentada dentro de `selectorMotivo` (Cambio 1) |

## Fuera de alcance

No se tocan: la lógica del `onValueChange` (sigue vaciando `valores`/`meta`), `atencionDe`, `zonaADe`, `otrosCamposDe`, `estadoDe`, el `AccordionTrigger`, el botón "Quitar bloque" (se queda al final en ambos casos), el layout responsive ni `CampoVisita.tsx`.

## Verificación

- Build y typecheck limpios.
- Bloque manual: el Motivo aparece arriba del todo; cambiarlo reordena los campos hacia abajo sin tener que subir y bajar.
- Bloque de voz: el Motivo sigue al final, debajo del colapsable.
- Al cambiar de motivo, la zona B del bloque se recalcula desde cero (queda borrada `zonasBAbiertas[uid]`).
- `git diff` no muestra cambios de indentación fuera de las líneas listadas.