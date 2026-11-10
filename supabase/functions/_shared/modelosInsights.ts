/**
 * Única lista de modelos del informe IA de cliente. La usa la edge function
 * `cliente-insights` (lista blanca) y la ficha de cliente (desplegable del comparador).
 * Sin APIs de Deno para poder importarse también desde el front.
 * Solo modelos con retención cero: el informe envía datos personales.
 * gpt-5.5 es temporal, como referencia para comparar.
 */
export const MODELOS_INSIGHTS = [
  "openai/gpt-6.1-sol",
  "openai/gpt-6-luna",
  "openai/gpt-5.5",
] as const;

export type ModeloInsights = (typeof MODELOS_INSIGHTS)[number];

export const MODELO_INSIGHTS_POR_DEFECTO: ModeloInsights = "openai/gpt-6.1-sol";
