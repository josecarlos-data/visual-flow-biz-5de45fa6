export interface Tramo {
  pct: number;
  etiqueta: string;
  importe?: number | null;
}

/** Tramo más alto alcanzado para un % de cumplimiento (null si ninguno). */
export function tramoAlcanzado(tramos: Tramo[], avancePct: number | null | undefined): Tramo | null {
  if (avancePct == null) return null;
  const orden = [...tramos].sort((a, b) => a.pct - b.pct);
  let r: Tramo | null = null;
  for (const t of orden) if (avancePct >= t.pct) r = t;
  return r;
}

/** Siguiente tramo por alcanzar y cuánto falta para él (en la medida del objetivo). */
export function siguienteTramo(
  tramos: Tramo[],
  vendido: number,
  meta: number | null | undefined,
): { tramo: Tramo; falta: number } | null {
  if (!meta || meta <= 0) return null;
  const pctActual = (vendido / meta) * 100;
  const t = [...tramos].sort((a, b) => a.pct - b.pct).find((x) => x.pct > pctActual);
  if (!t) return null;
  return { tramo: t, falta: Math.max((meta * t.pct) / 100 - vendido, 0) };
}

/** Meta de una asignación: % sobre la base o importe fijo. */
export function metaDesde(tipo: "pct" | "importe", valor: number | null | undefined, base: number): number | null {
  if (valor == null) return null;
  return tipo === "pct" ? Math.round(base * (1 + valor / 100) * 100) / 100 : valor;
}
