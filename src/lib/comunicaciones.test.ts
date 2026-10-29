import { describe, expect, it } from "vitest";
import { diferenciaFrenteControl, variacionPct, ventanaMedible } from "./comunicaciones";

describe("comunicaciones", () => {
  it("la ventana de 30 días solo es medible si el corte la cubre", () => {
    expect(ventanaMedible("2026-09-01T10:00:00Z", "2026-10-01")).toBe(true);
    expect(ventanaMedible("2026-09-01T10:00:00Z", "2026-09-30")).toBe(false);
  });
  it("variación sin base es nula", () => {
    expect(variacionPct(0, 100)).toBeNull();
    expect(variacionPct(100, 150)).toBe(50);
  });
  it("compara con el grupo de control en puntos", () => {
    expect(diferenciaFrenteControl(100, 150, 1000, 1100)).toBe(40);
  });
});
