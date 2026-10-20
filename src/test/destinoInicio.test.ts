import { describe, it, expect } from "vitest";
import { destinoInicio } from "@/lib/destinoInicio";

describe("destinoInicio", () => {
  it("quien tiene Ventas entra en Ventas aunque no sea el primero", () => {
    expect(destinoInicio([{ key: "clientes", route: "/clientes" }, { key: "ventas", route: "/" }])).toBe("/");
  });
  it("sin Ventas, va al primer panel permitido", () => {
    expect(destinoInicio([{ key: "objetivos", route: "/objetivos" }, { key: "agenda", route: "/agenda" }])).toBe("/objetivos");
  });
  it("sin paneles, no hay destino", () => {
    expect(destinoInicio([])).toBeNull();
  });
});
