import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tramo } from "@/lib/objetivosV2";

export interface AvanceV2 {
  objetivo_id: string;
  nombre: string;
  tipo: string;
  desde: string;
  hasta: string;
  medida: string;
  estado: string;
  atribucion: string;
  comparacion: string;
  modo_lista: string;
  mostrar_importe: boolean;
  tramos: Tramo[];
  asignacion_id: string;
  vendedor: string;
  user_id: string | null;
  sin_usuario: boolean;
  num_clientes: number;
  meta: number | null;
  vendido: number;
  base_comparable: number;
  base_total: number;
  avance_pct: number | null;
  falta: number | null;
  proyeccion: number | null;
  proyeccion_pct: number | null;
  tramo: Tramo | null;
  tramo_proyectado: Tramo | null;
  fecha_corte: string;
  fin_comparable: string;
}

export interface ObjetivoV2Input {
  id?: string;
  nombre: string;
  tipo: string;
  desde: string;
  hasta: string;
  medida: string;
  atribucion: string;
  comparacion: string;
  meta_tipo: "pct" | "importe";
  meta_valor: number | null;
  modo_lista: "conjunto" | "por_cliente";
  excluir_de_cartera: boolean;
  contar_ajenos: boolean;
  tramos: Tramo[];
  mostrar_importe: boolean;
  estado: string;
  nota: string | null;
  asignaciones: { vendedor: string; meta_tipo: "pct" | "importe" | null; meta_valor: number | null }[];
  clientes: { cod_cliente: number; vendedor: string | null; meta_tipo: "pct" | "importe" | null; meta_valor: number | null; nombre?: string }[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;

export function useAvanceV2() {
  return useQuery({
    queryKey: ["objetivos_v2_avance"],
    queryFn: async () => {
      const { data, error } = await rpc("objetivos_v2_avance", {});
      if (error) throw error;
      return (data ?? []) as AvanceV2[];
    },
  });
}

export function useTiposObjetivo() {
  return useQuery({
    queryKey: ["tipos_objetivo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_objetivo")
        .select("key, nombre, descripcion, sort_order")
        .eq("visible", true)
        .eq("disponible", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePropuestaV2(desde: string, hasta: string, pctGrupo: number, enabled: boolean) {
  return useQuery({
    queryKey: ["objetivos_v2_propuesta", desde, hasta, pctGrupo],
    enabled: enabled && !!desde && !!hasta,
    queryFn: async () => {
      const { data, error } = await rpc("objetivos_v2_propuesta", { _desde: desde, _hasta: hasta, _pct: pctGrupo });
      if (error) throw error;
      return (data ?? []) as { vendedor: string; user_id: string | null; num_clientes: number; base_anterior: number; meta_sugerida: number }[];
    },
  });
}

export function useSinCodigo() {
  return useQuery({
    queryKey: ["objetivos_v2_sin_codigo"],
    queryFn: async () => {
      const { data, error } = await rpc("objetivos_v2_sin_codigo", {});
      if (error) throw error;
      return (data ?? []) as { caso: string; user_id: string | null; nombre: string | null; username: string | null; rol: string | null; vendedor: string | null }[];
    },
  });
}

export async function cargarObjetivoV2(id: string): Promise<ObjetivoV2Input> {
  const [{ data: o, error: e1 }, { data: asig, error: e2 }, { data: cli, error: e3 }] = await Promise.all([
    supabase.from("objetivos_v2").select("*").eq("id", id).single(),
    supabase.from("objetivo_asignaciones").select("id, vendedor, meta_tipo, meta_valor").eq("objetivo_id", id),
    supabase.from("objetivo_clientes").select("cod_cliente, asignacion_id, meta_tipo, meta_valor, clientes(cliente)").eq("objetivo_id", id).eq("origen", "lista"),
  ]);
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
  const porId = new Map((asig ?? []).map((a) => [a.id, a.vendedor]));
  return {
    id: o.id,
    nombre: o.nombre,
    tipo: o.tipo,
    desde: o.desde,
    hasta: o.hasta,
    medida: o.medida,
    atribucion: o.atribucion,
    comparacion: o.comparacion,
    meta_tipo: o.meta_tipo as "pct" | "importe",
    meta_valor: o.meta_valor,
    modo_lista: o.modo_lista as "conjunto" | "por_cliente",
    excluir_de_cartera: o.excluir_de_cartera,
    contar_ajenos: o.contar_ajenos,
    tramos: (o.tramos as unknown as Tramo[]) ?? [],
    mostrar_importe: o.mostrar_importe,
    estado: o.estado,
    nota: o.nota,
    asignaciones: (asig ?? []).map((a) => ({ vendedor: a.vendedor, meta_tipo: a.meta_tipo as "pct" | "importe" | null, meta_valor: a.meta_valor })),
    clientes: (cli ?? []).map((c: any) => ({
      cod_cliente: c.cod_cliente,
      vendedor: c.asignacion_id ? porId.get(c.asignacion_id) ?? null : null,
      meta_tipo: c.meta_tipo,
      meta_valor: c.meta_valor,
      nombre: c.clientes?.cliente,
    })),
  };
}

export function useObjetivosV2Mutations() {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["objetivos_v2_avance"] });
    qc.invalidateQueries({ queryKey: ["objetivos_v2_sin_codigo"] });
  };
  const guardar = useMutation({
    mutationFn: async (d: ObjetivoV2Input) => {
      const payload = { ...d, clientes: d.clientes.map(({ nombre: _n, ...c }) => c) };
      const { data, error } = await rpc("objetivos_v2_guardar", { _d: payload });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidar,
  });
  const duplicar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await rpc("objetivos_v2_duplicar", { _id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidar,
  });
  return { guardar, duplicar };
}
