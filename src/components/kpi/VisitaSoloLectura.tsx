import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMotivos } from "@/hooks/useCrm";
import { presentarCampos } from "@/lib/camposVisita";
import { estadoRevision, quitarMarcaInterna, ETIQUETA_RESULTADO } from "@/lib/resumenVisita";
import { BotonAdjunto } from "@/components/VisorAdjunto";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** Visita y bloques en solo lectura; lee con las consultas normales (la RLS decide qué se ve). */
export function VisitaSoloLectura({ visitaId, onClose }: { visitaId: string | null; onClose: () => void }) {
  const { data: motivos } = useMotivos();
  const q = useQuery({
    queryKey: ["visita_solo_lectura", visitaId],
    enabled: !!visitaId,
    queryFn: async () => {
      const [v, b] = await Promise.all([
        supabase.from("visitas").select("id, fecha, hora, cod_cliente, cliente_externo, comercial_nombre, vendedor, origen, resultado_visita, observaciones, transcripcion").eq("id", visitaId!).maybeSingle(),
        supabase.from("visita_bloques").select("id, motivo_key, campos, validacion, nota_revision, revisado_en, orden").eq("visita_id", visitaId!).order("orden"),
      ]);
      if (v.error) throw v.error;
      if (b.error) throw b.error;
      let cliente: string | null = null;
      if (v.data?.cod_cliente != null) {
        const c = await supabase.from("clientes").select("cliente").eq("cod_cliente", v.data.cod_cliente).maybeSingle();
        cliente = c.data?.cliente ?? null;
      }
      return { visita: v.data, bloques: b.data ?? [], cliente };
    },
  });
  const v = q.data?.visita;
  return (
    <Dialog open={!!visitaId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Visita (solo lectura)</DialogTitle></DialogHeader>
        {q.isLoading && <Skeleton className="h-40 w-full" />}
        {q.error && <p className="text-sm text-destructive">No se pudo cargar la visita: {(q.error as Error).message}</p>}
        {!q.isLoading && !q.error && !v && <p className="text-sm text-muted-foreground">No tienes acceso a esta visita o ya no existe.</p>}
        {v && (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">{v.cod_cliente != null ? `${v.cod_cliente} · ${q.data?.cliente ?? ""}` : v.cliente_externo}</p>
              <p className="text-muted-foreground">
                {new Date(v.fecha + "T00:00:00").toLocaleDateString("es-ES")}{v.hora ? ` ${String(v.hora).slice(0, 5)}` : ""} · {v.comercial_nombre ?? v.vendedor ?? "—"} · {v.origen === "gespromo" ? "Gespromo" : "App"}
                {" · "}{ETIQUETA_RESULTADO[v.resultado_visita] ?? v.resultado_visita}
              </p>
            </div>
            {q.data!.bloques.map((b) => {
              const m = motivos?.find((x) => x.key === b.motivo_key);
              const items = presentarCampos(b.campos as Record<string, unknown>, m?.campos);
              return (
                <div key={b.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m?.nombre ?? b.motivo_key ?? "Sin motivo"}</span>
                    <Badge variant="outline">{estadoRevision(b.validacion)}</Badge>
                  </div>
                  {items.length === 0 && <p className="text-muted-foreground">Sin datos.</p>}
                  <dl className="grid gap-1">
                    {items.map((i) => (
                      <div key={i.clave} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                        <dt className="text-muted-foreground">{i.label}</dt>
                        <dd className="break-words">{i.clase === "adjunto" ? <BotonAdjunto adjunto={i.adjunto} /> : i.valor}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
            {v.observaciones && (
              <div><p className="text-muted-foreground">Observaciones</p><p className="whitespace-pre-wrap">{quitarMarcaInterna(v.observaciones)}</p></div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
