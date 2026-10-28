import { describe, expect, it } from "vitest";
import { bloqueadoPorPatron, componerMensaje, estadoVisible, PIE_OFERTA } from "./ofertas";

describe("ofertas", () => {
  it("una oferta publicada con fin pasado se ve como vencida", () => {
    expect(estadoVisible("publicada", "2026-01-10", new Date(2026, 0, 11))).toBe("vencida");
    expect(estadoVisible("publicada", "2026-01-10", new Date(2026, 0, 10))).toBe("publicada");
  });

  it("borrador y archivada no pasan a vencida", () => {
    expect(estadoVisible("archivada", "2020-01-01")).toBe("archivada");
    expect(estadoVisible("borrador", "2020-01-01")).toBe("borrador");
  });

  it("el patrón bloquea sin distinguir mayúsculas ni tildes", () => {
    expect(bloqueadoPorPatron("Prohibición de venta", ["PROHIBICION"])).toBe(true);
    expect(bloqueadoPorPatron("taller cerrado", ["CERRAD"])).toBe(true);
    expect(bloqueadoPorPatron("Solo contado", ["PROHIBICION", "CERRAD"])).toBe(false);
  });

  it("el mensaje siempre termina con el pie fijo y sustituye {contacto}", () => {
    const m = componerMensaje("Hola {contacto}, oferta", "Ana", "https://x/o/t");
    expect(m.startsWith("Hola Ana, oferta")).toBe(true);
    expect(m.endsWith(PIE_OFERTA)).toBe(true);
  });
});
