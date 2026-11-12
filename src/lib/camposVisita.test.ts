import { describe, expect, it } from "vitest";
import { presentarCampos, documentosDe, formatearValor, formatearTamano } from "./camposVisita";
import type { MotivoCampo } from "@/hooks/useCrm";

const ruta = "0a1b2c3d-1111-2222-3333-444455556666/visita/foto.jpg";
const def = [
  { campo_key: "foto", label: "Foto", tipo: "adjunto", sort_order: 2 },
  { campo_key: "marca", label: "Marca", tipo: "texto", sort_order: 1 },
] as unknown as MotivoCampo[];

describe("presentarCampos", () => {
  it("muestra el adjunto con su nombre original y oculta la línea _nombre", () => {
    const r = presentarCampos({ foto: ruta, foto_nombre: "incidencia.jpg", marca: "Bosch" }, def);
    expect(r.map((i) => i.clave)).toEqual(["marca", "foto"]);
    expect(r[1]).toMatchObject({ clase: "adjunto", adjunto: { path: ruta, nombre: "incidencia.jpg" } });
  });
  it("reconoce el adjunto aunque la plantilla ya no defina el campo", () => {
    const r = presentarCampos({ viejo: ruta, viejo_nombre: "a.pdf" }, []);
    expect(r).toHaveLength(1);
    expect(r[0].clase).toBe("adjunto");
  });
  it("no trata como adjunto un texto normal con campo _nombre", () => {
    const r = presentarCampos({ contacto: "Juan", contacto_nombre: "x" }, []);
    expect(r.every((i) => i.clase === "texto")).toBe(true);
  });
  it("no pinta campos.documentos como texto", () => {
    expect(presentarCampos({ documentos: [{ path: ruta }] }, [])).toEqual([]);
  });
});

describe("formato", () => {
  it("listas y sí/no legibles", () => {
    expect(formatearValor(["a", "b"])).toBe("a, b");
    expect(formatearValor(true)).toBe("Sí");
    expect(formatearValor("false")).toBe("No");
  });
  it("tamaño", () => {
    expect(formatearTamano(2048)).toBe("2 KB");
    expect(formatearTamano(undefined)).toBe("");
  });
  it("documentos de la visita solo con ruta", () => {
    expect(documentosDe({ documentos: [{ path: ruta, nombre_original: "x.pdf", tamano: 10 }, { nombre: "sin" }] })).toEqual([
      { path: ruta, nombre: "x.pdf", tipo: undefined, tamano: 10 },
    ]);
  });
});

describe("presentarCampos · datos de referencia", () => {
  it("coloca marca, familia y descripción debajo de la referencia con etiqueta legible", () => {
    const d = [
      { campo_key: "referencia", label: "Referencia", tipo: "referencia", sort_order: 1 },
      { campo_key: "precio", label: "Precio", tipo: "numero", sort_order: 2 },
    ] as unknown as MotivoCampo[];
    const r = presentarCampos({ precio: "5", referencia: "R1", referencia_marca: "Sachs", referencia_familia: "Frenos", referencia_descripcion: "Pastillas" }, d);
    expect(r.map((i) => i.label)).toEqual(["Referencia", "Descripción", "Marca", "Familia", "Precio"]);
  });
});
