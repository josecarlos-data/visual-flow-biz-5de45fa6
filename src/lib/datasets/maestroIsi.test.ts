import { describe, it, expect } from "vitest";
import { datev, timev } from "./maestroIsi";

describe("fechas del Maestro ISI en hora local", () => {
  it("una fecha a medianoche local no pasa al día anterior", () => {
    expect(datev(new Date(2025, 0, 1, 0, 0, 0))).toBe("2025-01-01");
  });
  it("el texto dd/mm/aaaa se conserva", () => {
    expect(datev("01/01/2024")).toBe("2024-01-01");
  });
  it("la hora se toma en hora local", () => {
    expect(timev(new Date(1899, 11, 30, 8, 30, 0))).toBe("08:30:00");
  });
});
