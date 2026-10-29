/** Normaliza a móvil español en formato 34XXXXXXXXX. Devuelve null si no es un móvil español válido. */
export function normalizarMovil(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = `34${d}`;
  return /^34[67]\d{8}$/.test(d) ? d : null;
}

/** Primer móvil válido entre varias fuentes (orden de prioridad). */
export function primerMovil(...fuentes: (string | null | undefined)[]): string | null {
  for (const f of fuentes) {
    if (!f) continue;
    for (const parte of f.split(/[\/,;]| - /)) {
      const m = normalizarMovil(parte);
      if (m) return m;
    }
  }
  return null;
}

export function enlaceWhatsApp(movil34: string, mensaje: string): string {
  return `https://wa.me/${movil34}?text=${encodeURIComponent(mensaje)}`;
}

export const TOPE_TANDA = 50;
export const DIAS_SIN_CONFIRMAR = 7;

/** Un envío abierto pasa a «sin confirmar» a los 7 días (la base de datos lo hace a diario). */
export function estadoEnvioVisible(estado: string, abiertoEn: string, ahora = new Date()): string {
  if (estado !== "abierto") return estado;
  const dias = (ahora.getTime() - new Date(abiertoEn).getTime()) / 86_400_000;
  return dias > DIAS_SIN_CONFIRMAR ? "sin_confirmar" : "abierto";
}

export const ETIQUETA_ENVIO: Record<string, string> = {
  abierto: "Pendiente de confirmar",
  enviado: "Enviada",
  no_enviado: "No enviada",
  sin_confirmar: "Sin confirmar",
};

const CLAVE_PENDIENTE = "oferta_envio_pendiente";
export interface EnvioPendiente { id: string; cliente: string; titulo: string }
export const guardarPendiente = (p: EnvioPendiente) => sessionStorage.setItem(CLAVE_PENDIENTE, JSON.stringify(p));
export const leerPendiente = (): EnvioPendiente | null => {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_PENDIENTE) ?? "null"); } catch { return null; }
};
export const borrarPendiente = () => sessionStorage.removeItem(CLAVE_PENDIENTE);
