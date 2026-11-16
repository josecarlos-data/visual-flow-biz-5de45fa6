import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KpiFila {
  vendedor: string;
  user_id: string | null;
  sin_usuario: boolean;
  mes: number;
  linea_id: string;
  linea: string;
  orden: number;
  conseguidos: number;
  pendientes: number;
  objetivo: number;
  umbral: number;
  importe_bonus: number | null;
  bonus: boolean;
}

/** Resumen anual de KPI: una consulta por año, en caché; cambiar de mes no vuelve a consultar. */
export function useKpiResumen(anio: number, enabled = true) {
  return useQuery({
    queryKey: ["kpi_resumen", anio],
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kpi_resumen", { _anio: anio });
      if (error) throw error;
      return (data ?? []) as KpiFila[];
    },
  });
}

export function useKpiLineas() {
  return useQuery({
    queryKey: ["kpi_lineas_activas"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_lineas")
        .select("id, nombre, objetivo_mes, umbral_bonus, importe_bonus, orden")
        .eq("activo", true)
        .order("orden");
      if (error) throw error;
      return data ?? [];
    },
  });
}
