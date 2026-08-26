import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { eur } from "@/hooks/useCrm";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { getYearColor } from "@/lib/yearColors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SituacionBadge } from "@/components/SituacionBadge";
import { ResumenObjetivos } from "@/components/ResumenObjetivos";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, TrendingDown, Percent, Users, Euro, Package, Receipt, RotateCcw } from "lucide-react";
import { num as fnum, pct } from "@/lib/format";


const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const VALORES_SINTETICOS = new Set(["Sin canal", "Sin motivo", "Sin asignar"]);
const esSintetico = (v: string | null) => !v || VALORES_SINTETICOS.has(v);

interface MensualRow { anio: number; mes: number; importe: number; margen: number; unidades: number; documentos: number; ticket_medio: number }
interface KpiRow { anio: number; importe: number; margen: number; unidades: number; clientes: number; lineas: number; documentos: number; abonos: number; importe_abonos: number; ticket_medio: number }
interface TopCliente { cod_cliente: number; cliente: string; vendedor: string | null; importe: number; margen: number }
interface TopDim { importe: number; margen: number; familia?: string; marca?: string }
interface CanalRow { canal: string; documentos: number; importe: number; margen: number; ticket_medio: number; clientes: number }
interface DevolucionRow { tipo: string; etiqueta: string; descripcion: string | null; importe: number; lineas: number }

interface AlertaRow {
  tipo: string;
  cod_cliente: number;
  cliente: string;
  vendedor: string | null;
  valor: number;
  valor_ref: number;
  dias: number | null;
  etiqueta: string | null;
  situacion_categoria: string | null;
  situacion_efecto: string | null;
}

type VistaAlertas = "atencion" | "justificadas" | "todos";

const num = (v: unknown) => Number(v ?? 0);

