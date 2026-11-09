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

import * as XLSX from "@e965/xlsx";
import { maestroIsiDataset } from "./maestroIsi";

function libro(hojas: Record<string, Record<string, unknown>[]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Cliente: 1, "Razón social": "A" }]), "Dim_Cliente");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Referencia: "R1" }]), "Dim_Referencia");
  for (const [n, filas] of Object.entries(hojas)) {
    const ws = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, n);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
const v = (fecha: string, ref = "R1") => ({ Cliente: 1, Referencia: ref, Fecha: fecha, Importe: 10 });

describe("hojas de ventas por año", () => {
  it("junta Hechos_Diarios_2024 y Hechos_Diarios_2025 y anota la hoja en descartes", async () => {
    const d = await maestroIsiDataset.parse(
      libro({ Hechos_Diarios_2025: [v("01/02/2025"), { Cliente: 1, Fecha: "02/02/2025" }], Hechos_Diarios_2024: [v("01/02/2024")] }),
    );
    expect(d.ventas.map((x) => x.fecha)).toEqual(["2024-02-01", "2025-02-01"]);
    expect(d.hojas.slice(2)).toEqual([
      { hoja: "Hechos_Diarios_2024", leidas: 1, descartadas: 0 },
      { hoja: "Hechos_Diarios_2025", leidas: 2, descartadas: 1 },
    ]);
    expect(d.descartesVentas[0]).toMatchObject({ hoja: "Hechos_Diarios_2025", fila: 3, falta: "Referencia" });
  });
  it("Hechos_Diarios junto a Hechos_Diarios_2025 da error de duplicado", () => {
    expect(() => maestroIsiDataset.parse(libro({ Hechos_Diarios: [v("01/02/2024")], Hechos_Diarios_2025: [v("01/02/2025")] })))
      .toThrow(/duplicadas/);
  });
  it("una hoja de ventas vacía da error con su nombre", () => {
    expect(() => maestroIsiDataset.parse(libro({ Hechos_Diarios_2024: [v("01/02/2024")], Hechos_Diarios_2025: [] })))
      .toThrow("La hoja Hechos_Diarios_2025 ha llegado vacía");
  });
});
