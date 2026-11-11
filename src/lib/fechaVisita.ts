/** Fechas de registro de visitas en hora de Madrid (la misma regla que aplica el servidor). */
export const hoyMadrid = (ahora: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);

const restarDias = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

/** Límites del campo Fecha. El admin no tiene límites. */
export function limitesFechaVisita(diasAtrasMax: number, esAdmin: boolean, ahora: Date = new Date()) {
  if (esAdmin) return { min: undefined, max: undefined };
  const hoy = hoyMadrid(ahora);
  const n = Number.isInteger(diasAtrasMax) && diasAtrasMax >= 0 ? diasAtrasMax : 7;
  return { min: restarDias(hoy, n), max: hoy };
}

/** Hora y ubicación solo tienen sentido si la visita es de hoy; la ubicación, además, si no es una llamada. */
export const pideUbicacion = (tipo: string, fecha: string, ahora: Date = new Date()) =>
  tipo !== "llamada" && fecha === hoyMadrid(ahora);

/** Lee el ajuste; si falta o no es un entero ≥ 0, 7. */
export const parseDiasAtras = (v: string | null | undefined) => (v && /^\d+$/.test(v) ? Number(v) : 7);