export default function Ventas() {
  const { verMargen } = useAuth();
  const [loading, setLoading] = useState(true);
  useScrollRestore("ventas", !loading);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mensual, setMensual] = useState<MensualRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [topClientes, setTopClientes] = useState<TopCliente[]>([]);
  const [topFamilias, setTopFamilias] = useState<TopDim[]>([]);
  const [topMarcas, setTopMarcas] = useState<TopDim[]>([]);
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [canales, setCanales] = useState<CanalRow[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionRow[]>([]);
  const [vistaAlertas, setVistaAlertas] = useState<VistaAlertas>("atencion");
  const [metrica, setMetrica] = useState<"ventas" | "ticket">("ventas");
  const [vista, setVista] = useState<"mensual" | "acumulada">("mensual");


  const anioActual = useMemo(
    () => (kpis.length ? Math.max(...kpis.map((k) => k.anio)) : new Date().getFullYear()),
    [kpis]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [mRes, kRes, aRes] = await Promise.all([
        supabase.rpc("panel_ventas_mensual" as any),
        supabase.rpc("panel_ventas_kpis" as any),
        supabase.rpc("panel_alertas" as any, { _limite: 25, _incluir_excluidos: true } as any),
      ]);
      const err = mRes.error ?? kRes.error ?? aRes.error;
      setErrorMsg(err ? err.message : null);
      setMensual(((mRes.data as any[]) ?? []).map((r) => ({
        anio: num(r.anio), mes: num(r.mes), importe: num(r.importe), margen: num(r.margen), unidades: num(r.unidades),
        documentos: num(r.documentos), ticket_medio: num(r.ticket_medio),
      })));
      setKpis(((kRes.data as any[]) ?? []).map((r) => ({
        anio: num(r.anio), importe: num(r.importe), margen: num(r.margen), unidades: num(r.unidades),
        clientes: num(r.clientes), lineas: num(r.lineas), documentos: num(r.documentos),
        abonos: num(r.abonos), importe_abonos: num(r.importe_abonos), ticket_medio: num(r.ticket_medio),
      })));

      setAlertas(((aRes.data as any[]) ?? []).map((r) => ({
        tipo: r.tipo, cod_cliente: num(r.cod_cliente), cliente: r.cliente, vendedor: r.vendedor,
        valor: num(r.valor), valor_ref: num(r.valor_ref), dias: r.dias === null ? null : num(r.dias),
        etiqueta: r.etiqueta ?? null, situacion_categoria: r.situacion_categoria ?? null,
        situacion_efecto: r.situacion_efecto ?? null,
      })));
      setLoading(false);
    })();
  }, []);



  useEffect(() => {
    if (!anioActual) return;
    (async () => {
      const [cRes, fRes, brRes, canRes, devRes] = await Promise.all([
        supabase.rpc("panel_top_clientes" as any, { _anio: anioActual, _limite: 10 } as any),
        supabase.rpc("panel_top_familias" as any, { _anio: anioActual, _limite: 10 } as any),
        supabase.rpc("panel_top_marcas" as any, { _anio: anioActual, _limite: 10 } as any),
        supabase.rpc("panel_canales" as any, { _anio: anioActual } as any),
        supabase.rpc("panel_devoluciones" as any, { _anio: anioActual, _limite: 8 } as any),
      ]);
      const err2 = cRes.error ?? fRes.error ?? brRes.error ?? canRes.error ?? devRes.error;
      if (err2) setErrorMsg(err2.message);
      setTopClientes(((cRes.data as any[]) ?? []).map((r) => ({
        cod_cliente: num(r.cod_cliente), cliente: r.cliente, vendedor: r.vendedor,
        importe: num(r.importe), margen: num(r.margen),
      })));
      setTopFamilias(((fRes.data as any[]) ?? []).map((r) => ({ familia: r.familia ?? "Sin familia", importe: num(r.importe), margen: num(r.margen) })));
      setTopMarcas(((brRes.data as any[]) ?? []).map((r) => ({ marca: r.marca ?? "Sin marca", importe: num(r.importe), margen: num(r.margen) })));
      setCanales(((canRes.data as any[]) ?? []).map((r) => ({
        canal: r.canal ?? "Sin canal", documentos: num(r.documentos), importe: num(r.importe),
        margen: num(r.margen), ticket_medio: num(r.ticket_medio), clientes: num(r.clientes),
      })));
      setDevoluciones(((devRes.data as any[]) ?? []).map((r) => ({
        tipo: r.tipo, etiqueta: r.etiqueta ?? "—", descripcion: r.descripcion ?? null,
        importe: num(r.importe), lineas: num(r.lineas),
      })));
    })();


  }, [anioActual]);

  const anios = useMemo(() => [...new Set(mensual.map((m) => m.anio))].sort(), [mensual]);


  const serieTicket = useMemo(() => {
    return MESES.map((nombre, i) => {
      const row: Record<string, number | string> = { mes: nombre };
      anios.forEach((a) => {
        const f = mensual.find((m) => m.anio === a && m.mes === i + 1);
        if (f && f.documentos > 0) row[String(a)] = Math.round(f.ticket_medio);
      });
      return row;
    });
  }, [mensual, anios]);


  const kpiActual = kpis.find((k) => k.anio === anioActual);
  const kpiPrevio = kpis.find((k) => k.anio === anioActual - 1);

  // YTD comparable: mismo número de meses con datos
  const mesesConDatos = mensual.filter((m) => m.anio === anioActual).length;
  const ytdPrevio = mensual
    .filter((m) => m.anio === anioActual - 1 && m.mes <= mesesConDatos)
    .reduce((s, m) => s + m.importe, 0);
  const totalAnioPrevio = mensual
    .filter((m) => m.anio === anioActual - 1)
    .reduce((s, m) => s + m.importe, 0);
  const proyeccion = ytdPrevio > 0 && kpiActual ? kpiActual.importe * (totalAnioPrevio / ytdPrevio) : null;
  const variacion = ytdPrevio > 0 && kpiActual ? ((kpiActual.importe - ytdPrevio) / ytdPrevio) * 100 : null;
  const margenPct = kpiActual && kpiActual.importe > 0 ? (kpiActual.margen / kpiActual.importe) * 100 : 0;
  const ticketVar =
    kpiActual && kpiPrevio && kpiPrevio.ticket_medio > 0
      ? ((kpiActual.ticket_medio - kpiPrevio.ticket_medio) / kpiPrevio.ticket_medio) * 100
      : null;
  // Tasa de devolución: importe abonado sobre la venta bruta (neto + abonos).
  const tasaDevolucion = (() => {
    if (!kpiActual) return 0;
    const abonos = Math.abs(kpiActual.importe_abonos);
    const bruto = kpiActual.importe + abonos;
    return bruto > 0 ? (abonos / bruto) * 100 : 0;
  })();

  // Peso de los clientes listados sobre la cartera total del año (sin nuevas consultas).
  const shareTopClientes =
    kpiActual && kpiActual.importe > 0
      ? (topClientes.reduce((s, c) => s + c.importe, 0) / kpiActual.importe) * 100
      : null;

  const fmtShare = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
  const fmtM = (v: number) => `${(v / 1_000_000).toFixed(1).replace(".", ",")} M €`;

  // Último mes del año en curso con dato real (no el conteo de meses).
  const ultimoMesConDato = Math.max(...mensual.filter((m) => m.anio === anioActual).map((m) => m.mes), 0);
  const factorProy = ytdPrevio > 0 && kpiActual ? kpiActual.importe / ytdPrevio : null;

  const datosGrafico = useMemo(() => {
    if (metrica === "ticket") return serieTicket;

    const rows: Record<string, number | string>[] = MESES.map((nombre) => ({ mes: nombre }));
    const acum: Record<string, number> = {};
    anios.forEach((a) => {
      for (let i = 0; i < 12; i++) {
        const f = mensual.find((m) => m.anio === a && m.mes === i + 1);
        if (!f) continue;
        if (vista === "acumulada") {
          acum[String(a)] = (acum[String(a)] || 0) + f.importe;
          rows[i][String(a)] = Math.round(acum[String(a)]);
        } else {
          rows[i][String(a)] = Math.round(f.importe);
        }
      }
    });

    if (factorProy !== null && ultimoMesConDato > 0) {
      const ancla = mensual.find((m) => m.anio === anioActual && m.mes === ultimoMesConDato);
      let corr = vista === "acumulada" ? acum[String(anioActual)] || 0 : 0;
      rows[ultimoMesConDato - 1].proyeccion = Math.round(vista === "acumulada" ? corr : ancla?.importe || 0);
      for (let m = ultimoMesConDato + 1; m <= 12; m++) {
        const prev = mensual.find((x) => x.anio === anioActual - 1 && x.mes === m);
        const v = (prev?.importe || 0) * factorProy;
        if (vista === "acumulada") {
          corr += v;
          rows[m - 1].proyeccion = Math.round(corr);
        } else {
          rows[m - 1].proyeccion = Math.round(v);
        }
      }
    }

    return rows;
  }, [metrica, vista, serieTicket, mensual, anios, anioActual, factorProy, ultimoMesConDato]);




  const alertasPorTipo = (tipo: string) => {
    const delTipo = alertas.filter((a) => a.tipo === tipo);
    const visibles =
      vistaAlertas === "todos"
        ? delTipo
        : vistaAlertas === "justificadas"
          ? delTipo.filter((a) => a.situacion_efecto === "justificada")
          : delTipo.filter((a) => a.situacion_efecto !== "ocultar");
    // En "Atención" las caídas justificadas van al final: son reales, pero ya tienen explicación.
    return [...visibles]
      .sort((a, b) => Number(a.situacion_efecto === "justificada") - Number(b.situacion_efecto === "justificada"))
      .slice(0, 10);
  };

  const ocultasPorSituacion = alertas.filter((a) => a.situacion_efecto === "ocultar").length;
  const justificadas = alertas.filter((a) => a.situacion_efecto === "justificada").length;


  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className={`grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 ${verMargen ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
          {(verMargen ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]).map((i) => <Skeleton key={i} className="h-24" />)}
        </div>

        <Skeleton className="h-[260px] sm:h-[300px]" />

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2 2xl:col-span-1" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <div className="grid gap-4">
            <Skeleton className="h-[200px]" />
            <Skeleton className="h-[200px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Panel de Ventas</h1>
        <p className="text-muted-foreground">Rendimiento, rentabilidad y alertas comerciales {anioActual}</p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No se han podido cargar algunos datos: {errorMsg}</span>
        </div>
      )}
      <ResumenObjetivos />


      <div className={`grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 ${verMargen ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>

        <Kpi
          icon={<Euro className="h-4 w-4" />}
          label={`Facturación ${anioActual}`}
          value={eur(kpiActual?.importe ?? 0)}
          hint={
            variacion !== null
              ? `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}% vs ${anioActual - 1} YTD${proyeccion !== null ? ` · proyección ${fmtM(proyeccion)}` : ""}`
              : undefined
          }
          positive={variacion !== null ? variacion >= 0 : undefined}
        />
        {verMargen && (
          <Kpi
            icon={<Percent className="h-4 w-4" />}
            label="Margen"
            value={eur(kpiActual?.margen ?? 0)}
            hint={`${margenPct.toFixed(1)}% sobre ventas`}
          />
        )}
        <Kpi icon={<Users className="h-4 w-4" />} label="Clientes activos" value={String(kpiActual?.clientes ?? 0)} hint={`${kpiPrevio?.clientes ?? 0} en ${anioActual - 1}`} />
        <Kpi
          icon={<Receipt className="h-4 w-4" />}
          label="Documentos"
          value={fnum(kpiActual?.documentos ?? 0)}
          hint={`${fnum(kpiActual?.abonos ?? 0)} abonos · ${fnum(kpiActual?.lineas ?? 0)} líneas`}
        />
        <Kpi
          icon={<Package className="h-4 w-4" />}
          label="Ticket medio"
          value={eur(kpiActual?.ticket_medio ?? 0, 2)}
          hint={ticketVar !== null ? `${ticketVar >= 0 ? "+" : ""}${ticketVar.toFixed(1)}% vs ${anioActual - 1}` : undefined}
          positive={ticketVar !== null ? ticketVar >= 0 : undefined}
        />
        <Kpi
          icon={<RotateCcw className="h-4 w-4" />}
          label="Tasa de devolución"
          value={pct(tasaDevolucion)}
          hint={`${eur(Math.abs(kpiActual?.importe_abonos ?? 0))} abonados`}
          positive={tasaDevolucion <= 5}
        />

      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Evolución mensual</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex shrink-0 rounded-md border p-0.5">
              {([
                { key: "ventas", label: "Ventas" },
                { key: "ticket", label: "Ticket medio" },
              ] as { key: "ventas" | "ticket"; label: string }[]).map((m) => (
                <Button
                  key={m.key}
                  size="sm"
                  variant={metrica === m.key ? "secondary" : "ghost"}
                  className="h-7 px-3 text-[11px]"
                  onClick={() => setMetrica(m.key)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
            {metrica === "ventas" && (
              <div className="inline-flex shrink-0 rounded-md border p-0.5">
                {([
                  { key: "mensual", label: "Mensual" },
                  { key: "acumulada", label: "Acumulada" },
                ] as { key: "mensual" | "acumulada"; label: string }[]).map((v) => (
                  <Button
                    key={v.key}
                    size="sm"
                    variant={vista === v.key ? "secondary" : "ghost"}
                    className="h-7 px-3 text-[11px]"
                    onClick={() => setVista(v.key)}
                  >
                    {v.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-[260px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datosGrafico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              {metrica === "ticket" ? (
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => eur(Number(v))} width={55} />
              ) : (
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              )}
              <Tooltip
                formatter={(v, name) => [
                  metrica === "ticket" ? eur(Number(v), 2) : eur(Number(v)),
                  name === "proyeccion" ? "Proyección" : (name as string),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {anios.map((a) => (
                <Line key={a} type="monotone" dataKey={String(a)} stroke={getYearColor(a, anioActual)} strokeWidth={a === anioActual ? 2.5 : 1.5} dot={false} />
              ))}
              {metrica === "ventas" && factorProy !== null && (
                <Line
                  type="monotone"
                  dataKey="proyeccion"
                  stroke={getYearColor(anioActual, anioActual)}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                  legendType="none"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Mix por canal {anioActual}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {canales.length === 0 && <Vacio />}
            {canales.map((c) => {
              const total = canales.reduce((s, x) => s + x.importe, 0);
              const share = total > 0 ? (c.importe / total) * 100 : 0;
              const ancho = Math.max(0, Math.min(100, share));
              const contenido = (
                <>
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{c.canal}</span>
                    <span className="shrink-0 font-medium">{eur(c.importe)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${share < 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${ancho.toFixed(1)}%` }} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {pct(share)} · {fnum(c.documentos)} transacciones · ticket {eur(c.ticket_medio, 2)} · {fnum(c.clientes)} clientes
                  </div>
                </>
              );
              const esLink = !esSintetico(c.canal);
              return esLink ? (
                <Link key={c.canal} to={`/documentos?anio=${anioActual}&canal=${encodeURIComponent(c.canal)}&importeMin=0&volver=%2F&volverTxt=Ventas`} className="block rounded-md border p-2 text-sm transition-colors hover:bg-accent">
                  {contenido}
                </Link>
              ) : (
                <div key={c.canal} className="rounded-md border p-2 text-sm">
                  {contenido}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Devoluciones {anioActual}</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="motivo">
              <TabsList className="mb-3">
                <TabsTrigger value="motivo">Motivos</TabsTrigger>
                <TabsTrigger value="referencia">Referencias</TabsTrigger>
                <TabsTrigger value="vendedor">Vendedores</TabsTrigger>
              </TabsList>
              {["motivo", "referencia", "vendedor"].map((t) => {
                const filas = devoluciones.filter((d) => d.tipo === t);
                return (
                  <TabsContent key={t} value={t} className="space-y-2">
                    {filas.length === 0 && <Vacio />}
                    {filas.map((d) => {
                      const esLink = t === "motivo" && !esSintetico(d.etiqueta);
                      const contenido = (
                        <>
                          <span className="min-w-0 truncate">{d.etiqueta}</span>
                          <span className="shrink-0 text-right">
                            <span className="font-medium">{eur(d.importe)}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{fnum(d.lineas)} líneas</span>
                          </span>
                        </>
                      );
                      return esLink ? (
                        <Link key={`${t}-${d.etiqueta}`} to={`/documentos?anio=${anioActual}&operacion=Abono&motivoAbono=${encodeURIComponent(d.etiqueta)}&importeMin=0&volver=%2F&volverTxt=Ventas`} className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-2 text-sm transition-colors hover:bg-accent">
                          {contenido}
                        </Link>
                      ) : (
                        <div key={`${t}-${d.etiqueta}`} className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-2 text-sm">
                          {contenido}
                        </div>
                      );
                    })}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 2xl:col-span-1">
          <CardHeader className="flex flex-col gap-3">
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Alertas comerciales</CardTitle>
            <div className="inline-flex shrink-0 rounded-md border p-0.5">
              {([
                { key: "atencion", label: "Atención" },
                { key: "justificadas", label: "Justificadas" },
                { key: "todos", label: "Todos" },
              ] as { key: VistaAlertas; label: string }[]).map((v) => (
                <Button
                  key={v.key}
                  size="sm"
                  variant={vistaAlertas === v.key ? "secondary" : "ghost"}
                  className="h-7 px-3 text-[11px]"
                  onClick={() => setVistaAlertas(v.key)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {vistaAlertas !== "todos" && (ocultasPorSituacion > 0 || justificadas > 0) && (
              <p className="mb-3 text-xs text-muted-foreground">
                {[
                  ocultasPorSituacion > 0 ? `${ocultasPorSituacion} oculto${ocultasPorSituacion > 1 ? "s" : ""} por situación` : null,
                  justificadas > 0 ? `${justificadas} con caída justificada` : null,
                ].filter(Boolean).join(" · ")}.{" "}
                <button type="button" className="underline hover:text-foreground" onClick={() => setVistaAlertas("todos")}>Ver todos</button>
              </p>
            )}
            <Tabs defaultValue="caida">
              <TabsList className="mb-3">
                <TabsTrigger value="caida">Caídas ({alertasPorTipo("caida").length})</TabsTrigger>
                <TabsTrigger value="fuga">Riesgo fuga ({alertasPorTipo("fuga").length})</TabsTrigger>
                {verMargen && <TabsTrigger value="margen_bajo">Margen bajo ({alertasPorTipo("margen_bajo").length})</TabsTrigger>}
              </TabsList>

              <TabsContent value="caida" className="space-y-2">
                {alertasPorTipo("caida").length === 0 && <Vacio />}
                {alertasPorTipo("caida").map((a) => (
                  <FilaAlerta key={`c-${a.cod_cliente}`} a={a}
                    detalle={`${eur(a.valor)} vs ${eur(a.valor_ref)} el año pasado`}
                    badge={<Badge variant="destructive" className="shrink-0"><TrendingDown className="mr-1 h-3 w-3" />{a.valor_ref > 0 ? `${(((a.valor - a.valor_ref) / a.valor_ref) * 100).toFixed(0)}%` : "—"}</Badge>} />
                ))}
              </TabsContent>

              <TabsContent value="fuga" className="space-y-2">
                {alertasPorTipo("fuga").length === 0 && <Vacio />}
                {alertasPorTipo("fuga").map((a) => (
                  <FilaAlerta key={`f-${a.cod_cliente}`} a={a}
                    detalle={`Histórico ${eur(a.valor)}`}
                    badge={<Badge variant="outline" className="shrink-0">{a.dias} días sin comprar</Badge>} />
                ))}
              </TabsContent>

              {verMargen && (
                <TabsContent value="margen_bajo" className="space-y-2">
                  {alertasPorTipo("margen_bajo").length === 0 && <Vacio />}
                  {alertasPorTipo("margen_bajo").map((a) => (
                    <FilaAlerta key={`m-${a.cod_cliente}`} a={a}
                      detalle={`${eur(a.valor)} facturados`}
                      badge={<Badge variant="secondary" className="shrink-0">{a.valor_ref.toFixed(1)}% margen</Badge>} />
                  ))}
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 clientes {anioActual}</CardTitle>
            {shareTopClientes !== null && (
              <CardDescription>
                Estos {topClientes.length} clientes representan el {fmtShare(shareTopClientes)} de tu cartera
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {topClientes.map((c, i) => (
              <Link key={c.cod_cliente} to={`/clientes/${c.cod_cliente}?volver=${encodeURIComponent('/')}&volverTxt=${encodeURIComponent('Ventas')}`} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm transition-colors hover:bg-accent">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="truncate">{c.cliente}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-medium">{eur(c.importe)}</span>
                  {shareTopClientes !== null && (
                    <span className="block text-xs text-muted-foreground">
                      {fmtShare((c.importe / kpiActual!.importe) * 100)} de cartera
                    </span>
                  )}
                  {verMargen && c.importe > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">{((c.margen / c.importe) * 100).toFixed(1)}%</span>
                  )}
                </span>
              </Link>
            ))}
            {topClientes.length === 0 && <Vacio />}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle>Top familias {anioActual}</CardTitle></CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFamilias} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis type="category" dataKey="familia" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(v) => eur(Number(v))} />
                  <Bar dataKey="importe" fill={getYearColor(anioActual, anioActual)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top marcas {anioActual}</CardTitle></CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMarcas} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis type="category" dataKey="marca" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(v) => eur(Number(v))} />
                  <Bar dataKey="importe" fill={getYearColor(anioActual - 1, anioActual)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, hint, positive }: { icon: React.ReactNode; label: string; value: string; hint?: string; positive?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground sm:gap-2 sm:text-xs">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
        {hint && (
          <div className={`mt-0.5 whitespace-normal break-words leading-tight text-[11px] sm:text-xs ${positive === undefined ? "text-muted-foreground" : positive ? "text-primary" : "text-destructive"}`}>{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}


function FilaAlerta({ a, detalle, badge }: { a: AlertaRow; detalle: string; badge: React.ReactNode }) {
  const atenuada = a.situacion_efecto === "justificada" || a.situacion_efecto === "ocultar";
  return (
    <Link
      to={`/clientes/${a.cod_cliente}?volver=${encodeURIComponent('/')}&volverTxt=${encodeURIComponent('Ventas')}`}
      className={`flex items-center justify-between gap-3 rounded-md border p-2 text-sm transition-colors hover:bg-accent ${atenuada ? "opacity-70" : ""}`}
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{a.cliente}</span>
          {a.etiqueta && (
            <SituacionBadge
              className="shrink-0"
              situacion={{
                etiqueta: a.etiqueta,
                categoria: a.situacion_categoria ?? "otros",
                nota: null,
                efecto: a.situacion_efecto,
              }}
            />
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{detalle}{a.vendedor ? ` · ${a.vendedor}` : ""}</span>
      </span>

      {badge}
    </Link>
  );
}

function Vacio() {
  return <p className="py-4 text-center text-sm text-muted-foreground">Sin registros</p>;
}
