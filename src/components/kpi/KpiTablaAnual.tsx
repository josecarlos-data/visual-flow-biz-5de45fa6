import { useMemo, useState } from "react";
import { useKpiLineas, useKpiResumen, type KpiFila } from "@/hooks/useKpiVisitas";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* ---------- Gestor: tabla anual mes × comercial ---------- */
export function KpiTablaAnual() {
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
