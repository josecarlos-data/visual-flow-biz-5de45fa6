import type { MotivoCampo } from "@/hooks/useCrm";

/** Fichero privado del bucket de visitas, listo para abrir en el visor. */
export interface Adjunto {
  path: string;
  nombre: string;
  tipo?: string;
  tamano?: number;
}

export type ItemCampo =
  | { clase: "texto"; clave: string; label: string; valor: string }
  | { clase: "adjunto"; clave: string; label: string; adjunto: Adjunto };

/** Ruta del bucket: la primera carpeta es el id del usuario que subió el fichero. */
const RUTA_BUCKET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/.+/i;

/** Texto legible para cualquier valor de campo (listas, sí/no, números). */
export function formatearValor(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(formatearValor).filter(Boolean).join(", ");
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (v === "true") return "Sí";
  if (v === "false") return "No";
  if (typeof v === "number") return v.toLocaleString("es-ES");
  if (typeof v === "object") return "";
  return String(v);
}

/** Tamaño legible: 820 KB, 2,4 MB. */
export function formatearTamano(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}

/** Documentos de la visita completa (campos.documentos), solo los ya subidos. */
export function documentosDe(campos: Record<string, unknown> | null | undefined): Adjunto[] {
  const docs = (campos as { documentos?: unknown } | null)?.documentos;
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && typeof (d as { path?: unknown }).path === "string")
    .map((d) => ({
      path: d.path as string,
      nombre: (d.nombre_original as string) ?? (d.nombre as string) ?? (d.path as string).split("/").pop() ?? "Documento",
      tipo: typeof d.tipo === "string" ? d.tipo : undefined,
      tamano: typeof d.tamano === "number" ? d.tamano : undefined,
    }));
}

/**
 * Campos de un bloque/visita en orden de plantilla, con los adjuntos reconocidos.
 * Adjunto = campo de tipo «adjunto» en la plantilla o, si la plantilla ya no lo define,
 * pareja clave + clave_nombre cuya ruta tiene forma de ruta del bucket.
 */
export function presentarCampos(
  campos: Record<string, unknown> | null | undefined,
  def: MotivoCampo[] | undefined,
): ItemCampo[] {
  const c = campos ?? {};
  const orden = (def ?? []).slice().sort((x, y) => x.sort_order - y.sort_order);
  const porClave = new Map(orden.map((d) => [d.campo_key, d]));
  const claves = [
    ...orden.map((d) => d.campo_key).filter((k) => k in c),
    ...Object.keys(c).filter((k) => !porClave.has(k)),
  ];
  const ocultas = new Set<string>(["documentos"]);
  const out: ItemCampo[] = [];
  for (const k of claves) {
    const val = c[k];
    const d = porClave.get(k);
    const nombre = c[`${k}_nombre`];
    const esAdjunto =
      typeof val === "string" && val !== "" &&
      (d?.tipo === "adjunto" || (!d && typeof nombre === "string" && RUTA_BUCKET.test(val)));
    if (esAdjunto) {
      ocultas.add(`${k}_nombre`);
      out.push({
        clase: "adjunto", clave: k, label: d?.label ?? k,
        adjunto: { path: val as string, nombre: (typeof nombre === "string" && nombre) || (val as string).split("/").pop() || "Archivo" },
      });
    } else {
      out.push({ clase: "texto", clave: k, label: d?.label ?? k, valor: formatearValor(val) });
    }
  }
  return out.filter((i) => !ocultas.has(i.clave) && (i.clase === "adjunto" || i.valor !== ""));
}
