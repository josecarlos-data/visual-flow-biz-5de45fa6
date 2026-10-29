import { describe, expect, it } from "vitest";
import { agruparRecomendados, textoSaturacion } from "./recomendaciones";

describe("recomendaciones", () => {
  it("agrupa por grupo e ignora grupos desconocidos", () => {
    const g = agruparRecomendados([{ grupo: "habitual" }, { grupo: "potencial" }, { grupo: "x" }, { grupo: "habitual" }]);
    expect(g.habitual).toHaveLength(2);
    expect(g.recuperar).toHaveLength(0);
    expect(g.potencial).toHaveLength(1);
  });
  it("texto de saturación", () => {
    expect(textoSaturacion(null)).toBeNull();
    expect(textoSaturacion(0)).toBe("Recibió otra oferta hoy");
    expect(textoSaturacion(1)).toBe("Recibió otra oferta hace 1 día");
    expect(textoSaturacion(3)).toBe("Recibió otra oferta hace 3 días");
  });
});
