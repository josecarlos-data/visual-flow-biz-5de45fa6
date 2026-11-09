import type { QueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";

export interface PreviewColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: (v: unknown) => string;
}

export interface UploadStageResult {
  name: string;
  success: number;
  errors: number;
  message?: string;
}

export interface UploadResult {
  success: number;
  errors: number;
  stages?: UploadStageResult[];
  message?: string;
  /** Acción de seguimiento que el administrador puede confirmar (p. ej. «Aplicar de todas formas»). */
  accion?: { label: string; run: () => Promise<UploadResult> };
}

/** Casilla opcional que el administrador marca antes de subir. */
export interface DatasetOption {
  key: string;
  label: string;
  description?: string;
}

/** Contador que se muestra en la previsualización, antes de escribir nada. */
export interface SummaryItem {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "danger";
}

/** Fila rechazada durante la validación, con su contenido original. */
export interface RejectionRow {
  fila: number;
  motivo: string;
  row: Record<string, unknown>;
}

export interface DatasetModule<TParsed> {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  expectedColumns: string[];
  parse: (buffer: ArrayBuffer) => TParsed;
  /** Enriquecimiento asíncrono (consultas a la base) antes de previsualizar. */
  prepare?: (data: TParsed) => Promise<TParsed>;
  /** Contadores de la previsualización. */
  summary?: (data: TParsed) => SummaryItem[];
  options?: DatasetOption[];
  countLabel: (data: TParsed) => string;
  rowCount: (data: TParsed) => number;
  previewColumns: PreviewColumn[];
  previewRows: (data: TParsed, limit: number) => Record<string, unknown>[];
  /** Filas rechazadas por validación, consultables y descargables. */
  rejections?: (data: TParsed) => RejectionRow[];
  /** Columnas originales del fichero, para el CSV de rechazos. */
  rejectionColumns?: string[];
  upload: (data: TParsed, options?: Record<string, boolean>) => Promise<UploadResult>;
  invalidate: (qc: QueryClient) => void;
}
