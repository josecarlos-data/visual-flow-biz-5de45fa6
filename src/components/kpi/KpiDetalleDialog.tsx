import { useState } from "react";
import { Download } from "lucide-react";
import { pedirTrazabilidad, useKpiTrazabilidad, type KpiCelda, type KpiTrazaFila } from "@/hooks/useKpiVisitas";
import { useIsMobile } from "@/hooks/use-mobile";
import { VisitaSoloLectura } from "@/components/kpi/VisitaSoloLectura";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const REGLA: Record<string, string> = {
  cliente_dia: "un cliente y motivo por día cuenta una vez",
  cliente_mes: "un cliente y motivo por mes cuenta una vez",
  bloque: "cada bloque cuenta una vez",
};
const TAM = 25;
const fechaEs = (f: string | null) => (f ? new Date(f.length <= 10 ? f + "T00:00:00" : f).toLocaleDateString("es-ES") : "");

export function KpiDetalleDialog({ celda, onClose }: { celda: KpiCelda | null; onClose: () => void }) {
  const [excl, setExcl] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [visita, setVisita] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);
  const movil = useIsMobile();
  const { toast } = useToast();
  const q = useKpiTrazabilidad(celda, excl, pagina, TAM);
  const d = q.data;
  const paginas = d ? Math.max(1, Math.ceil(d.total / TAM)) : 1;

  const cerrar = () => { setPagina(1); setExcl(false); onClose(); };

  const descargar = async () => {
    if (!celda) return;
    setBajando(true);
    try {
      const tam = 5000;
      const filas: KpiTrazaFila[] = [];
      let excluidos: KpiTrazaFila[] = [];
      for (let p = 1; ; p++) {
        const r = await pedirTrazabilidad(celda, excl && p === 1, p, tam);
        if (!r) break;
        filas.push(...r.filas);
        if (p === 1) excluidos = r.excluidos ?? [];
        if (p * tam >= r.total) break;
      }
      const cab = ["Fecha", "Semana ISO", "Cod. cliente", "Cliente", "Motivo", "Bloques", "Origen", "Estado", "Tipo de validación", "Revisor", "Revisado el", "Cuenta", "Motivo de exclusión", "Visitas"];
      const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lin = (f: KpiTrazaFila, cuenta: boolean) => [fechaEs(f.fecha), f.semana_iso, f.cod_cliente, f.cliente, f.motivo, f.bloques ?? 1, f.origen, f.estado,
        f.tipo_validacion ?? "", f.revisor, fechaEs(f.revisado_en), cuenta ? "Sí" : "No", f.motivo_exclusion ?? "", f.visitas.join(" ")].map(esc).join(";");
      const csv = "\uFEFF" + [cab.join(";"), ...filas.map((f) => lin(f, true)), ...excluidos.map((f) => lin(f, false))].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `kpi_${celda.linea.replace(/[^\p{L}\p{N}]+/gu, "_")}_${celda.vendedor.replace(/[^\p{L}\p{N}]+/gu, "_")}_${celda.anio}-${String(celda.mes).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "No se pudo descargar", description: (e as Error).message, variant: "destructive" });
    } finally { setBajando(false); }
  };

  const filas: { f: KpiTrazaFila; cuenta: boolean }[] = [
    ...(d?.filas ?? []).map((f) => ({ f, cuenta: true })),
    ...(excl && pagina === 1 ? (d?.excluidos ?? []).map((f) => ({ f, cuenta: false })) : []),
  ];

  return (
    <>
      <Dialog open={!!celda} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {celda?.linea} · {celda?.vendedor} · {celda ? `${MESES[celda.mes - 1]} ${celda.anio}` : ""}
            </DialogTitle>
          </DialogHeader>
          {q.isLoading && <Skeleton className="h-48 w-full" />}
          {q.error && <p className="text-sm text-destructive">No se pudo cargar el detalle: {(q.error as Error).message}</p>}
          {!q.isLoading && !q.error && !d && <p className="text-sm text-muted-foreground">No tienes acceso a este detalle.</p>}
          {d && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <p>
                  <strong>{d.resumen.bloques}</strong> bloques encontrados → <strong>{d.resumen.unidades}</strong> unidades ({REGLA[d.regla] ?? d.regla})
                  {" → "}<strong>{d.resumen.conseguidos}</strong> conseguidas y <strong>{d.resumen.pendientes}</strong> pendientes de validar.
                </p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(d.resumen.por_tipo).map(([k, n]) => <Badge key={k} variant="outline">{k}: {n}</Badge>)}
                  {excl && Object.entries(d.excluidos_por_motivo ?? {}).map(([k, n]) => <Badge key={k} variant="secondary">No cuenta · {k}: {n}</Badge>)}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch id="kpi-excl" checked={excl} onCheckedChange={(v) => { setExcl(v); setPagina(1); }} />
                  <Label htmlFor="kpi-excl">Ver también lo que no cuenta</Label>
                </div>
                <Button size="sm" variant="outline" onClick={descargar} disabled={bajando}>
                  <Download className="mr-1 h-4 w-4" /> {bajando ? "Preparando…" : "Descargar CSV"}
                </Button>
              </div>

              {filas.length === 0 && <p className="text-muted-foreground">Sin filas.</p>}
              {movil ? (
                <div className="space-y-2">
                  {filas.map(({ f, cuenta }, i) => (
                    <button key={i} onClick={() => setVisita(f.visitas[0])} className={`w-full rounded-md border p-3 text-left ${cuenta ? "" : "opacity-70"}`}>
                      <div className="flex justify-between gap-2"><span className="font-medium">{fechaEs(f.fecha)} · {f.semana_iso}</span><span>{f.estado}</span></div>
                      <p>{f.cod_cliente ?? ""} {f.cliente}</p>
                      <p className="text-muted-foreground">{f.motivo}{f.bloques && f.bloques > 1 ? ` · ${f.bloques} bloques` : ""} · {f.origen}</p>
                      <p className="text-xs">{cuenta ? f.tipo_validacion : `No cuenta: ${f.motivo_exclusion}`}{f.revisor ? ` · ${f.revisor} ${fechaEs(f.revisado_en)}` : ""}</p>
                    </button>
                  ))}
                </div>
              ) : filas.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead><TableHead>Semana</TableHead><TableHead>Cliente</TableHead><TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Bloques</TableHead><TableHead>Origen</TableHead><TableHead>Estado</TableHead>
                      <TableHead>Validación</TableHead><TableHead>Revisor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map(({ f, cuenta }, i) => (
                      <TableRow key={i} className={`cursor-pointer ${cuenta ? "" : "text-muted-foreground"}`} onClick={() => setVisita(f.visitas[0])}>
                        <TableCell className="whitespace-nowrap">{fechaEs(f.fecha)}</TableCell>
                        <TableCell className="whitespace-nowrap">{f.semana_iso}</TableCell>
                        <TableCell>{f.cod_cliente ?? ""} {f.cliente}</TableCell>
                        <TableCell>{f.motivo}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.bloques ?? 1}</TableCell>
                        <TableCell>{f.origen}</TableCell>
                        <TableCell>{f.estado}</TableCell>
                        <TableCell>{cuenta ? f.tipo_validacion : `No cuenta: ${f.motivo_exclusion}`}</TableCell>
                        <TableCell className="whitespace-nowrap">{f.revisor ? `${f.revisor} · ${fechaEs(f.revisado_en)}` : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {paginas > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
                  <span className="text-xs text-muted-foreground">Página {pagina} de {paginas}</span>
                  <Button size="sm" variant="outline" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
                </div>
              )}
              {excl && pagina > 1 && <p className="text-xs text-muted-foreground">Lo que no cuenta se muestra en la página 1.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <VisitaSoloLectura visitaId={visita} onClose={() => setVisita(null)} />
    </>
  );
}
