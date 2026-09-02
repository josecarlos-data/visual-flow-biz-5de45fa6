import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Phone, Mail, MapPin, Route as RouteIcon, Sparkles, Loader2,
  TrendingUp, TrendingDown, Package, Plus, AlertTriangle, Target, MessageSquareQuote,
  Truck, User, Info, ChevronDown, ChevronUp, CalendarPlus, CalendarCheck, Search,
} from "lucide-react";
import { useQuery, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
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
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useCliente, useClienteVentas, useClienteKpis, useClienteProductos, useClienteMix,
  useClienteVisitas, useMotivos, usePuedeVerMargen, useSituacionesVigentes, useClienteDocumentos, useVisitaBloques,
  useProximaPlanificada, useAgendaMutations,
  etiquetaCategoria, eur, num, eurK, fechaCorta, type DocumentoCliente, type Visita, type ProductoCliente, type RangoProductos,
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

/** Modelos disponibles para las pruebas comparativas (lista blanca de la edge function). */
const MODELOS_IA = ["openai/gpt-5.5", "openai/gpt-5.6-luna", "openai/gpt-5.6-terra", "openai/gpt-5.6-sol"];

interface MetaPrueba {
  modelo: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duracion_ms: number | null;
}

type PruebaRespuesta = Insights & { _meta?: MetaPrueba };

interface PruebaModelo {
  modelo: string;
  meta: MetaPrueba | null;
  resumen: string;
  alertas: string[];
  oportunidades: string[];
  argumentario: string[];
}

type CampoOrden = "referencia" | "familia" | "marca" | "unidades" | "importe" | "margen" | "ultima" | "variacion";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Dato({ label, value, multilinea }: { label: string; value: React.ReactNode; multilinea?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  const isText = typeof value === "string" || typeof value === "number";
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-medium ${multilinea ? "break-words" : "truncate"}`}
        title={!multilinea && isText ? String(value) : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export default function ClienteDetalle() {
  const { cod } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const codNum = cod ? Number(cod) : null;

  const isMobile = useIsMobile();
  const volverRaw = searchParams.get("volver");
  const volverTxtRaw = searchParams.get("volverTxt");
  const volver = volverRaw && volverRaw.startsWith("/") && !volverRaw.startsWith("//") ? volverRaw : "/clientes";
  const volverTxt = volverTxtRaw && volverTxtRaw.trim() ? decodeURIComponent(volverTxtRaw) : "Clientes";

  // Pestaña activa controlada desde la URL ("tab"), conservando el resto de parámetros.
  const TABS_VALIDAS = ["resumen", "visitas", "productos", "documentos", "perfil", "ia"] as const;
  const tabRaw = searchParams.get("tab");
  const tab = (TABS_VALIDAS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as string) : "resumen";
  const cambiarTab = (nueva: string) => {
    const params = Object.fromEntries(searchParams.entries());
    setSearchParams({ ...params, tab: nueva }, { replace: true });
  };

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
  const queryClient = useQueryClient();
const [periodoProd, setPeriodoProd] = useState<string>("12m");
  const [busquedaProductos, setBusquedaProductos] = useState("");
  const [ordenProductos, setOrdenProductos] = useState<{ campo: CampoOrden; dir: "asc" | "desc" }>({
    campo: "importe",
    dir: "desc",
  });
  const [docSeleccionado, setDocSeleccionado] = useState<DocumentoCliente | null>(null);
  const [dialogoLineasOpen, setDialogoLineasOpen] = useState(false);
  const [kpisAbiertos, setKpisAbiertos] = useState(false);

  // --- Agendar visita ---
  const { user, role } = useAuth();
  const { add: addPlanificada } = useAgendaMutations();
  const { data: proxima } = useProximaPlanificada(codNum, user?.id ?? null);
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

/** Rango del periodo seleccionado y de su periodo anterior de comparación, siempre en hora local. */
  const rangoProductos = useMemo<RangoProductos | null>(() => {
    const hoy = new Date();
    const hoyIso = isoLocal(hoy);
    if (periodoProd === "todos") {
      return { desde: "2000-01-01", hasta: hoyIso, desdePrev: null, hastaPrev: null };
    }
    if (periodoProd === "12m") {
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 12, hoy.getDate());
      const desdePrev = new Date(hoy.getFullYear(), hoy.getMonth() - 24, hoy.getDate());
      const hastaPrev = new Date(desde.getTime() - 86400000);
      return {
        desde: isoLocal(desde),
        hasta: hoyIso,
        desdePrev: isoLocal(desdePrev),
        hastaPrev: isoLocal(hastaPrev),
      };
    }
    const anio = Number(periodoProd);
    if (!Number.isFinite(anio)) return null;
    const esActual = anio === hoy.getFullYear();
    return {
      desde: `${anio}-01-01`,
      hasta: esActual ? hoyIso : `${anio}-12-31`,
      desdePrev: `${anio - 1}-01-01`,
      hastaPrev: esActual ? isoLocal(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())) : `${anio - 1}-12-31`,
    };
  }, [periodoProd]);

  const conComparacion = rangoProductos?.desdePrev != null;

  const { data: productos, isLoading: cargandoProductos } = useClienteProductos(codNum, rangoProductos);

  const normalizarBusqueda = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const cambiarOrden = (
    campo: CampoOrden,
    actual: { campo: CampoOrden; dir: "asc" | "desc" },
  ): { campo: CampoOrden; dir: "asc" | "desc" } => {
if (actual.campo === campo) return { campo, dir: actual.dir === "asc" ? "desc" : "asc" };
    const numOrDate = ["unidades", "importe", "margen", "ultima", "variacion"].includes(campo);
    return { campo, dir: numOrDate ? "desc" : "asc" };
  };

/** Porcentaje de variación vs. periodo anterior; null = sin comparación posible ("Nueva"). */
  const pctVariacion = (p: ProductoCliente): number | null => {
    if (p.importe_anterior > 0) return ((p.importe - p.importe_anterior) / p.importe_anterior) * 100;
    return null;
  };

  const productosFiltradosOrdenados = useMemo(() => {
    if (!productos) return [] as ProductoCliente[];
    let list = [...productos];
    const texto = normalizarBusqueda(busquedaProductos).trim();
    if (texto) {
      list = list.filter((p) =>
        normalizarBusqueda([p.referencia, p.descripcion ?? ""].join(" ")).includes(texto)
      );
    }
const { campo, dir } = ordenProductos;
    const valor = (p: ProductoCliente): number | string | null => {
      if (campo === "variacion") return pctVariacion(p);
      if (campo === "ultima") return p.ultima_compra;
      return (p as any)[campo];
    };
    list.sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const na = va == null || va === "";
      const nb = vb == null || vb === "";
      if (na && nb) return 0;
      if (na) return 1; // nulos ("Nueva") al final, en ambas direcciones
      if (nb) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else if (campo === "ultima") cmp = new Date(va as string).getTime() - new Date(vb as string).getTime();
      else cmp = String(va).localeCompare(String(vb), "es");
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [productos, busquedaProductos, ordenProductos]);

/** Celda de la columna Variación (escritorio, md+). */
  const celdaVariacion = (p: ProductoCliente) => {
    if (p.importe_anterior > 0) {
      const pct = pctVariacion(p) ?? -100;
      const sube = pct >= 0;
      return (
        <>
          <span className={`flex items-center justify-end gap-1 ${sube ? "text-primary" : "text-destructive"}`}>
            {sube ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {sube ? "+" : "−"}{num(Math.abs(pct), 1)} %
          </span>
          <span className="text-xs text-muted-foreground">{p.importe > 0 ? eur(p.importe_anterior, 2) : "sin compras"}</span>
        </>
      );
    }
    return <Badge variant="outline" className="text-xs">Nueva</Badge>;
  };

  /** Segunda línea bajo el importe en móvil (la columna está oculta). */
  const variacionMovil = (p: ProductoCliente) => {
    if (p.importe_anterior > 0) {
      const pct = pctVariacion(p) ?? -100;
      const sube = pct >= 0;
      return (
        <span className={`mt-0.5 flex items-center justify-end gap-1 text-xs md:hidden ${sube ? "text-primary" : "text-destructive"}`}>
          {sube ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {sube ? "+" : "−"}{num(Math.abs(pct), 1)} %
        </span>
      );
    }
    return p.importe > 0 ? (
      <span className="mt-0.5 flex items-center justify-end md:hidden">
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Nueva</Badge>
      </span>
    ) : null;
  };

  const { data: cached } = useQuery({
    queryKey: ["crm_insights", codNum],
    enabled: codNum != null,
    queryFn: async () => {
      const { data } = await supabase.from("cliente_insights").select("*").eq("cod_cliente", codNum!).maybeSingle();
      return (data as unknown as Insights) ?? null;
    },
  });

  const shown = cached ?? null;

  const generar = useMutation({
    mutationKey: ["crm_insights_generar", codNum],
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cliente-insights", {
        body: { cod_cliente: codNum },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as Insights;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_insights", codNum] });
    },
    onError: (e: Error) =>
      toast({ title: "No se ha podido generar el análisis", description: e.message, variant: "destructive" }),
  });

  /** Estado "generando" leído del caché global: sobrevive al desmontaje de la pestaña. */
  const generando =
    useMutationState({
      filters: { mutationKey: ["crm_insights_generar", codNum], status: "pending" },
    }).length > 0;

  // --- Comparación de modelos (solo admin, pruebas no guardadas) ---
  const [modeloPrueba, setModeloPrueba] = useState<string>(MODELOS_IA[0]);
  const [pruebas, setPruebas] = useState<PruebaModelo[]>([]);
  const probar = useMutation({
    mutationFn: async (modelo: string) => {
      const { data, error } = await supabase.functions.invoke("cliente-insights", {
        body: { cod_cliente: codNum, modelo },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as PruebaRespuesta;
    },
    onSuccess: (data, modelo) => {
      setPruebas((prev) => [
        ...prev,
        {
          modelo: data._meta?.modelo ?? modelo,
          meta: data._meta ?? null,
          resumen: data.resumen,
          alertas: data.alertas ?? [],
          oportunidades: data.oportunidades ?? [],
          argumentario: data.argumentario ?? [],
        },
      ]);
    },
    onError: (e: Error) =>
      toast({ title: "La prueba ha fallado", description: e.message, variant: "destructive" }),
  });



  const anios = useMemo(
    () => Array.from(new Set((ventas ?? []).map((v) => v.anio))).sort((a, b) => b - a),
    [ventas],
  );


  const anioActual = anios[0] ?? new Date().getFullYear();
  const anioPrevio = anioActual - 1;

  const anioNaturalActual = new Date().getFullYear();
  const mesActualNatural = new Date().getMonth() + 1;

  const porAnio = useMemo(() => {
    const map = new Map<number, number>();
    for (const v of ventas ?? []) map.set(v.anio, (map.get(v.anio) ?? 0) + Number(v.importe ?? 0));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([anio, total]) => ({
      anio: String(anio),
      total,
      enCurso: anio === anioNaturalActual,
    }));
  }, [ventas, anioNaturalActual]);

  const mensual = useMemo(() => {
    const aplicarCorte = anioActual === anioNaturalActual;
    const base = MESES.map((m, i) => ({
      mes: m,
      actual: aplicarCorte && (i + 1) > mesActualNatural ? null : 0,
      anterior: 0,
      _i: i + 1,
    }));
    for (const v of ventas ?? []) {
      const row = base[v.mes - 1];
      if (!row) continue;
      if (v.anio === anioActual) row.actual = (row.actual ?? 0) + Number(v.importe ?? 0);
      if (v.anio === anioPrevio) row.anterior += Number(v.importe ?? 0);
    }
    return base;
  }, [ventas, anioActual, anioPrevio, anioNaturalActual, mesActualNatural]);

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

  const labelsCamposPorMotivo = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of motivos ?? []) {
      for (const c of m.campos ?? []) {
        map.set(`${m.key}::${c.campo_key}`, c.label);
      }
    }
    return map;
  }, [motivos]);

  const campoNombre = (motivoKey: string | null, campoKey: string) =>
    (motivoKey ? labelsCamposPorMotivo.get(`${motivoKey}::${campoKey}`) : undefined) ??
    campoKey.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

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
          {proxima && (
            <div className="mt-2">
              <Badge variant="secondary" className="max-w-full gap-1">
                <CalendarCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  Agendado para el {fechaCorta(proxima.fecha)}
                  {proxima.notas ? ` · ${proxima.notas}` : ""}
                </span>
              </Badge>
            </div>
          )}
          <div className="mt-3 flex w-full gap-2 sm:hidden">
            <Button asChild className="flex-1">
              <Link to={`/visitas/nueva?cliente=${cliente.cod_cliente}`}>
                <Plus className="mr-2 h-4 w-4" /> Nueva visita
              </Link>
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setAgendarOpen(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" /> Agendar
            </Button>
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
        <div className="hidden gap-2 sm:flex sm:w-auto sm:shrink-0">
          <Button asChild className="sm:flex-none">
            <Link to={`/visitas/nueva?cliente=${cliente.cod_cliente}`}>
              <Plus className="mr-2 h-4 w-4" /> Nueva visita
            </Link>
          </Button>
          <Button variant="outline" className="sm:flex-none" onClick={() => setAgendarOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" /> Agendar
          </Button>
        </div>
      </div>

      <Dialog open={agendarOpen} onOpenChange={setAgendarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Agendar visita</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Fecha</Label>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant={modoFecha === "hoy" ? "default" : "outline"} className="flex-1" onClick={() => setModoFecha("hoy")}>Hoy</Button>
                <Button type="button" size="sm" variant={modoFecha === "manana" ? "default" : "outline"} className="flex-1" onClick={() => setModoFecha("manana")}>Mañana</Button>
                <Button type="button" size="sm" variant={modoFecha === "otra" ? "default" : "outline"} className="flex-1" onClick={() => setModoFecha("otra")}>Otra fecha</Button>
              </div>
              {modoFecha === "otra" && (
                <Input type="date" className="mt-2" value={fechaOtra} onChange={(e) => setFechaOtra(e.target.value)} />
              )}
            </div>
            <div>
              <Label htmlFor="notas-agenda" className="text-xs text-muted-foreground">Motivo de la visita (opcional)</Label>
              <Textarea id="notas-agenda" rows={3} className="mt-2" value={notasAgenda} onChange={(e) => setNotasAgenda(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={guardarAgenda} disabled={guardandoAgenda || !fechaElegida}>
              {guardandoAgenda && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última compra</p>
            <p className="mt-1 text-sm font-semibold">{kpis?.ultima_compra ? fechaCorta(kpis.ultima_compra) : "Sin compras"}</p>
            <p className={`text-xs ${(kpis?.dias_sin_comprar ?? 0) > 90 ? "font-medium text-destructive" : "text-muted-foreground"}`}>
              {kpis?.dias_sin_comprar != null
                ? `${num(kpis.dias_sin_comprar)} ${kpis.dias_sin_comprar === 1 ? "día" : "días"} sin comprar`
                : "—"}
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

        <button
          type="button"
          onClick={() => setKpisAbiertos((v) => !v)}
          className="col-span-2 flex items-center justify-center gap-1 rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground sm:hidden"
        >
          Ver todas las métricas
          <ChevronDown className={`h-4 w-4 transition-transform ${kpisAbiertos ? "rotate-180" : ""}`} />
        </button>

        <div className={kpisAbiertos ? "contents" : "hidden sm:contents"}>
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
        </div>
      </div>


      <Tabs value={tab} onValueChange={cambiarTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="visitas">Visitas</TabsTrigger>
          <TabsTrigger value="productos">
            <span className="sm:hidden">Product.</span>
            <span className="hidden sm:inline">Productos</span>
          </TabsTrigger>
          <TabsTrigger value="documentos">
            <span className="sm:hidden">Docs.</span>
            <span className="hidden sm:inline">Documentos</span>
          </TabsTrigger>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="ia">
            <span className="sm:hidden">IA</span>
            <span className="hidden sm:inline">Análisis IA</span>
          </TabsTrigger>
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
                      <XAxis
                        dataKey="anio"
                        tickLine={false}
                        axisLine={false}
                        className="text-xs"
                        tickFormatter={(v: string) =>
                          v === String(anioNaturalActual) ? (isMobile ? `${v} *` : `${v} (en curso)`) : v
                        }
                      />
                      <YAxis tickFormatter={eurK} tickLine={false} axisLine={false} className="text-xs" width={54} />
                      <Tooltip
                        formatter={(v: number) => eur(v)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {porAnio.map((entry) => (
                          <Cell
                            key={entry.anio}
                            fill={entry.enCurso ? "hsl(var(--primary) / 0.45)" : "hsl(var(--primary))"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {porAnio.some((d) => d.enCurso) && (
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    {isMobile ? "* Año en curso (parcial)" : "El año en curso incluye datos parciales"}
                  </p>
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
                    <Line type="monotone" dataKey="actual" name={String(anioActual)} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls={false} />
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
                <CardContent className="h-80">
                  {rows.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Sin datos.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                        <XAxis type="number" tickFormatter={eurK} tickLine={false} axisLine={false} className="text-xs" />
                        <YAxis type="category" dataKey="nombre" width={72} tickLine={false} axisLine={false} className="text-xs" interval={0} tick={{ fontSize: 10 }} />
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
              <Dato label="Comercial" multilinea value={cliente.vendedor ? `${cliente.vendedor}${cliente.cod_vendedor ? ` (${cliente.cod_vendedor})` : ""}` : null} />
              <Dato label="Ruta comercial" value={cliente.ruta_comercial ?? cliente.ruta} />
              <Dato label="Ruta especial" value={cliente.ruta_especial} />
              <Dato label="Delegación" value={cliente.delegacion} />
              <Dato label="Tipo de cliente" value={cliente.cod_tipo_cliente} />
              <Dato label="Grupo" value={cliente.grupo} />
              <Dato label="Grupo rappel" value={cliente.grupo_rappel} />
              {cliente.tramos_rappel && (
                <div className="col-span-2 md:col-span-3 lg:col-span-4">
                  <p className="text-xs text-muted-foreground">Tramos rappel</p>
                  {(() => {
                    const tramos = cliente.tramos_rappel.split("|").map((t) => t.trim()).filter(Boolean);
                    if (tramos.length === 0) return null;
                    if (tramos.length === 1) return <p className="text-sm break-words">{tramos[0]}</p>;
                    return (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tramos.map((t, i) => (
                          <span key={i} className="inline-block rounded-md border px-2 py-0.5 text-xs">{t}</span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
              <Dato label="Razón social" multilinea value={cliente.razon_social} />
              <Dato label="CIF" value={cliente.cif} />
              <Dato label="Persona de contacto" multilinea value={cliente.persona_contacto} />
              <Dato
                label="Teléfono"
                value={cliente.telefono ? <a href={`tel:${cliente.telefono.replace(/\s/g, "")}`} className="text-primary underline underline-offset-2">{cliente.telefono}</a> : null}
              />
              <Dato
                label="Teléfono 2"
                value={cliente.telefono2 ? <a href={`tel:${cliente.telefono2.replace(/\s/g, "")}`} className="text-primary underline underline-offset-2">{cliente.telefono2}</a> : null}
              />
              <Dato
                label="Email"
                multilinea
                value={cliente.email ? <a href={`mailto:${cliente.email}`} className="text-primary underline underline-offset-2">{cliente.email}</a> : null}
              />
              <Dato label="Web" multilinea value={cliente.web} />
              <Dato label="Dirección" multilinea value={cliente.direccion} />
              <Dato label="Población" multilinea value={[cliente.cod_postal, cliente.localidad, cliente.provincia].filter(Boolean).join(" · ") || null} />
              <Dato label="Alta" multilinea value={antiguedad} />
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
                              <span className="text-muted-foreground">{campoNombre(b.motivo_key, k)}: </span>
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
                          <span className="text-muted-foreground">{campoNombre(v.motivo_key, k)}: </span>
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

        <TabsContent value="productos">
          <Card>
            <CardHeader className="flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" />Productos comprados</CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar referencia o descripción"
                    value={busquedaProductos}
                    onChange={(e) => setBusquedaProductos(e.target.value)}
                    className="pl-8"
                  />
                </div>
<Select value={periodoProd} onValueChange={setPeriodoProd}>
                  <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12m">Últimos 12 meses</SelectItem>
                    {anios.map((a) => (
                      <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                    ))}
                    <SelectItem value="todos">Todos los años</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {cargandoProductos ? (
                <Skeleton className="m-4 h-64" />
              ) : !productos || productos.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Sin compras registradas en el periodo.</p>
              ) : productosFiltradosOrdenados.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Ningún producto coincide con la búsqueda.</p>
              ) : (
                <div className="max-h-[560px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <button className="flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("referencia", ordenProductos))}>
                            Referencia
                            {ordenProductos.campo === "referencia" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </button>
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          <button className="flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("familia", ordenProductos))}>
                            Familia
                            {ordenProductos.campo === "familia" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          <button className="flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("marca", ordenProductos))}>
                            Marca
                            {ordenProductos.campo === "marca" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button className="ml-auto flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("unidades", ordenProductos))}>
                            Uds.
                            {ordenProductos.campo === "unidades" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button className="ml-auto flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("importe", ordenProductos))}>
                            Importe
                            {ordenProductos.campo === "importe" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </button>
                        </TableHead>
                        {verMargen && (
                          <TableHead className="hidden text-right md:table-cell">
                            <button className="ml-auto flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("margen", ordenProductos))}>
                              Margen
                              {ordenProductos.campo === "margen" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                            </button>
                          </TableHead>
)}
                        {conComparacion && (
                          <TableHead className="hidden text-right md:table-cell">
                            <button className="ml-auto flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("variacion", ordenProductos))}>
                              Variación
                              {ordenProductos.campo === "variacion" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                            </button>
                          </TableHead>
                        )}
                        <TableHead className="hidden text-right sm:table-cell">
                          <button className="ml-auto flex items-center gap-1" onClick={() => setOrdenProductos(cambiarOrden("ultima", ordenProductos))}>
                            Última
                            {ordenProductos.campo === "ultima" && (ordenProductos.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productosFiltradosOrdenados.map((p) => (
                        <TableRow key={p.referencia}>
                          <TableCell className="max-w-[220px]">
                            <p className="truncate font-medium">{p.referencia}</p>
                            {p.descripcion && <p className="truncate text-xs text-muted-foreground">{p.descripcion}</p>}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">{p.familia ?? "—"}</TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{p.marca ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(p.unidades)}</TableCell>
<TableCell className="text-right tabular-nums">
                            {eur(p.importe, 2)}
                            {conComparacion && variacionMovil(p)}
                          </TableCell>
                          {verMargen && <TableCell className="hidden text-right tabular-nums md:table-cell">{eur(p.margen, 2)}</TableCell>}
                          {conComparacion && <TableCell className="hidden text-right tabular-nums md:table-cell">{celdaVariacion(p)}</TableCell>}
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
            <CardContent>
              {(documentos?.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin documentos registrados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="hidden sm:table-cell">Documento</TableHead>
                      <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                      <TableHead className="hidden sm:table-cell">Canal</TableHead>
                      <TableHead className="hidden md:table-cell">Registrado por</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Líneas</TableHead>
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
                        <TableCell>
                          <span className="whitespace-nowrap">{fechaCorta(d.fecha)}{d.hora ? ` ${d.hora.slice(0, 5)}` : ""}</span>
                          <span className="block text-xs text-muted-foreground sm:hidden">
                            {[d.id_documento, d.operacion ?? d.tipo_documento, d.canal].filter(Boolean).join(" · ")}
                          </span>
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs sm:table-cell">{d.id_documento}</TableCell>
                        <TableCell className="hidden sm:table-cell">{d.operacion ?? d.tipo_documento ?? "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{d.canal ?? "—"}</TableCell>
                        <TableCell className="hidden truncate md:table-cell">{d.registrado_por ?? "—"}</TableCell>
                        <TableCell className="hidden text-right md:table-cell">{num(d.lineas)}</TableCell>
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

        <TabsContent value="perfil">
          {codNum != null && <ClientePerfilTab cod={codNum} />}
        </TabsContent>


        <TabsContent value="ia" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {shown?.generado_en ? `Generado ${new Date(shown.generado_en).toLocaleString("es-ES")}` : "Sin análisis todavía"}
            </p>
            <Button onClick={() => generar.mutate()} disabled={generando}>
              {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {shown ? "Regenerar" : "Generar análisis"}
            </Button>
          </div>

          {generando && !shown && (
            <div className="flex items-center gap-2 rounded-md border p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generando informe…
            </div>
          )}

          {shown && (
            <div className={`space-y-3 ${generando ? "opacity-60" : ""}`}>
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

          {role === "admin" && (
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comparar modelos</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Pruebas no guardadas. El informe del cliente no se modifica.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={modeloPrueba} onValueChange={setModeloPrueba}>
                    <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELOS_IA.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => probar.mutate(modeloPrueba)} disabled={probar.isPending}>
                      {probar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Probar
                    </Button>
                    {pruebas.length > 0 && (
                      <Button variant="ghost" onClick={() => setPruebas([])}>Limpiar pruebas</Button>
                    )}
                  </div>
                </div>

                {probar.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Probando {modeloPrueba}…
                  </div>
                )}

                {pruebas.map((p, idx) => (
                  <Card key={`${p.modelo}-${idx}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{p.modelo}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Entrada: {p.meta?.prompt_tokens ?? "—"} tokens · Salida: {p.meta?.completion_tokens ?? "—"} tokens ·{" "}
                        {p.meta?.duracion_ms != null ? `${num(p.meta.duracion_ms / 1000, 1)} s` : "— s"}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Resumen</p>
                        <p className="text-sm leading-relaxed">{p.resumen}</p>
                      </div>
                      {[
                        { title: "Alertas", icon: AlertTriangle, items: p.alertas },
                        { title: "Oportunidades", icon: Target, items: p.oportunidades },
                        { title: "Argumentario para la próxima visita", icon: MessageSquareQuote, items: p.argumentario },
                      ].map(({ title, icon: Icon, items }) =>
                        items?.length ? (
                          <div key={title}>
                            <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <Icon className="h-3.5 w-3.5" />{title}
                            </p>
                            <ul className="space-y-2 text-sm">
                              {items.map((it, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                  {it}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null,
                      )}
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
