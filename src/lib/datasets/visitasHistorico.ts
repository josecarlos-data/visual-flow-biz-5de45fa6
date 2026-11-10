import * as XLSX from "@e965/xlsx";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DatasetModule, UploadStageResult } from "./types";
import { num as fmtNum } from "@/lib/format";

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "None" || s === "nan" ? null : s;
};

const numv = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

const datev = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  // Fecha local (no toISOString, que desplaza un día según la zona horaria).
  if (v instanceof Date) return fechaLocal(v);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : fechaLocal(d);
};

const fechaLocal = (d: Date): string | null =>
  isNaN(d.getTime())
    ? null
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const timev = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toTimeString().slice(0, 8);
  if (typeof v === "number") {
    const total = Math.round((v % 1) * 86400);
    const h = Math.floor(total / 3600);
    const mi = Math.floor((total % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
  }
  const m = String(v).trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}` : null;
};

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Mapea el texto libre de "Motivo" de Gespromo a las plantillas del CRM. */
export function motivoKeyDesde(motivo: string | null, titulo: string | null): string | null {
  const t = sinAcentos(`${motivo ?? ""} ${titulo ?? ""}`);
  if (!t.trim()) return null;
  if (t.includes("revision")) return "revision_seguimiento";
  if (t.includes("competencia")) return "competencia";
  if (t.includes("gsmart") || t.includes("crucero")) return "gsmart";
  if (t.includes("incidencia") || t.includes("reclamacion")) return "incidencia";
  if (t.includes("oferta") || t.includes("promocion") || t.includes("campana")) return "promocion";
  if (t.includes("potencial") || t.includes("informacion importante")) return "informacion_potencial";
  if (t.includes("seguimiento") || t.includes("visita")) return "seguimiento";
  return "seguimiento";
}

/** Extrae el código numérico de formatos tipo "04-10374". Devuelve null para "NV-xxx". */
export function codClienteDesde(v: unknown): { cod: number | null; externo: string | null } {
  const s = str(v);
  if (!s) return { cod: null, externo: null };
  const m = s.match(/^(?:\d+\s*-\s*)?(\d+)$/);
  if (m) return { cod: Number(m[1]), externo: null };
  return { cod: null, externo: s };
}

/** Detecta marcadores de validación dentro del texto de observaciones. */
export function validacionDesde(texto: string | null, estado: string | null): string | null {
  const t = sinAcentos(`${estado ?? ""} ${texto ?? ""}`);
  if (t.includes("no correcto") || t.includes("incorrecto")) return "no_correcto";
  if (t.includes("correcto")) return "correcto";
  return null;
}

export interface VisitaHistorica {
  cod_cliente: number | null;
  cliente_externo: string | null;
  motivo_key: string | null;
  fecha: string;
  hora: string | null;
  tipo: string | null;
  estado: string | null;
  validacion: string | null;
  observaciones: string | null;
  comercial: string | null;
  comercial_nombre: string | null;
  ruta: string | null;
  zona: string | null;
  titulo: string | null;
  latitud: number | null;
  longitud: number | null;
}

/** La BD solo admite estos cuatro valores en minúscula (visitas_tipo_chk). */
const TIPOS_VALIDOS = ["cliente", "ruta", "llamada", "agenda"] as const;
function tipoNormalizado(v: string | null): string {
  const t = (v ?? "").trim().toLowerCase();
  return (TIPOS_VALIDOS as readonly string[]).includes(t) ? t : "cliente";
}

function parseExcel(buffer: ArrayBuffer): VisitaHistorica[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("El Excel no contiene ninguna hoja");
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });

  const visitas: VisitaHistorica[] = [];
  for (const r of rows) {
    const fecha = datev(r["Fecha"]);
    if (!fecha) continue;
    const { cod, externo } = codClienteDesde(r["Código cliente"] ?? r["Codigo cliente"]);
    const observaciones = str(r["Observaciones"]);
    const titulo = str(r["Título"]) ?? str(r["Titulo"]);
    const nombre = str(r["Nombre Cliente"]);
    visitas.push({
      cod_cliente: cod,
      cliente_externo: cod === null ? externo ?? nombre : null,
      motivo_key: motivoKeyDesde(str(r["Motivo"]), titulo),
      fecha,
      hora: timev(r["Hora"]),
      tipo: tipoNormalizado(str(r["Tipo"]) ?? str(r["Clase"])),
      estado: str(r["Estado"]) ?? "realizada",
      validacion: validacionDesde(observaciones, str(r["Estado"])),
      observaciones,
      comercial: str(r["Comercial"]),
      comercial_nombre: str(r["Comercial"]),
      ruta: str(r["Ruta"]),
      zona: str(r["Zona"]),
      titulo,
      latitud: numv(r["Latitud"]),
      longitud: numv(r["Longitud"]),
    });
  }

  if (visitas.length === 0) throw new Error("No se han encontrado visitas con fecha válida en el Excel");
  return visitas;
}

export const visitasHistoricoDataset: DatasetModule<VisitaHistorica[]> = {
  key: "visitas_gespromo",
  name: "Visitas históricas (Gespromo)",
  description: "Histórico de visitas comerciales exportado de Gespromo",
  icon: MapPin,
  expectedColumns: ["Fecha", "Hora", "Código cliente", "Título", "Observaciones", "Comercial", "Ruta", "Zona", "Motivo"],
  parse: parseExcel,
  countLabel: (d) => `${fmtNum(d.length)} visitas históricas`,
  rowCount: (d) => d.length,
  previewColumns: [
    { key: "fecha", label: "Fecha" },
    { key: "hora", label: "Hora" },
    { key: "cod_cliente", label: "Cliente" },
    { key: "motivo_key", label: "Plantilla" },
    { key: "comercial_nombre", label: "Comercial" },
    { key: "ruta", label: "Ruta" },
    { key: "validacion", label: "Validación" },
  ],
  previewRows: (d, limit) => d.slice(0, limit) as unknown as Record<string, unknown>[],
  upload: async (data) => {
    // Carga repetible: nunca borra; el servidor inserta las nuevas, actualiza estado/observaciones
    // y calcula el veredicto. Repetir una tanda no duplica nada.
    const SIZE = 1000;
    const total = { nuevas: 0, estado_actualizado: 0, observaciones_actualizadas: 0, observaciones_ignoradas: 0, sin_cambios: 0 };
    const tandas = Math.ceil(data.length / SIZE);
    let ok = 0;
    let errors = 0;
    let message: string | undefined;

    for (let i = 0; i < data.length; i += SIZE) {
      const { data: res, error } = await supabase.rpc("importar_visitas_historicas" as never, {
        _rows: data.slice(i, i + SIZE),
      } as never);
      if (error) {
        errors += Math.min(SIZE, data.length - i);
        message = error.message;
        console.error("importar_visitas_historicas error:", error.message);
        continue;
      }
      ok++;
      const r = (res ?? {}) as Partial<typeof total>;
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += Number(r[k] ?? 0);
    }

    const resumen =
      `${fmtNum(total.nuevas)} nuevas, ${fmtNum(total.estado_actualizado)} con estado actualizado, ` +
      `${fmtNum(total.observaciones_actualizadas)} con observaciones actualizadas, ` +
      `${fmtNum(total.observaciones_ignoradas)} cambios ignorados por estar revisadas en la app, ` +
      `${fmtNum(total.sin_cambios)} sin cambios`;
    const success = data.length - errors;
    const stages: UploadStageResult[] = [
      { name: "importar_visitas_historicas", success, errors, message: errors ? message : resumen },
    ];

    return {
      success,
      errors,
      stages,
      message:
        errors === 0
          ? `Carga completada: ${resumen}.`
          : `Carga incompleta: ${ok} de ${tandas} tandas aplicadas (${resumen}). Puedes repetirla sin duplicar.`,
    };
  },
  invalidate: (qc) => {
    qc.invalidateQueries({ queryKey: ["crm_visitas"] });
    qc.invalidateQueries({ queryKey: ["crm_cliente_visitas"] });
  },
};
