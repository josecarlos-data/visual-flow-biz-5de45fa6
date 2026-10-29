import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, estadoEnvioVisible, normalizarMovil, primerMovil } from "./ofertasEnvio";
import { componerMensaje } from "./ofertas";

describe("ofertasEnvio", () => {
  it("normaliza móviles españoles", () => {
    expect(normalizarMovil("+34 612 345 678")).toBe("34612345678");
    expect(normalizarMovil("0034612345678")).toBe("34612345678");
    expect(normalizarMovil("712345678")).toBe("34712345678");
  });
  it("rechaza fijos y números incompletos", () => {
    expect(normalizarMovil("958123456")).toBeNull();
    expect(normalizarMovil("61234")).toBeNull();
  });
  it("toma el primer móvil por prioridad", () => {
    expect(primerMovil(null, "958123456", "958 11 22 33 / 655443322")).toBe("34655443322");
  });
  it("sustituye {contacto} en el mensaje", () => {
    expect(componerMensaje("Hola {contacto}, oferta", "Ana", null).startsWith("Hola Ana, oferta")).toBe(true);
  });
  it("abierto pasa a sin confirmar a los 7 días", () => {
    const ahora = new Date("2026-10-29T12:00:00Z");
    expect(estadoEnvioVisible("abierto", "2026-10-21T11:00:00Z", ahora)).toBe("sin_confirmar");
    expect(estadoEnvioVisible("abierto", "2026-10-23T12:00:00Z", ahora)).toBe("abierto");
  });
  it("codifica el enlace de WhatsApp", () => {
    expect(enlaceWhatsApp("34612345678", "a b")).toBe("https://wa.me/34612345678?text=a%20b");
  });
});
