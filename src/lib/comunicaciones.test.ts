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

import { estadoSeguimiento, importePorComprador, tasaConversion } from "./comunicaciones";

describe("seguimiento de compras", () => {
  it("una compra cuenta aunque la ventana no esté completa", () => {
    expect(estadoSeguimiento(false, 120)).toBe("compro");
  });
  it("sin compra solo cuando la ventana está cubierta", () => {
    expect(estadoSeguimiento(true, 0)).toBe("sin_compra");
    expect(estadoSeguimiento(false, 0)).toBe("pendiente");
  });
  it("los abonos que dejan el importe en negativo no cuentan como compra", () => {
    expect(estadoSeguimiento(true, -50)).toBe("sin_compra");
  });
  it("conversión sobre clientes medibles", () => {
    expect(tasaConversion(3, 12)).toBe(25);
    expect(tasaConversion(0, 0)).toBeNull();
  });
  it("importe por comprador", () => {
    expect(importePorComprador(900, 3)).toBe(300);
    expect(importePorComprador(900, 0)).toBeNull();
  });
});
