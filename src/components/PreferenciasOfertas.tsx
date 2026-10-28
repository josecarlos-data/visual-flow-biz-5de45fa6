import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function PreferenciasOfertas({ cod }: { cod: number }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const gerencia = role === "admin" || role === "director_comercial";
  const soloLectura = role === "marketing";
  const key = ["preferencias_ofertas", cod];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("cliente_preferencias_ofertas").select("*").eq("cod_cliente", cod).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [telefono, setTelefono] = useState("");
  const [marcas, setMarcas] = useState("");
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setTelefono(data?.telefono_whatsapp ?? "");
    setMarcas((data?.marcas_excluidas ?? []).join(", "));
  }, [data]);

  const guardar = async (cambios: Record<string, unknown>) => {
    setGuardando(true);
    const { error } = await supabase.from("cliente_preferencias_ofertas")
      .upsert({ cod_cliente: cod, ...cambios } as never, { onConflict: "cod_cliente" });
    setGuardando(false);
    if (error) {
      toast({ title: "No se ha podido guardar", description: error.message, variant: "destructive" });
      return false;
    }
    qc.invalidateQueries({ queryKey: key });
    toast({ title: "Preferencias guardadas" });
    return true;
  };

  const noQuiere = data?.no_quiere_ofertas ?? false;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4" />Ofertas</CardTitle></CardHeader>
      <CardContent className="space-y-4 pt-0">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>No quiere recibir ofertas</Label>
                {noQuiere && !gerencia && <p className="text-xs text-muted-foreground">Solo administración o dirección puede volver a permitirlas.</p>}
                {!noQuiere && data?.motivo_desmarcado && <p className="text-xs text-muted-foreground">Último motivo de reactivación: {data.motivo_desmarcado}</p>}
              </div>
              <Switch
                checked={noQuiere}
                disabled={soloLectura || guardando || (noQuiere && !gerencia)}
                onCheckedChange={(v) => (v ? guardar({ no_quiere_ofertas: true }) : setPidiendoMotivo(true))}
                aria-label="No quiere recibir ofertas"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Móvil para WhatsApp</Label>
                <Input inputMode="tel" placeholder="600 000 000" value={telefono} disabled={soloLectura} onChange={(e) => setTelefono(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Marcas excluidas (códigos, separados por comas)</Label>
                <Input value={marcas} disabled={soloLectura} onChange={(e) => setMarcas(e.target.value)} />
              </div>
            </div>
            {!soloLectura && (
              <Button size="sm" variant="outline" disabled={guardando}
                onClick={() => guardar({
                  telefono_whatsapp: telefono.replace(/[^\d+]/g, "") || null,
                  marcas_excluidas: marcas.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                })}>
                Guardar
              </Button>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={pidiendoMotivo} onOpenChange={setPidiendoMotivo}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader><DialogTitle>Volver a permitir ofertas</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPidiendoMotivo(false)}>Cancelar</Button>
            <Button disabled={!motivo.trim() || guardando}
              onClick={async () => {
                if (await guardar({ no_quiere_ofertas: false, motivo_desmarcado: motivo.trim() })) {
                  setPidiendoMotivo(false); setMotivo("");
                }
              }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
