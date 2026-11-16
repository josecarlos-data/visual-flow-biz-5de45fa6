import { useMemo, useState } from "react";
import { Gauge, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useKpiLineas, useKpiResumen, type KpiFila } from "@/hooks/useKpiVisitas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function KpiVisitas() {
  const { role } = useAuth();
  const gestor = role === "admin" || role === "director_comercial" || role === "jefe_de_zona";
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Gauge className="h-5 w-5 text-primary" /> KPI visitas
      </h1>
      {gestor ? <VistaGestor /> : <VistaComercial />}
    </div>
  );
}

/* ---------- Comercial: mes actual y anterior ---------- */
function VistaComercial() {
  const hoy = new Date();
  const actual = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  const anterior = actual.mes === 1 ? { anio: actual.anio - 1, mes: 12 } : { anio: actual.anio, mes: actual.mes - 1 };
  const [sel, setSel] = useState<"actual" | "anterior">("actual");
  const p = sel === "actual" ? actual : anterior;

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
        const umbral = l.umbral_bonus ?? l.objetivo_mes * 2;
        const pct = l.objetivo_mes > 0 ? Math.min(100, (ok / l.objetivo_mes) * 100) : 0;
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
                <Dato label="Objetivo" valor={l.objetivo_mes} />
                <Dato label="Bonus desde" valor={umbral} extra={l.importe_bonus ? eur(Number(l.importe_bonus)) : undefined} />
              </div>
            </CardContent>
          </Card>
        );
      })}
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

/* ---------- Gestor: tabla anual mes × comercial ---------- */
function VistaGestor() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [lineaSel, setLineaSel] = useState("todas");
  const lineas = useKpiLineas();
  const res = useKpiResumen(anio);

  const { comerciales, celdas } = useMemo(() => {
    const filas = (res.data ?? []).filter((f) => lineaSel === "todas" || f.linea_id === lineaSel);
    const mapa = new Map<string, { sin_usuario: boolean; meses: Map<number, { ok: number; pend: number; bonus: boolean }> }>();
    filas.forEach((f: KpiFila) => {
      const c = mapa.get(f.vendedor) ?? { sin_usuario: f.sin_usuario, meses: new Map() };
      c.sin_usuario = c.sin_usuario && f.sin_usuario;
      const m = c.meses.get(f.mes) ?? { ok: 0, pend: 0, bonus: false };
      m.ok += f.conseguidos; m.pend += f.pendientes; m.bonus = m.bonus || f.bonus;
      c.meses.set(f.mes, m);
      mapa.set(f.vendedor, c);
    });
    return { comerciales: Array.from(mapa.keys()).sort((a, b) => a.localeCompare(b, "es")), celdas: mapa };
  }, [res.data, lineaSel]);

  const totalMes = (mes: number) => comerciales.reduce((s, v) => s + (celdas.get(v)?.meses.get(mes)?.ok ?? 0), 0);
  const totalAnio = (v: string) => Array.from(celdas.get(v)?.meses.values() ?? []).reduce((s, m) => s + m.ok, 0);
  const pendAnio = (v: string) => Array.from(celdas.get(v)?.meses.values() ?? []).reduce((s, m) => s + m.pend, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[anioActual, anioActual - 1].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={lineaSel} onValueChange={setLineaSel}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las líneas</SelectItem>
            {(lineas.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">Conseguidos (validados correctos); entre paréntesis, pendientes de validar. ★ = bonus alcanzado en alguna línea.</p>

      {res.isLoading && <Skeleton className="h-64 w-full" />}
      {res.error && <Card><CardContent className="p-4 text-sm text-destructive">No se pudieron cargar los KPI: {(res.error as Error).message}</CardContent></Card>}
      {!res.isLoading && !res.error && comerciales.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No hay visitas que cuenten para KPI en {anio}.</CardContent></Card>
      )}
      {comerciales.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">Comercial</TableHead>
                  {MESES.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                  <TableHead className="text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comerciales.map((v) => {
                  const c = celdas.get(v)!;
                  return (
                    <TableRow key={v}>
                      <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap">
                        {v}
                        {c.sin_usuario && <Badge variant="outline" className="ml-2 text-xs">sin usuario</Badge>}
                      </TableCell>
                      {MESES.map((_, i) => {
                        const m = c.meses.get(i + 1);
                        return (
                          <TableCell key={i} className="text-right tabular-nums whitespace-nowrap">
                            {m ? <>{m.ok}{m.pend > 0 && <span className="text-xs text-muted-foreground"> ({m.pend})</span>}{m.bonus && <span className="text-primary"> ★</span>}</> : <span className="text-muted-foreground">·</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                        {totalAnio(v)}{pendAnio(v) > 0 && <span className="text-xs font-normal text-muted-foreground"> ({pendAnio(v)})</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-muted">Total</TableCell>
                  {MESES.map((_, i) => <TableCell key={i} className="text-right tabular-nums">{totalMes(i + 1) || ""}</TableCell>)}
                  <TableCell className="text-right tabular-nums">{comerciales.reduce((s, v) => s + totalAnio(v), 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
