import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CampoVisita } from "@/components/CampoVisita";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCatalogos, type MotivoCampo, type VisitaBloque } from "@/hooks/useCrm";
import { useInvalidarMensajes } from "@/hooks/useVisitaMensajes";
import { normalizarValoresNumericos } from "@/lib/motivoCampos";

const aTexto = (v: unknown) => (v == null ? "" : Array.isArray(v) ? JSON.stringify(v) : String(v));

/**
 * El comercial completa los datos de su bloque (Pendiente o No correcto).
 * Guarda en el servidor con completar_bloque: solo campos de la plantilla, con control de versión
 * (updated_at tal cual llega del servidor, como texto, sin pasar por Date) y mensaje automático al revisor.
 */
export function CompletarBloqueDialog({
  bloque, campos, titulo, open, onOpenChange, modo = "comercial",
}: {
  bloque: VisitaBloque;
  campos: MotivoCampo[];
  titulo: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** «revisor»: corrige los datos con editar_bloque_revision; no cambia la validación ni avisa por mensaje. */
  modo?: "comercial" | "revisor";
}) {
  const esRevisor = modo === "revisor";
  const qc = useQueryClient();
  const invalidarMensajes = useInvalidarMensajes();
  const { data: catalogos } = useCatalogos();
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(bloque.campos ?? {})) v[k] = aTexto(val);
    setValores(v);
  }, [open, bloque]);

  const activos = campos.filter((c) => c.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);

  const guardar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc((esRevisor ? "editar_bloque_revision" : "completar_bloque") as never, {
        _bloque_id: bloque.id, _campos: normalizarValoresNumericos(activos, valores), _updated_at: bloque.updated_at,
      } as never);
      if (error) throw new Error(error.message);
      return data as unknown as { cambiados: number };
    },
    onSuccess: (r) => {
      toast({
        title: !r.cambiados ? "No había cambios que guardar."
          : esRevisor ? "Datos corregidos. La validación no cambia." : "Datos completados. Se ha avisado al revisor.",
      });
      onOpenChange(false);
    },
    onError: (e) => {
      toast({ title: "No se ha podido guardar", description: (e as Error).message, variant: "destructive" });
      onOpenChange(false);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["crm_visita_bloques"] });
      qc.invalidateQueries({ queryKey: ["crm_visitas"] });
      invalidarMensajes();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !guardar.isPending && onOpenChange(v)}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col gap-0 p-0 sm:h-auto sm:max-h-[90vh]">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{esRevisor ? "Editar datos" : "Completar datos"} · {titulo}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {activos.map((c) => (
            <CampoVisita
              key={c.campo_key}
              campo={c}
              valores={valores}
              catalogos={catalogos}
              onChange={(patch) => setValores((prev) => ({ ...prev, ...patch }))}
            />
          ))}
        </div>
        <DialogFooter className="gap-2 border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardar.isPending}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
