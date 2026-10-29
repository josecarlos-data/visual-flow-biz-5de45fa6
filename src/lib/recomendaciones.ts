export type GrupoRecomendacion = "habitual" | "recuperar" | "potencial";

export const GRUPOS: { key: GrupoRecomendacion; titulo: string; ayuda: string }[] = [
  { key: "habitual", titulo: "Clientes habituales", ayuda: "Compran lo ofertado actualmente" },
  { key: "recuperar", titulo: "Recuperar", ayuda: "Lo compraban y lo han dejado" },
  { key: "potencial", titulo: "Potenciales", ayuda: "Clientes activos que aún no lo compran" },
];

export const MOTIVOS_DESCARTE = [
  { key: "no_interesa", label: "No le interesa" },
  { key: "ya_lo_tiene", label: "Ya lo tiene" },
  { key: "otro", label: "Otro" },
] as const;

export function agruparRecomendados<T extends { grupo: string }>(filas: T[]): Record<GrupoRecomendacion, T[]> {
  const r: Record<GrupoRecomendacion, T[]> = { habitual: [], recuperar: [], potencial: [] };
  for (const f of filas) if (f.grupo in r) r[f.grupo as GrupoRecomendacion].push(f);
  return r;
}

export function textoSaturacion(dias: number | null | undefined): string | null {
  if (dias === null || dias === undefined) return null;
  if (dias <= 0) return "Recibió otra oferta hoy";
  return `Recibió otra oferta hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
