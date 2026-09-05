/**
 * Reglas compartidas de los campos de plantilla de visita.
 * Lo usan por igual el formulario del comercial, el diseñador de plantillas
 * y el esquema que se envía a la IA, para que los tres vean lo mismo.
 */

/** Lista literal de opciones o referencia a un catálogo cerrado. */
export type OpcionesDef = string[] | { catalogo: string } | null | undefined;

export interface CampoLike {
  tipo: string;
  opciones?: OpcionesDef;
  is_active?: boolean | null;
  visibilidad?: string | null;
}

/** Mapa clave de catálogo → valores ordenados. */
export type CatalogoMap = Record<string, string[]>;

/** Devuelve la clave del catálogo si las opciones son una referencia, o null. */
export function catalogoDe(opciones: OpcionesDef): string | null {
  if (opciones && !Array.isArray(opciones) && typeof opciones === "object") {
    const clave = (opciones as { catalogo?: unknown }).catalogo;
    if (typeof clave === "string" && clave.trim()) return clave.trim();
  }
  return null;
}

/**
 * Precedencia: si las opciones son una referencia a catálogo, manda el catálogo
 * y la lista literal se ignora por completo.
 */
export function resolverOpciones(opciones: OpcionesDef, catalogos?: CatalogoMap): string[] {
  const clave = catalogoDe(opciones);
  if (clave) return catalogos?.[clave] ?? [];
  return Array.isArray(opciones) ? opciones.map(String).filter(Boolean) : [];
}

/** Lista literal editable en el diseñador (vacía si el campo usa catálogo). */
export function opcionesLiterales(opciones: OpcionesDef): string[] {
  return catalogoDe(opciones) ? [] : Array.isArray(opciones) ? opciones.map(String) : [];
}

const activo = (c: CampoLike) => c.is_active !== false;
const normal = (c: CampoLike) => (c.visibilidad ?? "normal") === "normal";

/** Campos vigentes que se pintan al comercial y se envían a la IA. */
export function camposVisibles<T extends CampoLike>(campos: T[]): T[] {
  return campos.filter((c) => activo(c) && normal(c));
}

/** Campos vigentes, incluidos los de sistema (se persisten aunque no se pinten). */
export function camposActivos<T extends CampoLike>(campos: T[]): T[] {
  return campos.filter(activo);
}

/** Tipos de campo admitidos y su etiqueta en el diseñador. */
export const TIPOS_CAMPO: { value: string; label: string }[] = [
  { value: "texto", label: "Texto corto" },
  { value: "texto_largo", label: "Texto largo" },
  { value: "numero", label: "Número" },
  { value: "select", label: "Lista de opciones" },
  { value: "multiselect", label: "Lista de opciones (varias)" },
  { value: "booleano", label: "Sí / No" },
  { value: "fecha", label: "Fecha" },
  { value: "referencia", label: "Referencia de producto" },
  
  { value: "referencia_campana", label: "Campaña" },
];

/** Tipos que se alimentan de una lista de opciones. */
export const TIPOS_CON_OPCIONES = ["select", "multiselect"];

/** Separador con el que se guardan los valores de un multiselect. */
export const SEP_MULTI = " | ";

export const parseMulti = (v: string | undefined): string[] =>
  (v ?? "").split("|").map((s) => s.trim()).filter(Boolean);

export const serializeMulti = (vals: string[]): string => vals.join(SEP_MULTI);

/**
 * Convención RIMOSA: un precio no conseguido se registra como 0, nunca vacío.
 * Los comerciales escriben "0000", "00" o "0,00"; todo eso es el mismo cero.
 * Devuelve el valor normalizado como número en texto, o el original si no es un número.
 */
export function normalizarNumero(v: string | undefined | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const limpio = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  if (!Number.isFinite(n)) return s;
  return String(n);
}

/** Normaliza todos los campos de tipo número de un bloque antes de guardarlo. */
export function normalizarValoresNumericos<T extends CampoLike & { campo_key: string }>(
  campos: T[],
  valores: Record<string, string>,
): Record<string, string> {
  const salida = { ...valores };
  for (const c of campos) {
    if (c.tipo !== "numero") continue;
    const v = salida[c.campo_key];
    if (v === undefined) continue;
    salida[c.campo_key] = normalizarNumero(v);
  }
  return salida;
}
