import { describe, expect, it } from "vitest";
import { borrarBorrador, CADUCIDAD_BORRADOR_MS, guardarBorrador, leerBorrador } from "./borradorVisita";

const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const datos = {
  visitaId: "v1", codCliente: "10833", clienteNombre: "Taller X", fecha: "2026-11-12", tipo: "cliente",
  resultado: "efectiva", transcripcion: "hola", textoAnalizado: null, observaciones: "", bloques: [],
  analisis: { modelo: null, version: null }, fotos: ["albaran.jpg"],
};

describe("borradorVisita", () => {
  it("guarda y recupera el mismo id de visita", () => {
    const s = memoria();
    guardarBorrador("u1", datos, 1000, s);
    expect(leerBorrador("u1", 2000, s)?.visitaId).toBe("v1");
    expect(leerBorrador("u1", 2000, s)?.fotos).toEqual(["albaran.jpg"]);
  });
  it("un usuario no ve el borrador de otro", () => {
    const s = memoria();
    guardarBorrador("u1", datos, 1000, s);
    expect(leerBorrador("u2", 2000, s)).toBeNull();
  });
  it("caduca a los 3 días y se elimina", () => {
    const s = memoria();
    guardarBorrador("u1", datos, 0, s);
    expect(leerBorrador("u1", CADUCIDAD_BORRADOR_MS, s)).not.toBeNull();
    expect(leerBorrador("u1", CADUCIDAD_BORRADOR_MS + 1, s)).toBeNull();
    expect(s.m.size).toBe(0);
  });
  it("borrar lo elimina", () => {
    const s = memoria();
    guardarBorrador("u1", datos, 0, s);
    borrarBorrador("u1", s);
    expect(leerBorrador("u1", 1, s)).toBeNull();
  });
  it("un borrador dañado no rompe y se descarta", () => {
    const s = memoria();
    s.setItem("crm_borrador_visita:u1", "{no json");
    expect(leerBorrador("u1", 1, s)).toBeNull();
    expect(s.m.size).toBe(0);
  });
});
