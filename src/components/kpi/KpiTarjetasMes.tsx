import { useState } from "react";
import { Trophy } from "lucide-react";
import { useKpiLineas, useKpiResumen } from "@/hooks/useKpiVisitas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { KpiDetalleDialog } from "@/components/kpi/KpiDetalleDialog";
import type { KpiCelda } from "@/hooks/useKpiVisitas";

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/* ---------- Comercial: mes actual y anterior ---------- */
export function KpiTarjetasMes() {
  const hoy = new Date();
  const actual = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  const anterior = actual.mes === 1 ? { anio: actual.anio - 1, mes: 12 } : { anio: actual.anio, mes: actual.mes - 1 };
  const [sel, setSel] = useState<"actual" | "anterior">("actual");
  const p = sel === "actual" ? actual : anterior;
  const [celda, setCelda] = useState<KpiCelda | null>(null);

  const lineas = useKpiLineas();
  const resActual = useKpiResumen(actual.anio);
  const resAnterior = useKpiResumen(anterior.anio, anterior.anio !== actual.anio);
  const res = p.anio === actual.anio ? resActual : resAnterior;

  const filas = (res.data ?? []).filter((f) => f.mes === p.mes);
  const cargando = lineas.isLoading || res.isLoading;
  const error = lineas.error || res.error;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["anterior", "actual"] as const).map((k) => {
          const q = k === "actual" ? actual : anterior;
          return (
            <button
              key={k}
              onClick={() => setSel(k)}
              className={`rounded-md border px-3 py-2 text-sm capitalize transition-colors ${sel === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
            >
              {MESES_LARGOS[q.mes - 1]} {q.anio}
            </button>
          );
        })}
      </div>
      {cargando && <Skeleton className="h-48 w-full" />}
      {error && <Card><CardContent className="p-4 text-sm text-destructive">No se pudieron cargar los KPI: {(error as Error).message}</CardContent></Card>}
      {!cargando && !error && (lineas.data ?? []).map((l) => {
        const f = filas.find((x) => x.linea_id === l.id);
        const ok = f?.conseguidos ?? 0;
        const pend = f?.pendientes ?? 0;
        // Objetivo y umbral: los de la fila de kpi_resumen si existe; si el mes no tiene bloques, los de la línea.
        // Cuando existan metas por comercial, la meta de un mes sin bloques tendrá que venir del servidor.
        const objetivo = f?.objetivo ?? l.objetivo_mes;
        const umbral = f?.umbral ?? l.umbral_bonus ?? l.objetivo_mes * 2;
        const importe = f?.importe_bonus ?? l.importe_bonus;
        const pct = objetivo > 0 ? Math.min(100, (ok / objetivo) * 100) : 0;
        return (
          <Card key={l.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-start justify-between gap-2 text-base">
                <span>{l.nombre}</span>
                {ok >= umbral && <Badge className="shrink-0 gap-1"><Trophy className="h-3 w-3" /> Bonus</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={pct} />
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Dato label="Conseguidos" valor={ok} fuerte />
                <Dato label="Pendientes de validar" valor={pend} />
                <Dato label="Objetivo" valor={objetivo} />
                <Dato label="Bonus desde" valor={umbral} extra={importe ? eur(Number(importe)) : undefined} />
              </div>
              {f && (
                <Button size="sm" variant="outline" onClick={() => setCelda({ linea_id: l.id, linea: l.nombre, anio: p.anio, mes: p.mes, vendedor: f.vendedor })}>
                  Ver detalle
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
      <KpiDetalleDialog celda={celda} onClose={() => setCelda(null)} />
    </div>
  );
}

function Dato({ label, valor, fuerte, extra }: { label: string; valor: number; fuerte?: boolean; extra?: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={fuerte ? "text-lg font-semibold" : "text-lg"}>{valor}{extra && <span className="ml-1 text-xs text-muted-foreground">({extra})</span>}</div>
    </div>
  );
}

