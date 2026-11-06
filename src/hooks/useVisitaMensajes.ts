import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface VisitaMensaje {
  id: string;
  bloque_id: string | null;
  autor_id: string | null;
  autor_nombre: string | null;
  texto: string;
  created_at: string;
  es_dueno: boolean;
}

const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Invalida todo lo relacionado con mensajes y contadores. */
export function useInvalidarMensajes() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["visita_mensajes"] });
    qc.invalidateQueries({ queryKey: ["contadores_mensajes"] });
    qc.invalidateQueries({ queryKey: ["mis_revisiones"] });
    qc.invalidateQueries({ queryKey: ["revision_respuestas_nuevas"] });
  };
}

export function useMensajesVisita(visitaId: string | null | undefined) {
  return useQuery({
    queryKey: ["visita_mensajes", visitaId],
    enabled: !!visitaId,
    queryFn: async () => {
      const { data, error } = await rpc("mensajes_visita", { _visita_id: visitaId });
      if (error) throw new Error(error.message);
      return (data ?? []) as VisitaMensaje[];
    },
  });
}

export async function enviarMensaje(visitaId: string, bloqueId: string | null, texto: string) {
  const t = texto.trim();
  if (!t) return;
  const { error } = await supabase.from("visita_mensajes" as never).insert({ visita_id: visitaId, bloque_id: bloqueId, texto: t } as never);
  if (error) throw error;
}

export function useEnviarMensaje() {
  const inv = useInvalidarMensajes();
  return useMutation({
    mutationFn: (m: { visitaId: string; bloqueId: string | null; texto: string }) => enviarMensaje(m.visitaId, m.bloqueId, m.texto),
    onSuccess: inv,
  });
}

/** Marca la visita como leída al abrirla. */
export function useMarcarLeida(visitaId: string | null | undefined) {
  const inv = useInvalidarMensajes();
  useEffect(() => {
    if (!visitaId) return;
    rpc("marcar_visita_leida", { _visita_id: visitaId }).then(({ error }) => { if (!error) inv(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitaId]);
}

export function useContadoresMensajes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contadores_mensajes", user?.id],
    enabled: !!user,
    refetchInterval: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await rpc("contadores_mensajes");
      if (error) throw new Error(error.message);
      return (data ?? { mis_revisiones: 0, respuestas_nuevas: 0 }) as { mis_revisiones: number; respuestas_nuevas: number };
    },
  });
}

/** Visitas con respuestas del comercial sin leer por el revisor actual. */
export function useRespuestasNuevas(enabled: boolean) {
  return useQuery({
    queryKey: ["revision_respuestas_nuevas"],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await rpc("revision_respuestas_nuevas", { _limite: 1000, _offset: 0 });
      if (error) throw new Error(error.message);
      return new Set(((data ?? []) as { visita_id: string }[]).map((r) => r.visita_id));
    },
  });
}

export interface MiRevision {
  visita_id: string;
  cliente: string;
  fecha: string;
  bloques: { id: string; motivo: string | null; validacion: string | null }[];
  ultimo_texto: string | null;
  ultimo_autor: string | null;
  ultimo_en: string | null;
  sin_leer: number;
  esperando: boolean;
  total: number;
}

export function useMisRevisiones(filtro: "sin_leer" | "esperando" | "todas", limite: number) {
  return useQuery({
    queryKey: ["mis_revisiones", filtro, limite],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await rpc("mis_revisiones", { _filtro: filtro, _limite: limite, _offset: 0 });
      if (error) throw new Error(error.message);
      return (data ?? []) as MiRevision[];
    },
  });
}

/** Último mensaje de un hilo (bloque o visita). */
export const ultimoDe = (ms: VisitaMensaje[]) => (ms.length ? ms[ms.length - 1] : null);
