/** Utilidades de presentación de visitas (listado y ficha). Sin acceso a datos. */

export const MARCA_RESPUESTA = "[Respuesta a los datos que faltaban]";

/** Quita la marca interna que NuevaVisita añade al dictar una respuesta. Solo al mostrar. */
export function quitarMarcaInterna(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto.split(MARCA_RESPUESTA).join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** Agrupa motivos repetidos conservando el orden: [{key, n}]. */
export function agruparMotivos(keys: (string | null)[]): { key: string | null; n: number }[] {
  const out: { key: string | null; n: number }[] = [];
  for (const k of keys) {
    const g = out.find((x) => x.key === k);
    if (g) g.n += 1;
    else out.push({ key: k, n: 1 });
  }
  return out;
}

export const ETIQUETA_RESULTADO: Record<string, string> = {
  efectiva: "Efectiva",
  cliente_ausente: "Cliente ausente",
  cerrado: "Cerrado",
  sin_acceso: "Sin acceso",
};

/** Etiqueta del resultado si NO fue efectiva; null si fue efectiva. */
export function etiquetaNoEfectiva(resultado: string | null | undefined): string | null {
  if (!resultado || resultado === "efectiva") return null;
  return ETIQUETA_RESULTADO[resultado] ?? resultado;
}

export type EstadoRevision = "Pendiente" | "Correcto" | "No correcto";

export function estadoRevision(validacion: string | null | undefined): EstadoRevision {
  if (validacion === "CORRECTO") return "Correcto";
  if (validacion === "NO CORRECTO") return "No correcto";
  return "Pendiente";
}

/**
 * Etiqueta de estado (Pendiente / Correcto / No correcto): siempre en las visitas
 * de la app; en las importadas de Gespromo solo si están validadas.
 */
export function muestraEtiquetaEstado(
  origen: string | null | undefined,
  validacion: string | null | undefined,
): boolean {
  if (origen === "app") return true;
  return validacion === "CORRECTO" || validacion === "NO CORRECTO";
}

/** Bloques que el comercial puede completar: visita propia y bloque Pendiente o No correcto. */
export function bloquesCompletables<T extends { validacion: string | null }>(
  esPropia: boolean,
  bloques: T[],
): T[] {
  if (!esPropia) return [];
  return bloques.filter((b) => b.validacion !== "CORRECTO");
}
