import { maestroIsiDataset } from "./maestroIsi";

import { visitasHistoricoDataset } from "./visitasHistorico";
import { bloquesExtraccionDataset } from "./bloquesExtraccion";
import type { DatasetModule } from "./types";

// Lista de fuentes de datos disponibles. Para añadir una nueva:
// 1. Crear un módulo en src/lib/datasets/<key>.ts que exporte un DatasetModule
// 2. Importarlo y añadirlo aquí.
export const DATASETS: DatasetModule<any>[] = [
  maestroIsiDataset,
  visitasHistoricoDataset,
  bloquesExtraccionDataset,
  
];

export type { DatasetModule, UploadResult, UploadStageResult, DatasetOption, SummaryItem, RejectionRow } from "./types";
