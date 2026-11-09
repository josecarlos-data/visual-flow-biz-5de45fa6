import * as XLSX from "@e965/xlsx";
import { Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DatasetModule, UploadResult, UploadStageResult } from "./types";
import { num as fmtNum } from "@/lib/format";

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "None" ? null : s;
};
const numv = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const boolv = (v: unknown): boolean => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "si" || s === "sí" || s === "1" || s === "x";
};
const p2 = (n: number) => String(n).padStart(2, "0");
/** Fecha local (no UTC): SheetJS crea las fechas a medianoche en hora local. */
const fechaLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const datev = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : fechaLocal(v);
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
export const timev = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${p2(v.getHours())}:${p2(v.getMinutes())}:${p2(v.getSeconds())}`;
  if (typeof v === "number") {
    const total = Math.round((v % 1) * 86400);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}`;
  }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}` : null;
};


export interface MaestroCliente {
  cod_cliente: number;
  cliente: string;
  razon_social: string | null;
  cif: string | null;
  ruta_comercial: string | null;
  cod_delegacion: string | null;
  delegacion: string | null;
  cod_vendedor: string | null;
  vendedor: string | null;
  cod_tipo_cliente: string | null;
  num_empleados_taller: number | null;
  observaciones_almacen: string | null;
  fecha_alta: string | null;
  cod_prohibicion_venta: string | null;
  prohibicion_venta: string | null;
  cod_rappel: string | null;
  grupo_rappel: string | null;
  tramos_rappel: string | null;
  grupo: string | null;
  ruta_especial: string | null;
  top_truck: boolean;
  direccion: string | null;
  cod_postal: string | null;
  localidad: string | null;
  provincia: string | null;
  telefono: string | null;
  telefono2: string | null;
  email: string | null;
  persona_contacto: string | null;
  web: string | null;
  extra: Record<string, string>;
}

export interface MaestroProducto {
  referencia: string;
  descripcion: string | null;
  familia: string | null;
  familia_nombre: string | null;
  marca: string | null;
  marca_nombre: string | null;
  cod_proveedor: string | null;
  proveedor: string | null;
  estado: string | null;
  sustituye_a: string | null;
  sustituida_por: string | null;
  observaciones: string | null;
  primera_venta: string | null;
  ultima_venta: string | null;
  unidades_periodo: number | null;
  importe_periodo: number | null;
}

export interface MaestroVenta {
  cod_cliente: number;
  referencia: string;
  marca: string | null;
  familia: string | null;
  fecha: string;
  unidades: number;
  importe: number;
  margen: number;
  id_documento: string | null;
  ejercicio: number | null;
  num_documento: number | null;
  linea: number | null;
  tipo_documento: string | null;
  operacion: string | null;
  hora: string | null;
  canal: string | null;
  cod_almacen: string | null;
  almacen: string | null;
  cod_vendedor_linea: string | null;
  vendedor_linea: string | null;
  registrado_por: string | null;
  motivo_abono: string | null;
  id_doc_enlazado: string | null;
  descripcion_linea: string | null;
}


export interface MaestroIsiParsed {
  clientes: MaestroCliente[];
  productos: MaestroProducto[];
  ventas: MaestroVenta[];
  hojas: HojaLectura[];
  descartesVentas: DescarteVenta[];
}

export interface HojaLectura {
  hoja: string;
  leidas: number;
  descartadas: number;
}

export interface DescarteVenta {
  hoja: string;
  fila: number;
  falta: string;
  row: Record<string, unknown>;
}

/** Campos del Excel que no tienen columna propia: se guardan en `extra`. */
const EXTRA_CLIENTE = [
  "Extensión",
  "Estado",
  "Tipo de cliente",
  "Clasificac. abc",
  "Cód. Motivo baja",
  "Motivo baja",
  "Fecha de baja",
  "Cód. Modo de pago",
  "Cód. Modo de entrega",
  "Modo de entrega",
  "Núm. Pedido obligatorio",
  "Exp. Regular",
  "Serie usada",
  "Nº Rappels",
  "Aviso Rappel",
];

function sheetRows(wb: XLSX.WorkBook, ...names: string[]): Row[] {
  const name = names.find((n) => wb.SheetNames.includes(n));
  if (!name) throw new Error(`Falta la hoja ${names[0]} en el Excel. No se ha subido nada.`);
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: null });
}

function parseExcel(buffer: ArrayBuffer): MaestroIsiParsed {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, nodim: true });

  const hojas: HojaLectura[] = [];
  const clientes: MaestroCliente[] = [];
  const filasCli = sheetRows(wb, "Dim_Cliente");
  for (const r of filasCli) {
    const cod = numv(r["Cliente"]);
    if (cod === null || isNaN(cod)) continue;
    const extra: Record<string, string> = {};
    for (const k of EXTRA_CLIENTE) {
      const v = str(r[k]);
      if (v) extra[k] = v;
    }
    clientes.push({
      cod_cliente: cod,
      cliente: str(r["Razón social"]) ?? `CLIENTE ${cod}`,
      razon_social: str(r["Razón social"]),
      cif: str(r["Cif"]),
      ruta_comercial: str(r["Ruta Comercial"]),
      cod_delegacion: str(r["Cód. Delegación"]),
      delegacion: str(r["Delegación"]),
      cod_vendedor: str(r["Cód. Vendedor"]),
      vendedor: str(r["Vendedor"]),
      cod_tipo_cliente: str(r["Cód. Tipo de cliente"]),
      num_empleados_taller: numv(r["Nº empleados taller"]),
      observaciones_almacen: str(r["Observaciones almacén"]),
      fecha_alta: datev(r["Fecha de alta"]),
      cod_prohibicion_venta: str(r["Cód. Prohibic. venta"]),
      prohibicion_venta: str(r["Prohibic. venta"]),
      cod_rappel: str(r["Cód. Rappel"]),
      grupo_rappel: str(r["Grupo Rappel"]),
      tramos_rappel: str(r["Tramos Rappel"]),
      grupo: str(r["Grupo"]),
      ruta_especial: str(r["Ruta Especial"]),
      top_truck: boolv(r["Top Truck"]),
      direccion: str(r["Dirección"]),
      cod_postal: str(r["Cód. Postal"]),
      localidad: str(r["Localidad"]),
      provincia: str(r["Provincia"]),
      telefono: str(r["Teléfono"]),
      telefono2: str(r["Teléfono 2"]),
      email: str(r["E-mail"]),
      persona_contacto: str(r["Persona contacto"]),
      web: str(r["Web"]),
      extra,
    });
  }

  hojas.push({ hoja: "Dim_Cliente", leidas: filasCli.length, descartadas: filasCli.length - clientes.length });

  const productos: MaestroProducto[] = [];
  const filasRef = sheetRows(wb, "Dim_Referencia");
  for (const r of filasRef) {
    const ref = str(r["Referencia"]);
    if (!ref) continue;
    productos.push({
      referencia: ref,
      descripcion: str(r["Descripcion"]) ?? str(r["Descripción"]),
      familia: str(r["Familia"]),
      familia_nombre: str(r["Familia Nombre"]),
      marca: str(r["Marca"]),
      marca_nombre: str(r["Marca Nombre"]),
      cod_proveedor: str(r["Cód. Proveedor"]),
      proveedor: str(r["Proveedor"]),
      estado: str(r["Estado"]),
      sustituye_a: str(r["Sustituye a"]),
      sustituida_por: str(r["Sustituida por"]),
      observaciones: str(r["Observaciones"]),
      primera_venta: datev(r["Primera venta"]),
      ultima_venta: datev(r["Última venta"]),
      unidades_periodo: numv(r["Unidades periodo"]),
      importe_periodo: numv(r["Importe periodo"]),
    });
  }

  hojas.push({ hoja: "Dim_Referencia", leidas: filasRef.length, descartadas: filasRef.length - productos.length });

  const ventas: MaestroVenta[] = [];
  const descartesVentas: DescarteVenta[] = [];
  for (const { hoja, filas: filasHechos } of hojasVentas(wb)) {
  for (let i = 0; i < filasHechos.length; i++) {
    const r = filasHechos[i];
    const cod = numv(r["Cliente"]);
    const ref = str(r["Referencia"]);
    const fecha = datev(r["Fecha"]);
    if (cod === null || isNaN(cod) || !ref || !fecha) {
      const falta = [cod === null || isNaN(cod) ? "Cliente" : null, !ref ? "Referencia" : null, !fecha ? "Fecha" : null]
        .filter(Boolean).join(", ");
      descartesVentas.push({ hoja, fila: i + 2, falta, row: r });
      continue;
    }
    const doc = str(r["ID Documento"]);
    const contador = str(r["Contador"]);
    ventas.push({
      cod_cliente: cod,
      referencia: ref,
      marca: str(r["Marca"]),
      familia: str(r["Familia"]),
      fecha,
      unidades: numv(r["Unidades"]) ?? 0,
      importe: numv(r["Importe"]) ?? 0,
      margen: numv(r["Margen"]) ?? 0,
      id_documento: doc ? (contador ? `${contador}|${doc}` : doc) : null,
      ejercicio: numv(r["Ejercicio"]),
      num_documento: numv(r["Nº Documento"]),
      linea: numv(r["Línea"]),
      tipo_documento: str(r["Tipo documento"]),
      operacion: str(r["Operación"]),
      hora: timev(r["Hora"]),
      canal: str(r["Canal"]),
      cod_almacen: str(r["Cód. Almacén"]),
      almacen: str(r["Almacén"]),
      cod_vendedor_linea: str(r["Cód. Vendedor"]),
      vendedor_linea: str(r["Vendedor"]),
      registrado_por: str(r["Registrado por"]),
      motivo_abono: str(r["Motivo abono"]),
      id_doc_enlazado: str(r["ID Doc. enlazado"]),
      descripcion_linea: str(r["Descripción línea"]),
    });

  }
  hojas.push({ hoja, leidas: filasHechos.length, descartadas: descartesVentas.filter((x) => x.hoja === hoja).length });
  }

  if (ventas.length === 0) {
    throw new Error("Las hojas de ventas (Hechos_Diarios) no tienen ninguna línea válida (con Cliente, Referencia y Fecha). No se ha subido nada.");
  }

  return { clientes, productos, ventas, hojas, descartesVentas };
}

/**
 * Hojas de ventas: «Hechos_Diarios» o «Hechos_Diarios_…» (una por año), en orden alfabético.
 * Valida todas antes de procesar nada.
 */
export function hojasVentas(wb: XLSX.WorkBook): { hoja: string; filas: Row[] }[] {
  const nombres = wb.SheetNames.filter((n) => n === "Hechos_Diarios" || n.startsWith("Hechos_Diarios_")).sort();
  if (nombres.length === 0) throw new Error("Falta la hoja Hechos_Diarios en el Excel. No se ha subido nada.");
  if (nombres.includes("Hechos_Diarios") && nombres.length > 1) {
    throw new Error(
      "El Excel tiene a la vez la hoja Hechos_Diarios y hojas Hechos_Diarios_AAAA: las ventas estarían duplicadas. No se ha subido nada.",
    );
  }
  const res = nombres.map((hoja) => ({ hoja, filas: XLSX.utils.sheet_to_json<Row>(wb.Sheets[hoja], { defval: null }) }));
  const vacia = res.find((h) => h.filas.length === 0);
  if (vacia) {
    throw new Error(
      `La hoja ${vacia.hoja} ha llegado vacía. Si el Excel es muy grande puede ser por tamaño: parte las ventas en más hojas. No se ha subido nada.`,
    );
  }
  return res;
}

function ejemplosDescartes(d: MaestroIsiParsed): string {
  if (d.descartesVentas.length === 0) return "";
  const ej = d.descartesVentas.slice(0, 5).map((x) => `${x.hoja} fila ${x.fila} (sin ${x.falta})`).join("; ");
  return ` Ventas: ${fmtNum(d.descartesVentas.length)} filas descartadas. Primeras: ${ej}.`;
}

interface Aplicacion { aplicada: boolean; aviso?: string; filas?: number; filas_carga?: number; filas_actuales?: number; desde?: string; hasta?: string }

async function aplicarYRefrescar(
  data: MaestroIsiParsed,
  carga: string,
  forzar: boolean,
  stages: UploadStageResult[],
): Promise<UploadResult> {
  const { data: res, error } = await supabase.rpc("aplicar_carga_ventas" as never, { _carga: carga, _forzar: forzar } as never);
  if (error) {
    stages.push({ name: "Aplicar ventas", success: 0, errors: 1, message: error.message });
    return { success: 0, errors: 1, stages, message: "No se han aplicado las ventas. El CRM sigue con las ventas anteriores." };
  }
  const r = res as unknown as Aplicacion;
  if (!r.aplicada) {
    stages.push({ name: "Aplicar ventas", success: 0, errors: 1, message: "Aviso del 95 %" });
    return {
      success: 0,
      errors: 1,
      stages,
      message: `La carga trae ${fmtNum(r.filas_carga ?? 0)} líneas de venta y el CRM tiene ${fmtNum(r.filas_actuales ?? 0)} (menos del 95 %). No se ha cambiado ninguna venta.${ejemplosDescartes(data)}`,
      accion: {
        label: "Aplicar de todas formas",
        run: () => aplicarYRefrescar(data, carga, true, stages.filter((s) => s.name !== "Aplicar ventas")),
      },
    };
  }
  stages.push({ name: "Aplicar ventas", success: r.filas ?? 0, errors: 0, message: `${r.desde} a ${r.hasta}` });

  for (const fn of ["refrescar_resumenes_admin", "refrescar_documentos_resumen"]) {
    const { error: e } = await supabase.rpc(fn as never);
    stages.push(e ? { name: fn, success: 0, errors: 1, message: e.message } : { name: fn, success: 1, errors: 0 });
  }
  const errors = stages.reduce((a, s) => a + s.errors, 0);
  return {
    success: (r.filas ?? 0),
    errors,
    stages,
    message:
      (errors === 0
        ? "Maestro ISI cargado y resúmenes regenerados."
        : "Las ventas se han aplicado, pero algún paso posterior falló. Revisa el detalle.") + ejemplosDescartes(data),
  };
}

async function subirMaestro(data: MaestroIsiParsed): Promise<UploadResult> {
  const stages: UploadStageResult[] = [];
  const { data: carga, error: prepError } = await supabase.rpc("preparar_carga_ventas" as never);
  if (prepError || !carga) {
    return { success: 0, errors: 1, stages: [{ name: "Preparar carga", success: 0, errors: 1, message: prepError?.message }], message: "No se ha iniciado la carga. No se ha cambiado nada." };
  }
  const SIZE = 2000;
  let subidas = 0;
  for (let i = 0; i < data.ventas.length; i += SIZE) {
    const { error } = await supabase.rpc("insertar_ventas_carga" as never, { _carga: carga, _rows: data.ventas.slice(i, i + SIZE) } as never);
    if (error) {
      stages.push({ name: "Subir ventas", success: subidas, errors: data.ventas.length - subidas, message: error.message });
      return { success: 0, errors: 1, stages, message: "Ha fallado una tanda de ventas. No se ha cambiado nada en el CRM; vuelve a intentarlo." };
    }
    subidas += Math.min(SIZE, data.ventas.length - i);
  }
  stages.push({ name: "Subir ventas", success: subidas, errors: 0 });
  stages.push(await rpcBatches("upsert_clientes_maestro", "_rows", data.clientes, 500));
  stages.push(await rpcBatches("upsert_productos_maestro", "_rows", data.productos, 1000));
  return aplicarYRefrescar(data, carga as unknown as string, false, stages);
}

async function rpcBatches<T>(fn: string, key: string, rows: T[], size: number): Promise<UploadStageResult> {
  let success = 0;
  let errors = 0;
  let message: string | undefined;
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.rpc(fn as never, { [key]: rows.slice(i, i + size) } as never);
    if (error) {
      errors += Math.min(size, rows.length - i);
      message = error.message;
      console.error(`${fn} error:`, error.message);
    } else {
      success += Math.min(size, rows.length - i);
    }
  }
  return { name: fn, success, errors, message };
}

export const maestroIsiDataset: DatasetModule<MaestroIsiParsed> = {
  key: "maestro_isi",
  name: "Maestro ISI (CRM)",
  description: "Clientes, referencias y ventas diarias con margen (origen: Maestro ISI)",
  icon: Database,
  expectedColumns: ["Hoja Dim_Cliente", "Hoja Dim_Referencia", "Hojas Hechos_Diarios_AAAA (una por año)"],
  parse: parseExcel,
  countLabel: (d) =>
    `${fmtNum(d.clientes.length)} clientes, ${fmtNum(d.productos.length)} referencias y ${fmtNum(d.ventas.length)} líneas de venta`,
  rowCount: (d) => d.clientes.length + d.productos.length + d.ventas.length,
  previewColumns: [
    { key: "cod_cliente", label: "Cód." },
    { key: "razon_social", label: "Razón social" },
    { key: "delegacion", label: "Delegación" },
    { key: "vendedor", label: "Vendedor" },
    { key: "ruta_comercial", label: "Ruta" },
    { key: "cod_tipo_cliente", label: "Tipo" },
    { key: "prohibicion_venta", label: "Aviso" },
  ],
  previewRows: (d, limit) => d.clientes.slice(0, limit) as unknown as Record<string, unknown>[],
  summary: (d) => [
    ...d.hojas.map((h) => ({
      label: `${h.hoja}: leídas · ${fmtNum(h.descartadas)} descartadas`,
      value: fmtNum(h.leidas),
      tone: (h.descartadas > 0 ? "warn" : "default") as "warn" | "default",
    })),
  ],
  rejections: (d) =>
    d.descartesVentas.map((x) => ({ fila: x.fila, motivo: `${x.hoja} sin ${x.falta}`, row: x.row })),
  rejectionColumns: ["Cliente", "Referencia", "Fecha", "ID Documento", "Importe"],
  upload: async (data) => subirMaestro(data),
  invalidate: (qc) => {
    qc.invalidateQueries({ queryKey: ["historico_data"] });
    qc.invalidateQueries({ queryKey: ["vendedores_list"] });
    qc.invalidateQueries({ queryKey: ["delegaciones_list"] });
    qc.invalidateQueries({ queryKey: ["crm_clientes"] });
    qc.invalidateQueries({ queryKey: ["panel_ventas"] });
  },
};
