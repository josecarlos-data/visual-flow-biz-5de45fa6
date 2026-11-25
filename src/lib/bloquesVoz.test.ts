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

describe("dictado pendiente se aplica una sola vez", async () => {
  const { crearPendienteUnaVez, unirDictado } = await import("./bloquesVoz");
  // Simula la pantalla: botón y, a continuación, el cierre del diálogo (que añade si queda algo).
  const simular = (previo: string, nuevo: string, boton: "anadir" | "sustituir" | null) => {
    const p = crearPendienteUnaVez<string>();
    p.poner(nuevo);
    let texto = previo;
    const resolver = (modo: "anadir" | "sustituir") => { const v = p.consumir(); if (v !== null) texto = unirDictado(texto, v, modo); };
    if (boton) resolver(boton);
    resolver("anadir");
    return texto;
  };
  it("Añadir no duplica", () => expect(simular("hola", "nuevo", "anadir")).toBe(unirDictado("hola", "nuevo", "anadir")));
  it("Sustituir deja solo lo nuevo, una vez", () => expect(simular("hola", "nuevo", "sustituir")).toBe("nuevo"));
  it("Cerrar sin elegir añade una vez", () => expect(simular("hola", "nuevo", null)).toBe(unirDictado("hola", "nuevo", "anadir")));
});
