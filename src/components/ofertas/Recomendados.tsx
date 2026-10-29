import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2, MessageCircle, Sparkles, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PasoEnvio, type OfertaEnvio } from "@/components/ofertas/EnviarOfertaDialog";
import { GRUPOS, MOTIVOS_DESCARTE, agruparRecomendados, textoSaturacion } from "@/lib/recomendaciones";

interface OfertaVigente { oferta_id: string; titulo: string; vigente_hasta: string | null }
interface Recomendado {
  cod_cliente: number; cliente: string; localidad: string | null; ruta: string | null; vendedor: string | null;
  persona_contacto: string | null; telefono_whatsapp: string | null; telefono: string | null; telefono2: string | null;
  grupo: string; motivo: string; ultima_compra: string | null; importe_12m: number; saturado_dias: number | null;
  avisos: string[] | null; excluidos: number;
}

const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export function Recomendados() {
  const { role } = useAuth();
  const verTodos = role === "admin" || role === "director_comercial" || role === "jefe_de_zona";
  const qc = useQueryClient();
  const [ofertaId, setOfertaId] = useState("");
  const [vendedor, setVendedor] = useState("todos");
  const [enviar, setEnviar] = useState<Recomendado | null>(null);
  const [descartar, setDescartar] = useState<Recomendado | null>(null);

  const { data: ofertas } = useQuery({
    queryKey: ["ofertas_vigentes_envio"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_vigentes_envio");
      if (error) throw error;
      return (data ?? []) as OfertaVigente[];
    },
  });
  const { data: filas, isLoading, error } = useQuery({
    queryKey: ["ofertas_recomendados", ofertaId],
    enabled: !!ofertaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_recomendados", { _oferta_id: ofertaId, _limite: 500 });
      if (error) throw error;
      return (data ?? []) as unknown as Recomendado[];
    },
  });
  useEffect(() => setVendedor("todos"), [ofertaId]);

  const vendedores = useMemo(() => [...new Set((filas ?? []).map((f) => f.vendedor).filter(Boolean) as string[])].sort(), [filas]);
  const visibles = useMemo(() => (filas ?? []).filter((f) => vendedor === "todos" || f.vendedor === vendedor), [filas, vendedor]);
  const grupos = agruparRecomendados(visibles);
  const excluidos = filas?.[0]?.excluidos ?? 0;

  const { data: ofertaEnvio } = useQuery({
    queryKey: ["ofertas_para_cliente", "rec", ofertaId, enviar?.cod_cliente],
    enabled: !!enviar,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_para_cliente", { _cod_cliente: enviar!.cod_cliente });
      if (error) throw error;
      return ((data ?? []) as unknown as OfertaEnvio[]).find((o) => o.oferta_id === ofertaId) ?? null;
    },
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["ofertas_recomendados", ofertaId] });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={ofertaId} onValueChange={setOfertaId}>
          <SelectTrigger className="sm:max-w-md"><SelectValue placeholder="Elige una oferta" /></SelectTrigger>
          <SelectContent>
            {(ofertas ?? []).map((o) => <SelectItem key={o.oferta_id} value={o.oferta_id}>{o.titulo}</SelectItem>)}
          </SelectContent>
        </Select>
        {verTodos && vendedores.length > 1 && (
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger className="sm:max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los comerciales</SelectItem>
              {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {!ofertaId ? (
        <p className="text-sm text-muted-foreground">Elige una oferta para ver a qué clientes conviene enviarla.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando recomendaciones…</div>
      ) : error ? (
        <p className="text-sm text-destructive">No se han podido calcular las recomendaciones.</p>
      ) : (
        <>
          {excluidos > 0 && (
            <p className="text-xs text-muted-foreground">{excluidos} {excluidos === 1 ? "cliente excluido" : "clientes excluidos"} por bloqueos (baja, prohibición de venta o no quiere ofertas).</p>
          )}
          {!visibles.length && <p className="text-sm text-muted-foreground">No hay clientes recomendados para esta oferta.</p>}
          {GRUPOS.map((g) => grupos[g.key].length > 0 && (
            <section key={g.key} className="space-y-2">
              <h2 className="flex items-baseline gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />{g.titulo}
                <span className="text-xs font-normal text-muted-foreground">{g.ayuda} · {grupos[g.key].length}</span>
              </h2>
              <div className="grid gap-2 md:grid-cols-2">
                {grupos[g.key].map((f) => {
                  const sat = textoSaturacion(f.saturado_dias);
                  return (
                    <Card key={f.cod_cliente}>
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{f.cliente}</p>
                            <p className="truncate text-xs text-muted-foreground">{[f.localidad, f.ruta, verTodos ? f.vendedor : null].filter(Boolean).join(" · ")}</p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">{eur(f.importe_12m)} 12 m</Badge>
                        </div>
                        <p className="text-sm">{f.motivo}</p>
                        {sat && <p className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />{sat}</p>}
                        {(f.avisos ?? []).map((a) => <p key={a} className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />{a}</p>)}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setEnviar(f)}><MessageCircle className="mr-1 h-4 w-4" />Enviar</Button>
                          <Button size="sm" variant="outline" onClick={() => setDescartar(f)}><X className="mr-1 h-4 w-4" />Descartar</Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <Dialog open={!!enviar} onOpenChange={(v) => !v && setEnviar(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{enviar?.cliente}</DialogTitle></DialogHeader>
          {enviar && (ofertaEnvio ? (
            <PasoEnvio cliente={enviar} oferta={ofertaEnvio} origen="recomendacion" onEnviado={() => { setEnviar(null); refrescar(); }} />
          ) : ofertaEnvio === null ? (
            <p className="text-sm text-muted-foreground">Esta oferta ya no está disponible para este cliente.</p>
          ) : (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ))}
        </DialogContent>
      </Dialog>

      <DescartarDialog fila={descartar} ofertaId={ofertaId} onClose={(hecho) => { setDescartar(null); if (hecho) refrescar(); }} />
    </div>
  );
}

function DescartarDialog({ fila, ofertaId, onClose }: { fila: Recomendado | null; ofertaId: string; onClose: (hecho: boolean) => void }) {
  const [motivo, setMotivo] = useState<string>("no_interesa");
  const [nota, setNota] = useState("");
  const [familia, setFamilia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (fila) { setMotivo("no_interesa"); setNota(""); setFamilia(false); } }, [fila]);

  const guardar = async () => {
    if (!fila) return;
    setGuardando(true);
    const { error } = await supabase.rpc("descartar_recomendacion", {
      _oferta_id: ofertaId, _cod_cliente: fila.cod_cliente, _motivo: motivo, _nota: nota || null, _toda_familia: familia,
    });
    setGuardando(false);
    if (error) { toast({ title: "No se ha podido descartar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cliente descartado para esta oferta" });
    onClose(true);
  };

  return (
    <Dialog open={!!fila} onOpenChange={(v) => !v && onClose(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Descartar {fila?.cliente}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MOTIVOS_DESCARTE.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
          <div className="flex items-center gap-2">
            <Checkbox id="desc-fam" checked={familia} onCheckedChange={(v) => setFamilia(v === true)} />
            <Label htmlFor="desc-fam" className="text-sm font-normal">No recomendar ofertas de estas familias durante un tiempo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Descartar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
