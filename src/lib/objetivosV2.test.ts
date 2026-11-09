import { describe, expect, it } from "vitest";
import { metaDesde, siguienteTramo, tramoAlcanzado } from "./objetivosV2";

const tramos = [
  { pct: 100, etiqueta: "Objetivo", importe: 500 },
  { pct: 90, etiqueta: "Mínimo" },
  { pct: 110, etiqueta: "Excelente", importe: 1000 },
];

describe("objetivos v2", () => {
  it("tramo alcanzado es el más alto superado", () => {
    expect(tramoAlcanzado(tramos, 95)?.etiqueta).toBe("Mínimo");
    expect(tramoAlcanzado(tramos, 112)?.etiqueta).toBe("Excelente");
    expect(tramoAlcanzado(tramos, 80)).toBeNull();
  });
  it("lo que falta para el siguiente tramo", () => {
    const s = siguienteTramo(tramos, 95_000, 100_000);
    expect(s?.tramo.etiqueta).toBe("Objetivo");
    expect(s?.falta).toBe(5_000);
    expect(siguienteTramo(tramos, 120_000, 100_000)).toBeNull();
  });
  it("meta de grupo +5 % y excepción por importe", () => {
    expect(metaDesde("pct", 5, 100_000)).toBe(105_000);
    expect(metaDesde("importe", 80_000, 100_000)).toBe(80_000);
  });
});
