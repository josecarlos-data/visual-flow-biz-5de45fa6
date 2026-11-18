import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Si el servidor deja ver el KPI a este usuario (ajuste kpi_visible_para). */
export function useKpiVisible() {
  return useQuery({
    queryKey: ["kpi_visible"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kpi_visible");
      if (error) throw error;
      return data === true;
    },
  });
}

export interface LineaKpiInput {
  id?: string;
  nombre: string;
  objetivo_mes: number;
  umbral_bonus: number | null;
  importe_bonus: number | null;
  regla_conteo: "cliente_dia" | "cliente_mes" | "bloque";
  orden: number;
  activo: boolean;
  motivos: string[];
}

export function useKpiLineasAdmin() {
  return useQuery({
    queryKey: ["kpi_lineas_admin"],
    queryFn: async () => {
      const [l, m] = await Promise.all([
        supabase.from("kpi_lineas").select("*").order("orden"),
        supabase.from("kpi_linea_motivos").select("linea_id, motivo_key"),
      ]);
      if (l.error) throw l.error;
      if (m.error) throw m.error;
      return (l.data ?? []).map((x) => ({
        ...x,
        motivos: (m.data ?? []).filter((y) => y.linea_id === x.id).map((y) => y.motivo_key),
      }));
    },
  });
}

export function useGuardarLineaKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: LineaKpiInput) => {
      const fila = {
        nombre: d.nombre.trim(), objetivo_mes: d.objetivo_mes, umbral_bonus: d.umbral_bonus,
        importe_bonus: d.importe_bonus, regla_conteo: d.regla_conteo, orden: d.orden, activo: d.activo,
      };
      let id = d.id;
      if (id) {
        const { error } = await supabase.from("kpi_lineas").update(fila).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("kpi_lineas").insert(fila).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      // Los motivos no tienen UPDATE: se borran los que sobran y se insertan los nuevos.
      const { data: act, error: e1 } = await supabase.from("kpi_linea_motivos").select("motivo_key").eq("linea_id", id!);
      if (e1) throw e1;
      const actuales = (act ?? []).map((x) => x.motivo_key);
      const quitar = actuales.filter((k) => !d.motivos.includes(k));
      const poner = d.motivos.filter((k) => !actuales.includes(k));
      if (quitar.length) {
        const { error } = await supabase.from("kpi_linea_motivos").delete().eq("linea_id", id!).in("motivo_key", quitar);
        if (error) throw error;
      }
      if (poner.length) {
        const { error } = await supabase.from("kpi_linea_motivos").insert(poner.map((k) => ({ linea_id: id!, motivo_key: k })));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("kpi_") }),
  });
}

export function useBorrarLineaKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kpi_lineas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("kpi_") }),
  });
}
