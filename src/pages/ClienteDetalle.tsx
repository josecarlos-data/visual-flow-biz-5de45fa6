import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Phone, Mail, MapPin, Route as RouteIcon, Sparkles, Loader2,
  TrendingUp, TrendingDown, Package, Plus, AlertTriangle, Target, MessageSquareQuote,
  Truck, User, Info, ChevronDown, CalendarPlus, CalendarCheck,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useCliente, useClienteVentas, useClienteKpis, useClienteProductos, useClienteMix,
  useClienteVisitas, useMotivos, usePuedeVerMargen, useSituacionesVigentes, useClienteDocumentos, useVisitaBloques,
  useProximaPlanificada, useAgendaMutations,
  etiquetaCategoria, eur, num, eurK, fechaCorta, type DocumentoCliente, type Visita,
} from "@/hooks/useCrm";
import { ClientePerfilTab } from "@/components/ClientePerfilTab";
import { DocumentoLineasDialog } from "@/components/DocumentoLineasDialog";

/** Fecha local en formato ISO corto, mismo criterio que hoyISO() en useCrm. */
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fechaHoy = () => isoLocal(new Date());
const fechaManana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoLocal(d);
};


interface Insights {
  resumen: string;
  alertas: string[];
  oportunidades: string[];
  argumentario: string[];
  generado_en?: string;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export default function ClienteDetalle() {
  const { cod } = useParams();
  const [searchParams] = useSearchParams();
  const codNum = cod ? Number(cod) : null;

  const volverRaw = searchParams.get("volver");
  const volverTxtRaw = searchParams.get("volverTxt");
  const volver = volverRaw && volverRaw.startsWith("/") && !volverRaw.startsWith("//") ? volverRaw : "/clientes";
  const volverTxt = volverTxtRaw && volverTxtRaw.trim() ? decodeURIComponent(volverTxtRaw) : "Clientes";

  const { data: cliente, isLoading } = useCliente(codNum);
  const { data: ventas } = useClienteVentas(codNum);
  const { data: kpis } = useClienteKpis(codNum);
  const { data: mix } = useClienteMix(codNum);
  const { data: visitas } = useClienteVisitas(codNum);
  const { data: bloquesMap } = useVisitaBloques((visitas ?? []).map((v) => v.id));
  const { data: documentos } = useClienteDocumentos(codNum);

  const { data: motivos } = useMotivos();
  const { data: verMargen } = usePuedeVerMargen();
  const { mapa: situaciones } = useSituacionesVigentes();
  const situacion = codNum != null ? situaciones.get(codNum) : undefined;
  const [insights, setInsights] = useState<Insights | null>(null);
  const [anioProd, setAnioProd] = useState<string>("todos");
  const anioProdInicializado = useRef(false);
  const [docSeleccionado, setDocSeleccionado] = useState<DocumentoCliente | null>(null);
  const [dialogoLineasOpen, setDialogoLineasOpen] = useState(false);
  const [kpisAbiertos, setKpisAbiertos] = useState(false);

  // --- Agendar visita ---
  const { user } = useAuth();
  const { add: addPlanificada } = useAgendaMutations();
  const { data: proxima } = useProximaPlanificada(codNum);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [modoFecha, setModoFecha] = useState<"hoy" | "manana" | "otra">("hoy");
  const [fechaOtra, setFechaOtra] = useState<string>(fechaHoy());
  const [notasAgenda, setNotasAgenda] = useState("");
  const [guardandoAgenda, setGuardandoAgenda] = useState(false);

  const fechaElegida = modoFecha === "hoy" ? fechaHoy() : modoFecha === "manana" ? fechaManana() : fechaOtra;

  const guardarAgenda = async () => {
    if (!user || codNum == null || !fechaElegida) return;
    setGuardandoAgenda(true);
    try {
      const { count, error: errCount } = await supabase
        .from("visitas_planificadas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("fecha", fechaElegida);
      if (errCount) throw errCount;

      await addPlanificada.mutateAsync({
        user_id: user.id,
        cod_cliente: codNum,
        fecha: fechaElegida,
        orden: (count ?? 0) + 1,
        notas: notasAgenda.trim() ? notasAgenda.trim() : null,
      });

      toast({ title: "Visita agendada", description: `Añadida a tu agenda del ${fechaCorta(fechaElegida)}.` });
      setAgendarOpen(false);
      setNotasAgenda("");
      setModoFecha("hoy");
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "23505") {
        toast({ title: `Este cliente ya está en tu agenda del ${fechaCorta(fechaElegida)}` });
      } else {
        toast({ title: "No se ha podido agendar", description: err?.message, variant: "destructive" });
      }
    } finally {
      setGuardandoAgenda(false);
    }
  };

  const { data: productos, isLoading: cargandoProductos } = useClienteProductos(
    codNum,
    anioProd === "todos" ? null : Number(anioProd),
  );

  const { data: cached } = useQuery({
    queryKey: ["crm_insights", codNum],
    enabled: codNum != null,
    queryFn: async () => {
      const { data } = await supabase.from("cliente_insights").select("*").eq("cod_cliente", codNum!).maybeSingle();
      return (data as unknown as Insights) ?? null;
    },
  });

  const shown = insights ?? cached ?? null;

  const generar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cliente-insights", {
        body: { cod_cliente: codNum },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as Insights;
    },
    onSuccess: (d) => setInsights(d),
    onError: (e: Error) =>
      toast({ title: "No se ha podido generar el análisis", description: e.message, variant: "destructive" }),
  });

  const anios = useMemo(
    () => Array.from(new Set((ventas ?? []).map((v) => v.anio))).sort((a, b) => b - a),
    [ventas],
  );

  useEffect(() => {
    if (anios.length > 0 && !anioProdInicializado.current) {
      setAnioProd(String(anios[0]));
      anioProdInicializado.current = true;
    }
  }, [anios]);

  const anioActual = anios[0] ?? new Date().getFullYear();
  const anioPrevio = anioActual - 1;

  const porAnio = useMemo(() => {
    const map = new Map<number, number>();
    for (const v of ventas ?? []) map.set(v.anio, (map.get(v.anio) ?? 0) + Number(v.importe ?? 0));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([anio, total]) => ({ anio: String(anio), total }));
  }, [ventas]);

  const mensual = useMemo(() => {
    const base = MESES.map((m, i) => ({ mes: m, actual: 0, anterior: 0, _i: i + 1 }));
    for (const v of ventas ?? []) {
      const row = base[v.mes - 1];
      if (!row) continue;
      if (v.anio === anioActual) row.actual += Number(v.importe ?? 0);
      if (v.anio === anioPrevio) row.anterior += Number(v.importe ?? 0);
    }
    return base;
  }, [ventas, anioActual, anioPrevio]);

  const variacionYtd = useMemo(() => {
    if (!kpis || !kpis.importe_anio_anterior_ytd) return null;
    return ((kpis.importe_anio_actual - kpis.importe_anio_anterior_ytd) / kpis.importe_anio_anterior_ytd) * 100;
  }, [kpis]);

  const pctMargen = kpis && kpis.importe_anio_actual ? (kpis.margen_anio_actual / kpis.importe_anio_actual) * 100 : null;

  const topMix = (rows: { importe: number }[] & Record<string, unknown>[], key: string) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = String(r[key] ?? "SIN");
      map.set(k, (map.get(k) ?? 0) + Number(r.importe ?? 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nombre, importe]) => ({ nombre, importe }));
  };

  const topFamilias = useMemo(
    () => topMix((mix?.familias ?? []) as never, "familia"),
    [mix],
  );
  const topMarcas = useMemo(() => topMix((mix?.marcas ?? []) as never, "marca"), [mix]);

  const motivoNombre = (key: string | null) => motivos?.find((m) => m.key === key)?.nombre ?? key ?? "—";

  const antiguedad = useMemo(() => {
    if (!cliente?.fecha_alta) return null;
    const alta = new Date(`${cliente.fecha_alta}T00:00:00`);
    const anos = (Date.now() - alta.getTime()) / (365.25 * 24 * 3600 * 1000);
    return `${fechaCorta(cliente.fecha_alta)} (${num(anos, 1)} años)`;
  }, [cliente?.fecha_alta]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!cliente)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Cliente no encontrado o sin acceso.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Link to={volver} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {volverTxt}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{cliente.cliente}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>#{cliente.cod_cliente}</span>
            {cliente.localidad && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{cliente.localidad}</span>}
            {cliente.telefono && <a href={`tel:${cliente.telefono}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{cliente.telefono}</a>}
            {cliente.email && <a href={`mailto:${cliente.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="h-3.5 w-3.5" />{cliente.email}</a>}
            {cliente.vendedor && <Badge variant="secondary" className="gap-1"><User className="h-3 w-3" />{cliente.vendedor}</Badge>}
            {(cliente.ruta_comercial ?? cliente.ruta) && (
              <Badge variant="secondary" className="gap-1"><RouteIcon className="h-3 w-3" />Ruta {cliente.ruta_comercial ?? cliente.ruta}</Badge>
            )}
            {cliente.top_truck && <Badge className="gap-1"><Truck className="h-3 w-3" />Top Truck</Badge>}
          </div>
          {situacion && (
            <div className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <Info className="h-4 w-4" /> {situacion.etiqueta}
                <span className="font-normal text-muted-foreground">· {etiquetaCategoria(situacion.categoria)}</span>
              </p>
              {situacion.nota && <p className="mt-1 text-xs text-muted-foreground">{situacion.nota}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Desde {fechaCorta(situacion.desde)}{situacion.hasta ? ` hasta ${fechaCorta(situacion.hasta)}` : ""}
                {" · "}
                {situacion.efecto === "ocultar"
                  ? "no aparece en las alertas comerciales"
                  : situacion.efecto === "justificada"
                    ? "sigue en alertas, con la caída justificada"
                    : "solo informativa"}
              </p>
            </div>
          )}
          {cliente.prohibicion_venta && (
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> {cliente.prohibicion_venta}
            </p>
          )}

        </div>
        <Button asChild className="shrink-0">
          <Link to={`/visitas/nueva?cliente=${cliente.cod_cliente}`}>
            <Plus className="mr-2 h-4 w-4" /> Nueva visita
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ventas {anioActual}</p>
            <p className="mt-1 text-xl font-bold">{eur(kpis?.importe_anio_actual ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Variación vs. {anioPrevio} (mismo periodo)</p>
            <p className={`mt-1 flex items-center gap-1 text-xl font-bold ${variacionYtd == null ? "" : variacionYtd >= 0 ? "text-primary" : "text-destructive"}`}>
              {variacionYtd == null ? "—" : (
                <>
                  {variacionYtd >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {num(variacionYtd, 1)}%
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{eur(kpis?.importe_anio_anterior_ytd ?? 0)} en {anioPrevio}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ventas {anioPrevio} (año completo)</p>
            <p className="mt-1 text-xl font-bold">{eur(kpis?.importe_anio_anterior ?? 0)}</p>
          </CardContent>
        </Card>
        {verMargen && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Margen {anioActual}</p>
              <p className="mt-1 text-xl font-bold">{eur(kpis?.margen_anio_actual ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{pctMargen == null ? "—" : `${num(pctMargen, 1)}% sobre ventas`}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Transacciones {anioActual}</p>
            <p className="mt-1 text-xl font-bold">{num(kpis?.num_documentos_actual ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{num(kpis?.num_documentos_anterior ?? 0)} en {anioPrevio}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ticket medio {anioActual}</p>
            <p className="mt-1 text-xl font-bold">{eur(kpis?.ticket_medio_actual ?? 0, 2)}</p>
            <p className="text-xs text-muted-foreground">
              {kpis?.ticket_medio_anterior ? `${eur(kpis.ticket_medio_anterior, 2)} en ${anioPrevio}` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Frecuencia de compra</p>
            <p className="mt-1 text-xl font-bold">
              {kpis?.frecuencia_compra_dias ? `${num(kpis.frecuencia_compra_dias, 1)} días` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {num(kpis?.lineas_por_documento ?? 0, 1)} líneas por documento
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Referencias distintas</p>
            <p className="mt-1 text-xl font-bold">{num(kpis?.num_referencias ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{num(kpis?.num_lineas ?? 0)} líneas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Abonos</p>
            <p className="mt-1 text-xl font-bold">{num(kpis?.num_abonos ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{eur(Math.abs(kpis?.importe_abonos ?? 0))} devueltos</p>
          </CardContent>
        </Card>
        

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última compra</p>
            <p className="mt-1 text-sm font-semibold">{kpis?.ultima_compra ? fechaCorta(kpis.ultima_compra) : "Sin compras"}</p>
            <p className={`text-xs ${(kpis?.dias_sin_comprar ?? 0) > 90 ? "font-medium text-destructive" : "text-muted-foreground"}`}>
              {kpis?.dias_sin_comprar != null ? `${num(kpis.dias_sin_comprar)} días sin comprar` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última visita</p>
            <p className="mt-1 text-sm font-semibold">{visitas?.[0] ? fechaCorta(visitas[0].fecha) : "Sin visitas"}</p>
            <p className="text-xs text-muted-foreground">{num(visitas?.length ?? 0)} registradas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="visitas">Visitas</TabsTrigger>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="ia">Análisis IA</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Evolución de ventas por año</CardTitle></CardHeader>
              <CardContent className="h-64">
                {porAnio.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Sin datos de ventas.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porAnio} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                      <XAxis dataKey="anio" tickLine={false} axisLine={false} className="text-xs" />
                      <YAxis tickFormatter={eurK} tickLine={false} axisLine={false} className="text-xs" width={54} />
                      <Tooltip
                        formatter={(v: number) => eur(v)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Evolución mensual {anioActual} vs. {anioPrevio}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mensual} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} className="text-xs" />
                    <YAxis tickFormatter={eurK} tickLine={false} axisLine={false} className="text-xs" width={54} />
                    <Tooltip
                      formatter={(v: number) => eur(v)}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="anterior" name={String(anioPrevio)} stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="actual" name={String(anioActual)} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {[
              { title: "Top familias", rows: topFamilias },
              { title: "Top marcas", rows: topMarcas },
            ].map(({ title, rows }) => (
              <Card key={title}>
                <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
                <CardContent className="h-72">
                  {rows.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Sin datos.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                        <XAxis type="number" tickFormatter={eurK} tickLine={false} axisLine={false} className="text-xs" />
                        <YAxis type="category" dataKey="nombre" width={120} tickLine={false} axisLine={false} className="text-xs" />
                        <Tooltip
                          formatter={(v: number) => eur(v)}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                        />
                        <Bar dataKey="importe" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Datos de ficha</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
              <Dato label="Comercial" value={cliente.vendedor ? `${cliente.vendedor}${cliente.cod_vendedor ? ` (${cliente.cod_vendedor})` : ""}` : null} />
              <Dato label="Ruta comercial" value={cliente.ruta_comercial ?? cliente.ruta} />
              <Dato label="Ruta especial" value={cliente.ruta_especial} />
              <Dato label="Delegación" value={cliente.delegacion} />
              <Dato label="Tipo de cliente" value={cliente.cod_tipo_cliente} />
              <Dato label="Grupo" value={cliente.grupo} />
              <Dato label="Grupo rappel" value={cliente.grupo_rappel} />
              <Dato label="Tramos rappel" value={cliente.tramos_rappel} />
              <Dato label="Razón social" value={cliente.razon_social} />
              <Dato label="CIF" value={cliente.cif} />
              <Dato label="Persona de contacto" value={cliente.persona_contacto} />
              <Dato label="Teléfono" value={cliente.telefono} />
              <Dato label="Teléfono 2" value={cliente.telefono2} />
              <Dato label="Email" value={cliente.email} />
              <Dato label="Web" value={cliente.web} />
              <Dato label="Dirección" value={cliente.direccion} />
              <Dato label="Población" value={[cliente.cod_postal, cliente.localidad, cliente.provincia].filter(Boolean).join(" · ") || null} />
              <Dato label="Alta" value={antiguedad} />
              <Dato label="Empleados taller" value={cliente.num_empleados_taller != null ? num(cliente.num_empleados_taller) : null} />
              <Dato label="Primera compra" value={kpis?.primera_compra ? fechaCorta(kpis.primera_compra) : null} />
              <Dato label="Ventas históricas" value={kpis ? eur(kpis.importe_total) : null} />
              {verMargen && <Dato label="Margen histórico" value={kpis ? eur(kpis.margen_total) : null} />}
              {cliente.observaciones_almacen && (
                <div className="col-span-2 md:col-span-3 lg:col-span-4">
                  <p className="text-xs text-muted-foreground">Observaciones almacén</p>
                  <p className="whitespace-pre-wrap text-sm">{cliente.observaciones_almacen}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productos">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" />Productos comprados</CardTitle>
              <Select value={anioProd} onValueChange={setAnioProd}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los años</SelectItem>
                  {anios.map((a) => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              {cargandoProductos ? (
                <Skeleton className="m-4 h-64" />
              ) : !productos || productos.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Sin compras registradas en el periodo.</p>
              ) : (
                <div className="max-h-[560px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="hidden sm:table-cell">Familia</TableHead>
                        <TableHead className="hidden md:table-cell">Marca</TableHead>
                        <TableHead className="text-right">Uds.</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        {verMargen && <TableHead className="hidden text-right md:table-cell">Margen</TableHead>}
                        <TableHead className="hidden text-right sm:table-cell">Última</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productos.map((p) => (
                        <TableRow key={p.referencia}>
                          <TableCell className="max-w-[220px]">
                            <p className="truncate font-medium">{p.referencia}</p>
                            {p.descripcion && <p className="truncate text-xs text-muted-foreground">{p.descripcion}</p>}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">{p.familia ?? "—"}</TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{p.marca ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(p.unidades)}</TableCell>
                          <TableCell className="text-right tabular-nums">{eur(p.importe, 2)}</TableCell>
                          {verMargen && <TableCell className="hidden text-right tabular-nums md:table-cell">{eur(p.margen, 2)}</TableCell>}
                          <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{p.ultima_compra ? fechaCorta(p.ultima_compra) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Últimos documentos</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {(documentos?.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin documentos registrados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Registrado por</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos!.map((d) => (
                      <TableRow
                        key={d.id_documento}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setDocSeleccionado(d);
                          setDialogoLineasOpen(true);
                        }}
                      >
                        <TableCell className="whitespace-nowrap">{fechaCorta(d.fecha)}{d.hora ? ` ${d.hora.slice(0, 5)}` : ""}</TableCell>
                        <TableCell className="font-mono text-xs">{d.id_documento}</TableCell>
                        <TableCell>{d.operacion ?? d.tipo_documento ?? "—"}</TableCell>
                        <TableCell>{d.canal ?? "—"}</TableCell>
                        <TableCell className="truncate">{d.registrado_por ?? "—"}</TableCell>
                        <TableCell className="text-right">{num(d.lineas)}</TableCell>
                        <TableCell className={`text-right font-medium ${d.importe < 0 ? "text-destructive" : ""}`}>{eur(d.importe, 2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <DocumentoLineasDialog
            open={dialogoLineasOpen}
            onOpenChange={setDialogoLineasOpen}
            codCliente={codNum!}
            documento={docSeleccionado}
          />
        </TabsContent>

        <TabsContent value="visitas" className="space-y-3">

          {!visitas || visitas.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin visitas registradas.</CardContent></Card>
          ) : (
            visitas.map((v) => {
              const bloques = bloquesMap?.get(v.id) ?? [];
              return (
                <Card key={v.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {(bloques.length ? bloques.map((b) => b.motivo_key) : [v.motivo_key]).map((k, i) => (
                          <Badge key={`${k}-${i}`} variant="secondary">{motivoNombre(k)}</Badge>
                        ))}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{fechaCorta(v.fecha)}</span>
                    </div>
                    {bloques.length ? (
                      bloques.map((b) => (
                        <div key={b.id} className="space-y-1 rounded-md border p-2">
                          <p className="text-xs font-medium text-muted-foreground">{motivoNombre(b.motivo_key)}</p>
                          {Object.entries(b.campos ?? {}).filter(([, val]) => val).map(([k, val]) => (
                            <p key={k} className="text-sm">
                              <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
                              {String(val)}
                            </p>
                          ))}
                          {b.nota_revision && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Nota de revisión</p>
                              <p className="whitespace-pre-wrap text-sm">{b.nota_revision}</p>
                            </div>
                          )}
                        </div>

                      ))
                    ) : (
                      Object.entries(v.campos ?? {}).filter(([, val]) => val).map(([k, val]) => (
                        <p key={k} className="text-sm">
                          <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
                          {String(val)}
                        </p>
                      ))
                    )}
                    {bloques.length === 0 && v.observaciones && <p className="whitespace-pre-wrap text-sm">{v.observaciones}</p>}
                    {bloques.length > 0 && (v.transcripcion || v.observaciones_original) && (
                      <Collapsible>
                        <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <span>Ver texto original</span>
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {v.transcripcion ? "Transcripción original" : "Texto original de Gespromo"}
                          </p>
                          <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                            {v.transcripcion || v.observaciones_original}
                          </p>
                          {(v.analisis_modelo || v.analisis_prompt_version) && (
                            <p className="text-[11px] text-muted-foreground">
                              Analizada con {v.analisis_modelo ?? "—"} · {v.analisis_prompt_version ?? "—"}
                            </p>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {v.origen === "gespromo" && <Badge variant="outline" className="text-xs">Importada de Gespromo</Badge>}

                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="perfil">
          {codNum != null && <ClientePerfilTab cod={codNum} />}
        </TabsContent>


        <TabsContent value="ia" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {shown?.generado_en ? `Generado ${new Date(shown.generado_en).toLocaleString("es-ES")}` : "Sin análisis todavía"}
            </p>
            <Button onClick={() => generar.mutate()} disabled={generar.isPending}>
              {generar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {shown ? "Regenerar" : "Generar análisis"}
            </Button>
          </div>

          {shown && (
            <div className="space-y-3">
              <Card>
                <CardHeader><CardTitle className="text-base">Resumen</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed">{shown.resumen}</p></CardContent>
              </Card>
              {[
                { title: "Alertas", icon: AlertTriangle, items: shown.alertas },
                { title: "Oportunidades", icon: Target, items: shown.oportunidades },
                { title: "Argumentario para la próxima visita", icon: MessageSquareQuote, items: shown.argumentario },
              ].map(({ title, icon: Icon, items }) =>
                items?.length ? (
                  <Card key={title}>
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {items.map((it, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            {it}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null,
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
