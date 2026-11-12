/** Reglas de qué bloques toca el dictado. Solo los bloques nacidos del dictado se regeneran. */
export type OrigenBloque = "voz" | "documento" | "manual";

export interface BloqueConOrigen {
  origen: OrigenBloque;
  editado?: boolean;
  valores: Record<string, string>;
}

/** «Crear / Actualizar bloques»: sustituye solo los de voz; documento y manuales se conservan. */
export function reemplazarBloquesVoz<T extends BloqueConOrigen>(actuales: T[], nuevos: T[]): T[] {
  return [...nuevos, ...actuales.filter((b) => b.origen !== "voz")];
}

/** Bloques de voz corregidos a mano que se perderían al actualizar. */
export const vozEditadosQueSePierden = (actuales: BloqueConOrigen[]) =>
  actuales.filter((b) => b.origen === "voz" && b.editado).length;

/** Bloques de documento o manuales con algún dato: no se guardan si la visita pasa a no efectiva. */
export const bloquesNoVozConDatos = (actuales: BloqueConOrigen[]) =>
  actuales.filter((b) => b.origen !== "voz" && Object.values(b.valores).some((v) => String(v ?? "").trim() !== "")).length;

/** Volver a dictar: «Añadir» une con salto de línea; «Sustituir» deja solo lo nuevo. */
export function unirDictado(previo: string, nuevo: string, modo: "anadir" | "sustituir"): string {
  if (modo === "sustituir" || !previo.trim()) return nuevo;
  return `${previo.trimEnd()}\n\n${nuevo}`;
}

/** El texto ha cambiado desde la última extracción (null = aún no se han creado bloques). */
export const textoCambiado = (actual: string, analizado: string | null) =>
  analizado !== null && actual.trim() !== analizado.trim();
