import { describe, it, expect } from "vitest";
import { quitarMarcaInterna, agruparMotivos, etiquetaNoEfectiva, estadoRevision, bloquesCompletables, muestraEtiquetaEstado } from "./resumenVisita";

describe("resumenVisita", () => {
  it("quita la marca interna", () => {
    expect(quitarMarcaInterna("Hola\n\n[Respuesta a los datos que faltaban]\nA 20 euros")).toBe("Hola\n\nA 20 euros");
  });
  it("agrupa motivos repetidos con contador", () => {
    expect(agruparMotivos(["promo", "comp", "promo"])).toEqual([{ key: "promo", n: 2 }, { key: "comp", n: 1 }]);
  });
  it("muestra el resultado solo si no es efectiva", () => {
    expect(etiquetaNoEfectiva("efectiva")).toBeNull();
    expect(etiquetaNoEfectiva("cliente_ausente")).toBe("Cliente ausente");
  });
  it("estado de revisión", () => {
    expect(estadoRevision(null)).toBe("Pendiente");
    expect(estadoRevision("NO CORRECTO")).toBe("No correcto");
  });
  it("completar: solo visitas propias, Pendiente y No correcto", () => {
    const bs = [{ validacion: "pendiente" }, { validacion: "NO CORRECTO" }, { validacion: "CORRECTO" }];
    expect(bloquesCompletables(true, bs)).toHaveLength(2);
    expect(bloquesCompletables(false, bs)).toHaveLength(0);
  });
});
