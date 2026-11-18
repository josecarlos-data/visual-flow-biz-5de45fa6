import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMotivos } from "@/hooks/useCrm";
import { useBorrarLineaKpi, useGuardarLineaKpi, useKpiLineasAdmin, type LineaKpiInput } from "@/hooks/useKpiVisitas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const REGLAS: Record<LineaKpiInput["regla_conteo"], string> = {
  cliente_dia: "Un cliente por día",
  cliente_mes: "Un cliente por mes",
  bloque: "Cada bloque",
};

export function LineasKpiAdmin() {
  const { role } = useAuth();
  const { data, isLoading, error } = useKpiLineasAdmin();
  const { data: motivos } = useMotivos();
  const borrar = useBorrarLineaKpi();
  const [edit, setEdit] = useState<LineaKpiInput | null>(null);
  const nombreMotivo = (k: string) => motivos?.find((m) => m.key === k)?.nombre ?? k;

  const onBorrar = async (id: string, nombre: string) => {
    if (!confirm(`¿Borrar la línea «${nombre}»? Si solo quieres dejar de contarla, desactívala.`)) return;
    try { await borrar.mutateAsync(id); toast({ title: "Línea borrada" }); }
    catch (e) { toast({ title: "No se pudo borrar", description: (e as Error).message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ nombre: "", objetivo_mes: 10, umbral_bonus: null, importe_bonus: null, regla_conteo: "cliente_dia", orden: ((data?.length ?? 0) + 1) * 10, activo: true, motivos: [] })}>
          <Plus className="mr-2 h-4 w-4" /> Nueva línea
        </Button>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {(data ?? []).map((l) => (
          <Card key={l.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{l.nombre}</p>
                <Badge variant={l.activo ? "default" : "outline"}>{l.activo ? "Activa" : "Inactiva"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Objetivo {l.objetivo_mes}/mes · bonus desde {l.umbral_bonus ?? l.objetivo_mes * 2}
                {l.importe_bonus ? ` (${Number(l.importe_bonus).toLocaleString("es-ES")} €)` : ""} · {REGLAS[l.regla_conteo as LineaKpiInput["regla_conteo"]] ?? l.regla_conteo} · orden {l.orden}
              </p>
              <div className="flex flex-wrap gap-1">{l.motivos.map((m) => <Badge key={m} variant="secondary">{nombreMotivo(m)}</Badge>)}</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...l, regla_conteo: l.regla_conteo as LineaKpiInput["regla_conteo"], importe_bonus: l.importe_bonus === null ? null : Number(l.importe_bonus) })}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                </Button>
                {role === "admin" && (
                  <Button size="sm" variant="ghost" onClick={() => onBorrar(l.id, l.nombre)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Borrar</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {edit && <EditorLinea inicial={edit} motivos={(motivos ?? []).filter((m) => m.is_active || edit.motivos.includes(m.key))} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditorLinea({ inicial, motivos, onClose }: { inicial: LineaKpiInput; motivos: { key: string; nombre: string }[]; onClose: () => void }) {
  const [d, setD] = useState(inicial);
  const guardar = useGuardarLineaKpi();
  const set = <K extends keyof LineaKpiInput>(k: K, v: LineaKpiInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const onGuardar = async () => {
    if (!d.nombre.trim()) return toast({ title: "Falta el nombre", variant: "destructive" });
    if (!Number.isInteger(d.objetivo_mes) || d.objetivo_mes < 0) return toast({ title: "Objetivo no válido", variant: "destructive" });
    if (d.motivos.length === 0) return toast({ title: "Elige al menos un motivo", variant: "destructive" });
    try { await guardar.mutateAsync(d); toast({ title: "Línea guardada" }); onClose(); }
    catch (e) { toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" }); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{d.id ? "Editar línea KPI" : "Nueva línea KPI"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nombre</Label><Input value={d.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Objetivo al mes</Label><Input type="number" min={0} value={d.objetivo_mes} onChange={(e) => set("objetivo_mes", Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Umbral bonus</Label><Input type="number" min={0} placeholder={`${d.objetivo_mes * 2} (doble)`} value={d.umbral_bonus ?? ""} onChange={(e) => set("umbral_bonus", num(e.target.value))} /></div>
            <div className="space-y-1"><Label>Importe bonus (€)</Label><Input type="number" min={0} value={d.importe_bonus ?? ""} onChange={(e) => set("importe_bonus", num(e.target.value))} /></div>
            <div className="space-y-1"><Label>Orden</Label><Input type="number" value={d.orden} onChange={(e) => set("orden", Number(e.target.value))} /></div>
          </div>
          <div className="space-y-1">
            <Label>Regla de conteo</Label>
            <Select value={d.regla_conteo} onValueChange={(v) => set("regla_conteo", v as LineaKpiInput["regla_conteo"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REGLAS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Motivos que cuentan</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {motivos.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={d.motivos.includes(m.key)} onCheckedChange={(c) => set("motivos", c ? [...d.motivos, m.key] : d.motivos.filter((x) => x !== m.key))} />
                  {m.nombre}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={d.activo} onCheckedChange={(v) => set("activo", v)} /> Activa</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onGuardar} disabled={guardar.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
