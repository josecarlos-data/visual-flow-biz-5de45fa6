# NuevaVisita.tsx: zona A pegajosa y bloques manuales sin colapsable

Cambio en un solo fichero: `src/pages/NuevaVisita.tsx`. Sin SQL, migraciones, edge functions ni `CampoVisita.tsx`.

## Problema (confirmado en el código actual)

- `atencionDe(b)` (líneas 330-338) recalcula en cada render: un campo está en la zona A solo mientras está vacío (o con confianza baja). Al escribir el primer carácter, el campo sale de `atencionDe` y pasa a `otrosCamposDe`, que se renderiza dentro del `<Collapsible>`; React desmonta el input y lo remonta oculto: se pierde el foco al teclear la primera letra.
- `zonasBAbiertas[uid]` se fija una sola vez en el efecto (líneas 122-130) con `atencionDe(b).length === 0`; en un bloque manual con campos obligatorios vacíos la zona B nace cerrada y nunca se reabre sola.
- Los bloques creados a mano (`nuevoBloque`, líneas 33-38) y los extraídos por voz (líneas 221-226 y 680) no se distinguen en el estado, así que no hay forma de tratarlos distinto en el render.

## Cambio 1 — zona A pegajosa

**1. Nuevo estado.** Tras la línea 88 (`zonasBAbiertas`):

```ts
/** Claves de campo que ya entraron en la zona A: se quedan aunque dejen de estar vacías. */
const [zonaAFijada, setZonaAFijada] = useState<Record<string, string[]>>({});
```

**2. Unión en el efecto existente (líneas 114-131).** Añadir al final del mismo efecto, después del `setZonasBAbiertas`:

```ts
setZonaAFijada((prev) => {
  let cambiado = false;
  const next = { ...prev };
  for (const b of bloques) {
    const fijadas = next[b.uid] ?? [];
    const nuevas = atencionDe(b).map((c) => c.campo_key).filter((k) => !fijadas.includes(k));
    if (nuevas.length) {
      cambiado = true;
      next[b.uid] = [...fijadas, ...nuevas];
    }
  }
  return cambiado ? next : prev;
});
```

Solo añade, nunca quita. Si no hay claves nuevas devuelve `prev` (misma referencia) para no provocar un bucle de renders. El efecto no se re-ejecuta al cambiar `zonaAFijada` (depende solo de `[bloques]`), así que no hay bucle posible.

**3. Nueva función `zonaADe`.** Insertar entre `atencionDe` (termina en línea 338) y `otrosCamposDe` (línea 340):

```ts
/** Zona A: lo que atencionDe marca hoy más lo ya fijado para este bloque. */
const zonaADe = (b: BloqueForm): MotivoCampo[] => {
  const motivo = motivoDe(b.motivoKey);
  if (!motivo) return [];
  const fijadas = new Set(zonaAFijada[b.uid] ?? []);
  const enAtencion = new Set(atencionDe(b).map((c) => c.campo_key));
  return camposVisibles(motivo.campos).filter((c) => fijadas.has(c.campo_key) || enAtencion.has(c.campo_key));
};
```

`atencionDe` se deja intacta y en vivo: los badges "Faltan N" / "Listo" / "Revisar" y `estadoDe` siguen recalculándose con los valores actuales (no cambian).

**4. `otrosCamposDe` pasa a basarse en `zonaADe`** (líneas 340-345):

```ts
const otrosCamposDe = (b: BloqueForm): MotivoCampo[] => {
  const motivo = motivoDe(b.motivoKey);
  if (!motivo) return [];
  const zonaA = new Set(zonaADe(b).map((c) => c.campo_key));
  return camposVisibles(motivo.campos).filter((c) => !zonaA.has(c.campo_key));
};
```

**5. Limpiar al cambiar el motivo.** El `onValueChange` del Select de la línea 827 pasa a:

```tsx
onValueChange={(val) => {
  actualizarBloque(b.uid, { motivoKey: val, valores: {}, meta: {} });
  setZonaAFijada((prev) => {
    if (!(b.uid in prev)) return prev;
    const next = { ...prev };
    delete next[b.uid];
    return next;
  });
}}
```

## Cambio 2 — bloques manuales sin zonas

**1. Interfaz** (líneas 26-31): añadir el campo:

```ts
interface BloqueForm {
  uid: string;
  motivoKey: string;
  valores: Record<string, string>;
  meta: Meta;
  manual: boolean;
}
```

**2. `nuevoBloque()`** (líneas 33-38): añadir `manual: true,`.

**3. Extracción por voz** (objeto de las líneas 221-226 y el de la línea 680): añadir `manual: false,` en ambos.

No se deriva de `meta`: `responderRepregunta` (línea 291) construye con `{ ...bloque, ... }`, así que el flag se conserva aunque la repregunta añada `meta` a un bloque manual.

**4. Render** (líneas 753-755):

```tsx
const atencion = b.manual ? camposVisibles(motivo?.campos ?? []) : zonaADe(b);
const otros = b.manual ? [] : otrosCamposDe(b);
const zonaBAbierta = zonasBAbiertas[b.uid] ?? atencion.length === 0;
```

Con `otros = []` el bloque `<Collapsible>` "Ver los otros N campos" (líneas 799-821) no se renderiza: el bloque manual lista todos los campos en el orden de la plantilla dentro del mismo contenedor de la zona A (líneas 784-797). Cuando `b.manual === false` se mantiene exactamente el comportamiento actual de dos zonas.

**5. (Opcional, propuesta marcada) Etiqueta "IA".** En el badge de la línea 763, `{hayResultado && (` pasa a `{hayResultado && !b.manual && (`. Un bloque rellenado a mano no debe mostrar el icono "IA"; hoy en día lo muestra en cuanto tiene un valor, y con `manual` ya hay señal limpia para corregirlo. Se puede descartar sin afectar al resto.

## Fuera de alcance

No se tocan: lógica de guardado, `pendientesDe`, `bloqueantesDe`, `estadoDe`, la repregunta, el orden de las tarjetas, el layout responsive, `CampoVisita.tsx`, SQL, migraciones ni edge functions.

## Verificación

- Build y typecheck limpios: TypeScript obliga a cubrir `manual` en todos los sitios que construyen `BloqueForm` (los tres de este fichero).
- Manual: "Añadir bloque a mano" → todos los campos visibles en una sola lista sin colapsable; teclear en un campo de la zona A no pierde el foco (el input no se desmonta).
- Voz: bloque extraído conserva las dos zonas; al corregir un campo marcado como dudoso sigue en la zona A; la repregunta por voz no cambia `manual`.