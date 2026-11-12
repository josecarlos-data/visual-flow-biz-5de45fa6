import { describe, expect, it } from "vitest";
import { bloquesNoVozConDatos, reemplazarBloquesVoz, textoCambiado, unirDictado, vozEditadosQueSePierden, type BloqueConOrigen } from "./bloquesVoz";

const b = (id: string, origen: BloqueConOrigen["origen"], editado = false, valores: Record<string, string> = { a: "1" }) => ({ id, origen, editado, valores });

describe("bloquesVoz", () => {
  const actuales = [b("v1", "voz", true), b("v2", "voz"), b("d1", "documento"), b("m1", "manual")];
  it("actualizar sustituye solo los de voz y conserva documento y manuales", () => {
    const r = reemplazarBloquesVoz(actuales, [b("n1", "voz")]);
    expect(r.map((x) => x.id)).toEqual(["n1", "d1", "m1"]);
  });
  it("cuenta los de voz corregidos a mano que se perderían", () => {
    expect(vozEditadosQueSePierden(actuales)).toBe(1);
  });
  it("cuenta documento/manuales con datos; un manual vacío no cuenta", () => {
    expect(bloquesNoVozConDatos([...actuales, b("m2", "manual", false, { a: " " })])).toBe(2);
  });
  it("añadir y sustituir dictado", () => {
    expect(unirDictado("uno", "dos", "anadir")).toBe("uno\n\ndos");
    expect(unirDictado("uno", "dos", "sustituir")).toBe("dos");
    expect(unirDictado("", "dos", "anadir")).toBe("dos");
  });
  it("texto cambiado solo tras crear bloques", () => {
    expect(textoCambiado("hola", null)).toBe(false);
    expect(textoCambiado("hola ", "hola")).toBe(false);
    expect(textoCambiado("hola2", "hola")).toBe(true);
  });
});
