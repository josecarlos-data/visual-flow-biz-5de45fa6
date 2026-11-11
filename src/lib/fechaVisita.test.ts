import { describe, expect, it } from "vitest";
import { hoyMadrid, limitesFechaVisita, pideUbicacion, parseDiasAtras } from "./fechaVisita";

// 23:30 UTC del 10/11 ya es 11/11 en Madrid (UTC+1).
const noche = new Date("2026-11-10T23:30:00Z");

describe("fechaVisita", () => {
  it("hoy se calcula en hora de Madrid", () => {
    expect(hoyMadrid(noche)).toBe("2026-11-11");
  });
  it("comercial: de hoy a 7 días atrás", () => {
    expect(limitesFechaVisita(7, false, noche)).toEqual({ min: "2026-11-04", max: "2026-11-11" });
  });
  it("admin sin límites", () => {
    expect(limitesFechaVisita(7, true, noche)).toEqual({ min: undefined, max: undefined });
  });
  it("ubicación solo hoy y no en llamadas", () => {
    expect(pideUbicacion("cliente", "2026-11-11", noche)).toBe(true);
    expect(pideUbicacion("llamada", "2026-11-11", noche)).toBe(false);
    expect(pideUbicacion("cliente", "2026-11-10", noche)).toBe(false);
  });
  it("ajuste ausente o no válido vale 7", () => {
    expect(parseDiasAtras(undefined)).toBe(7);
    expect(parseDiasAtras("abc")).toBe(7);
    expect(parseDiasAtras("3")).toBe(3);
  });
});
