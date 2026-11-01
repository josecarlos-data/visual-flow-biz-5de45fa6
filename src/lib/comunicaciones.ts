/** Variación porcentual; null si no hay base (antes = 0). */
export function variacionPct(antes: number | null, despues: number | null): number | null {
  if (antes == null || despues == null || antes === 0) return null;
  return ((despues - antes) / Math.abs(antes)) * 100;
}

/** Diferencia en puntos entre la variación de quienes la recibieron y la del grupo de control. */
export function diferenciaFrenteControl(
  envAntes: number, envDespues: number, ctrlAntes: number | null, ctrlDespues: number | null,
): number | null {
  const a = variacionPct(envAntes, envDespues);
  const b = variacionPct(ctrlAntes, ctrlDespues);
  return a == null || b == null ? null : a - b;
}

/** La ventana de 30 días posteriores solo es medible cuando los datos ya la cubren. */
export function ventanaMedible(fechaEnvio: string, fechaCorte: string): boolean {
  const d = new Date(`${fechaEnvio.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10) <= fechaCorte;
}

export type EstadoSeguimiento = "compro" | "sin_compra" | "pendiente";

/** Resultado de un envío confirmado: pendiente si los datos aún no cubren la ventana. */
export function estadoSeguimiento(medible: boolean, importe: number | null): EstadoSeguimiento {
  if (Number(importe ?? 0) > 0) return "compro";
  return medible ? "sin_compra" : "pendiente";
}

export const ETIQUETA_SEGUIMIENTO: Record<EstadoSeguimiento, string> = {
  compro: "Compró", sin_compra: "Sin compra", pendiente: "Pendiente de datos",
};

/** Porcentaje de clientes medibles que compraron; null si no hay medibles. */
export function tasaConversion(compradores: number, medibles: number): number | null {
  return medibles > 0 ? (compradores / medibles) * 100 : null;
}

/** Importe medio por cliente comprador. */
export function importePorComprador(importe: number, compradores: number): number | null {
  return compradores > 0 ? importe / compradores : null;
}
