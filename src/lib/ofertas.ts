export type EstadoOferta = "borrador" | "publicada" | "archivada";
export type EstadoVisible = EstadoOferta | "vencida";

/** Pie fijo que se añade a todos los mensajes (texto provisional pendiente de la asesoría). */
export const PIE_OFERTA = "RIMOSA\nResponde BAJA si no quieres recibir más ofertas.";

export interface AdjuntoOferta {
  path: string;
  nombre: string;
  tipo: string;
  tamano: number;
}

export interface RequisitoPerfil {
  atributo_key: string;
  valores: string[];
}

/** "Vencida" no se guarda: se calcula al leer a partir de la fecha de fin. */
export function estadoVisible(estado: EstadoOferta, vigenteHasta: string | null, hoy = new Date()): EstadoVisible {
  if (estado !== "publicada" || !vigenteHasta) return estado;
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  return vigenteHasta < hoyIso ? "vencida" : "publicada";
}

/** Mensaje completo: cuerpo con {contacto} sustituido + enlace + pie fijo. */
export function componerMensaje(cuerpo: string, contacto: string | null, enlace: string | null): string {
  const texto = cuerpo.replace(/\{contacto\}/g, (contacto ?? "").trim()).trim();
  return [texto, enlace, PIE_OFERTA].filter(Boolean).join("\n\n");
}

export function enlaceOferta(urlBase: string, token: string): string {
  return `${urlBase.replace(/\/+$/, "")}/o/${token}`;
}

export const normalizarTexto = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/** Igual que la regla de la base de datos: contiene algún patrón, sin mayúsculas ni tildes. */
export function bloqueadoPorPatron(valor: string | null, patrones: string[]): boolean {
  if (!valor) return false;
  const v = normalizarTexto(valor);
  return patrones.some((p) => p.trim() !== "" && v.includes(normalizarTexto(p.trim())));
}

export function parsePatrones(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
