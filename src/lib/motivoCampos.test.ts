import { describe, expect, it } from "vitest";
import { normalizarNumero } from "./motivoCampos";

describe("normalizarNumero", () => {
  it.each([
    ["56.3", "56.3"], ["56.30", "56.3"], ["56,30", "56.3"], ["1.250,50", "1250.5"],
    ["1250", "1250"], ["0000", "0"], ["0,00", "0"],
  ])("%s → %s", (entrada, salida) => expect(normalizarNumero(entrada)).toBe(salida));
});
