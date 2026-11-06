import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, Search, ExternalLink, RefreshCw, Loader2, FileDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  useVisitasRevision, useRevisionMutations, useMotivos, useClientes,
  useSituacionesMutations, useVisitaBloques, useBloqueMutations, useReanalizarVisita, fechaCorta, hoyISO,
  type Visita, type VisitaBloque,
} from "@/hooks/useCrm";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useMensajesVisita, useMarcarLeida, useRespuestasNuevas, useInvalidarMensajes, enviarMensaje, ultimoDe } from "@/hooks/useVisitaMensajes";
import { ListaMensajes } from "@/components/ConversacionBloque";

const ESTADOS = [
  { key: "pendiente", label: "Pendientes", icon: Clock },
  { key: "CORRECTO", label: "Validadas", icon: CheckCircle2 },
  { key: "NO CORRECTO", label: "No correctas", icon: XCircle },
  { key: "todas", label: "Todas", icon: Search },
];

/** Un bloque es "importado" si su extracción vino de un fichero externo. */
const esExterno = (b: VisitaBloque) => {
  const origen = (b.campos_meta as { _origen?: { fuente?: string } } | null)?._origen;
  return origen?.fuente === "texto_externo";
};

/** Confianza cualitativa por campo: alta / media / baja. */
const confianzasDe = (b: VisitaBloque): string[] =>
  Object.entries(b.campos_meta ?? {})
    .filter(([k]) => k !== "_origen")
    .map(([, v]) => String((v as { confianza?: unknown } | null)?.confianza ?? "").trim().toLowerCase())
    .filter(Boolean);

const tieneDudas = (b: VisitaBloque) => confianzasDe(b).some((c) => c === "baja" || c === "media");

const badgeValidacion = (v: string | null) => {
  if (v === "CORRECTO") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Validada</Badge>;
  if (v === "NO CORRECTO") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> No correcta</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendiente</Badge>;
};

type Borrador = { validacion: string; nota: string };

const marcaBloque = (v: string | null) =>
  v === "CORRECTO" ? <CheckCircle2 className="inline h-3 w-3 text-primary" aria-label="correcto" />
  : v === "NO CORRECTO" ? <XCircle className="inline h-3 w-3 text-destructive" aria-label="no correcto" />
  : null;

const badgeEsperando = <Badge variant="outline" className="text-xs">Esperando al comercial</Badge>;
const badgeRespuesta = <Badge className="text-xs">Respuesta nueva</Badge>;

const badgeImportado = <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><FileDown className="h-3 w-3" /> Importado</Badge>;


export default function RevisionVisitas() {
  const [params, setParams] = useSearchParams();
  const origen = (params.get("origen") ?? "app") as "app" | "gespromo" | "todas";
  const { data: visitas, isLoading } = useVisitasRevision(origen);
  useScrollRestore("revision", !isLoading);
  const { data: motivos } = useMotivos();
  const { data: clientes } = useClientes(false, "alfabetico");
  const { revisar } = useRevisionMutations();
  const { revisarBloque } = useBloqueMutations();
  const { guardar: guardarSituacion } = useSituacionesMutations();
  const reanalizar = useReanalizarVisita();

  const get = (k: string, def = "") => params.get(k) ?? def;
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (!v || (k !== "origen" && (v === "todas" || v === "todos"))) next.delete(k);
    else if (k === "origen" && v === "app") next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const estado = get("estado", "pendiente");
  const q = get("q");
  const motivoFiltro = get("motivo", "todos");
  const soloDudas = get("dudas") === "1";
  const soloRespuestas = get("respuestas") === "1";
  const desde = get("desde");
  const hasta = get("hasta");
  const hayFiltros = ["estado", "q", "origen", "motivo", "comercial", "dudas", "respuestas", "desde", "hasta"].some((k) => params.get(k));

  const [sel, setSel] = useState<Visita | null>(null);
  const [nota, setNota] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [justificar, setJustificar] = useState(false);
  const [etiquetaSituacion, setEtiquetaSituacion] = useState("");
  const [valVisita, setValVisita] = useState("pendiente");
  const [borrador, setBorrador] = useState<Record<string, Borrador>>({});
  const [guardando, setGuardando] = useState(false);
  const [nuevaAlAbrir, setNuevaAlAbrir] = useState(false);
  const { data: respuestasNuevas } = useRespuestasNuevas(true);
  const { data: mensajes } = useMensajesVisita(sel?.id);
  useMarcarLeida(sel?.id);
  const invalidarMensajes = useInvalidarMensajes();
  const hilo = (bloqueId: string | null) => (mensajes ?? []).filter((m) => m.bloque_id === bloqueId);
  const editaObs = !!sel && sel.origen !== "app";

  const nombrePorCod = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of clientes ?? []) m.set(c.cod_cliente, c.cliente);
    return m;
  }, [clientes]);

  const nombreMotivo = (key: string | null) => motivos?.find((m) => m.key === key)?.nombre ?? key ?? "Sin motivo";

  // Bloques de todas las visitas cargadas: los filtros por origen/motivo/confianza los miran.
  const { data: bloquesMap } = useVisitaBloques((visitas ?? []).map((v) => v.id));
  const bloquesDe = (v: Visita) => bloquesMap?.get(v.id) ?? [];
  const cargandoBloques = !bloquesMap;
  const dialogoRef = useRef<HTMLDivElement>(null);
  const resumenMotivos = (v: Visita) => {
    const bs = bloquesDe(v);
    if (!bs.length) return nombreMotivo(v.motivo_key);
    return bs.map((b) => nombreMotivo(b.motivo_key)).join(" + ");
  };
  const motivosConEstado = (v: Visita) => {
    const bs = bloquesDe(v);
    if (!bs.length) return <>{nombreMotivo(v.motivo_key)}</>;
    return <>{bs.map((b, i) => <span key={b.id}>{i > 0 && " + "}{nombreMotivo(b.motivo_key)} {marcaBloque(b.validacion)}</span>)}</>;
  };
  const comercialFiltro = get("comercial", "todos");
  const comerciales = useMemo(
    () => [...new Set((visitas ?? []).map((v) => v.comercial_nombre).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "es")),
    [visitas],
  );
  const visitaImportada = (v: Visita) => bloquesDe(v).some(esExterno);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (visitas ?? []).filter((v) => {
      const val = v.validacion ?? "pendiente";
      if (estado !== "todas" && val !== estado) return false;
      if (desde && v.fecha < desde) return false;
      if (hasta && v.fecha > hasta) return false;
      if (comercialFiltro !== "todos" && v.comercial_nombre !== comercialFiltro) return false;

      const bs = bloquesMap?.get(v.id) ?? [];
      if (motivoFiltro !== "todos") {
        const enBloques = bs.some((b) => b.motivo_key === motivoFiltro);
        if (!enBloques && v.motivo_key !== motivoFiltro) return false;
      }
      if (soloDudas && !bs.some(tieneDudas)) return false;
      if (soloRespuestas && !respuestasNuevas?.has(v.id)) return false;

      if (!term) return true;
      const nombre = v.cod_cliente ? nombrePorCod.get(v.cod_cliente) ?? "" : v.cliente_externo ?? "";
      return (
        nombre.toLowerCase().includes(term) ||
        (v.comercial_nombre ?? "").toLowerCase().includes(term) ||
        nombreMotivo(v.motivo_key).toLowerCase().includes(term)
      );
    });
  }, [visitas, estado, q, motivoFiltro, comercialFiltro, soloDudas, soloRespuestas, respuestasNuevas, desde, hasta, bloquesMap, nombrePorCod, motivos]);

  const pendientes = filtradas.filter((v) => (v.validacion ?? "pendiente") === "pendiente").length;



  const abrir = (v: Visita) => {
    setSel(v);
    setNota("");
    setNuevaAlAbrir(!!respuestasNuevas?.has(v.id));
    setValVisita(v.validacion ?? "pendiente");
    setObservaciones(v.observaciones ?? "");
    setJustificar(false);
    setEtiquetaSituacion("Caída justificada");
    const b: Record<string, Borrador> = {};
    for (const x of bloquesDe(v)) b[x.id] = { validacion: x.validacion ?? "pendiente", nota: "" };
    setBorrador(b);
    requestAnimationFrame(() => dialogoRef.current?.scrollTo({ top: 0 }));
  };

  // Carga tardía o «Reanalizar»: añade bloques nuevos con su estado guardado y quita los que ya no existen.
  const bloquesSel = sel ? bloquesMap?.get(sel.id) : undefined;
  useEffect(() => {
    if (!sel || !bloquesMap) return;
    const bs = bloquesSel ?? [];
    setBorrador((prev) => {
      const next: Record<string, Borrador> = {};
      for (const x of bs) next[x.id] = prev[x.id] ?? { validacion: x.validacion ?? "pendiente", nota: "" };
      const igual = Object.keys(prev).length === bs.length && bs.every((x) => prev[x.id] === next[x.id]);
      return igual ? prev : next;
    });
  }, [sel?.id, bloquesMap, bloquesSel]);

  const bloqueCambiado = (b: VisitaBloque) => {
    const d = borrador[b.id];
    return !!d && (d.validacion !== (b.validacion ?? "pendiente") || (d.nota ?? "").trim() !== "");
  };
  const hayCambios = !!sel && (
    bloquesDe(sel).some(bloqueCambiado) ||
    (editaObs && observaciones !== (sel.observaciones ?? "")) ||
    justificar ||
    (bloquesDe(sel).length === 0 && (nota.trim() !== "" || valVisita !== (sel.validacion ?? "pendiente")))
  );

  const setBloque = (id: string, p: Partial<Borrador>) =>
    setBorrador((prev) => {
      const b = sel ? bloquesDe(sel).find((x) => x.id === id) : undefined;
      const base: Borrador = prev[id] ?? { validacion: b?.validacion ?? "pendiente", nota: "" };
      return { ...prev, [id]: { ...base, ...p } };
    });
  const alternar = (id: string, v: string) =>
    setBloque(id, { validacion: borrador[id]?.validacion === v ? "pendiente" : v });
  const marcarPendientesCorrectos = () =>
    setBorrador((prev) => Object.fromEntries(Object.entries(prev).map(([k, d]) => [k, d.validacion === "pendiente" ? { ...d, validacion: "CORRECTO" } : d])));

  const cerrar = () => {
    if (hayCambios && !confirm("Hay cambios sin guardar. ¿Cerrar y descartarlos?")) return;
    setSel(null);
  };

  /** Guarda solo lo cambiado. En visitas con bloques nunca escribe visitas.validacion. */
  const guardar = async (siguiente: boolean) => {
    if (!sel || cargandoBloques) return;
    // La siguiente se decide ANTES de guardar: al guardar la lista se reordena.
    const idx = filtradas.findIndex((v) => v.id === sel.id);
    const sig = siguiente ? filtradas.slice(idx + 1)[0] ?? null : null;
    setGuardando(true);
    try {
      const bs = bloquesDe(sel);
      for (const b of bs.filter(bloqueCambiado)) {
        const d = borrador[b.id];
        if (d.validacion !== (b.validacion ?? "pendiente")) await revisarBloque.mutateAsync({ id: b.id, validacion: d.validacion });
        if ((d.nota ?? "").trim()) await enviarMensaje(sel.id, b.id, d.nota ?? "");
      }
      const obsCambiada = editaObs && observaciones !== (sel.observaciones ?? "");
      if (bs.length) {
        if (obsCambiada) await revisar.mutateAsync({ id: sel.id, observaciones: observaciones || null });
      } else {
        if (valVisita !== (sel.validacion ?? "pendiente") || obsCambiada) {
          await revisar.mutateAsync({ id: sel.id, validacion: valVisita, ...(obsCambiada ? { observaciones: observaciones || null } : {}) });
        }
        if (nota.trim()) await enviarMensaje(sel.id, null, nota);
      }
      invalidarMensajes();
      if (justificar && sel.cod_cliente) {
        await guardarSituacion.mutateAsync({
          cod_cliente: sel.cod_cliente,
          etiqueta: etiquetaSituacion || "Caída justificada",
          categoria: "perdida_cliente_final",
          efecto: "justificada",
          nota: observaciones || null,
          activo: true,
          desde: hoyISO(),
        });
      }
      toast({ title: "Revisión guardada" });
      if (sig) abrir(sig); else setSel(null);
    } catch (e) {
      toast({ title: "No se ha podido guardar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  /** Etiquetas y orden de la plantilla; lo que no esté en ella, al final con su clave. */
  const camposOrdenados = (b: VisitaBloque) => {
    const def = (motivos?.find((m) => m.key === b.motivo_key)?.campos ?? []).slice().sort((x, y) => x.sort_order - y.sort_order);
    const vals = Object.entries(b.campos ?? {}).filter(([, val]) => val != null && val !== "");
    const mapa = new Map(vals);
    const out: [string, string, unknown][] = [];
    for (const c of def) if (mapa.has(c.campo_key)) { out.push([c.campo_key, c.label, mapa.get(c.campo_key)]); mapa.delete(c.campo_key); }
    for (const [k, v] of mapa) out.push([k, k, v]);
    return out;
  };
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sí" : "No") : typeof v === "object" ? JSON.stringify(v) : String(v));


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Revisión de visitas</h1>
        <p className="text-muted-foreground">
          Valida, corrige y completa las visitas registradas por el equipo comercial.{" "}
          {filtradas.length} visita{filtradas.length === 1 ? "" : "s"} · {pendientes} pendiente{pendientes === 1 ? "" : "s"} de revisar.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={estado} onValueChange={(v) => setParam("estado", v === "pendiente" ? null : v)}>
          <TabsList>
            {ESTADOS.map((e) => <TabsTrigger key={e.key} value={e.key}>{e.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cliente, comercial o motivo…" value={q} onChange={(e) => setParam("q", e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Origen</Label>
            <Select value={origen} onValueChange={(v) => setParam("origen", v)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="app">Registradas en la app</SelectItem>
                <SelectItem value="gespromo">Importadas de Gespromo</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Motivo</Label>
            <Select value={motivoFiltro} onValueChange={(v) => setParam("motivo", v)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los motivos</SelectItem>
                {(motivos ?? []).map((m) => <SelectItem key={m.key} value={m.key}>{m.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comercial</Label>
            <Select value={comercialFiltro} onValueChange={(v) => setParam("comercial", v)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los comerciales</SelectItem>
                {comerciales.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input type="date" className="w-40" value={desde} onChange={(e) => setParam("desde", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" className="w-40" value={hasta} onChange={(e) => setParam("hasta", e.target.value)} />
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={soloDudas} onChange={(e) => setParam("dudas", e.target.checked ? "1" : null)} />
            Solo con confianza baja o media
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={soloRespuestas} onChange={(e) => setParam("respuestas", e.target.checked ? "1" : null)} />
            Solo con respuesta nueva
          </label>

          <div className="ml-auto flex items-center gap-3 pb-1.5">
            <span className="text-sm text-muted-foreground">{filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}</span>
            {hayFiltros && (
              <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                <X className="mr-1 h-3.5 w-3.5" /> Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>


      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtradas.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay visitas en este estado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map((v) => (
            <Card key={v.id} className="transition-colors hover:bg-accent/40">
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => abrir(v)}>
                  <p className="truncate font-medium">
                    {v.cod_cliente ? nombrePorCod.get(v.cod_cliente) ?? `Cliente ${v.cod_cliente}` : v.cliente_externo ?? "Sin cliente"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fechaCorta(v.fecha)}{v.hora ? ` · ${v.hora.slice(0, 5)}` : ""} · {motivosConEstado(v)}
                    {` · ${v.comercial_nombre ?? "Sin comercial"}`}
                  </p>
                  {v.observaciones && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{v.observaciones}</p>}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {respuestasNuevas?.has(v.id) && badgeRespuesta}
                  {visitaImportada(v) && badgeImportado}
                  {badgeValidacion(v.validacion)}
                  {v.cod_cliente && (
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`/clientes/${v.cod_cliente}?volver=${encodeURIComponent('/visitas/revision')}&volverTxt=${encodeURIComponent('Revisión de visitas')}`}><ExternalLink className="h-4 w-4" /></Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => abrir(v)}>Revisar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!sel} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent ref={dialogoRef} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Revisar visita</DialogTitle></DialogHeader>
          {sel && cargandoBloques && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>
          )}
          {sel && !cargandoBloques && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {sel.cod_cliente ? nombrePorCod.get(sel.cod_cliente) ?? `Cliente ${sel.cod_cliente}` : sel.cliente_externo ?? "Sin cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fechaCorta(sel.fecha)}{sel.hora ? ` · ${sel.hora.slice(0, 5)}` : ""} · {resumenMotivos(sel)}
                  {sel.comercial_nombre ? ` · ${sel.comercial_nombre}` : ""}
                </p>
              </div>

              {/* Un bloque por plantilla: se valida cada uno por separado. */}
              {bloquesDe(sel).map((b, i) => {
                const d = borrador[b.id] ?? { validacion: b.validacion ?? "pendiente", nota: "" };
                const h = hilo(b.id);
                const ult = ultimoDe(h);
                const marca = ult && (b.validacion ?? "pendiente") === "pendiente"
                  ? (!ult.es_dueno ? badgeEsperando : nuevaAlAbrir ? badgeRespuesta : null)
                  : ult?.es_dueno && nuevaAlAbrir ? badgeRespuesta : null;
                return (
                <div key={b.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{i + 1}. {nombreMotivo(b.motivo_key)}</p>
                    <span className="flex items-center gap-2">
                      {marca}
                      {bloqueCambiado(b) && <Badge variant="outline" className="text-xs">sin guardar</Badge>}
                      {esExterno(b) && badgeImportado}{badgeValidacion(d.validacion)}
                    </span>
                  </div>
                  {camposOrdenados(b).map(([k, label, val]) => (
                    <p key={k} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right font-medium">{fmt(val)}</span>
                    </p>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant={d.validacion === "CORRECTO" ? "default" : "outline"} aria-pressed={d.validacion === "CORRECTO"} onClick={() => alternar(b.id, "CORRECTO")}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Correcto
                    </Button>
                    <Button size="sm" variant={d.validacion === "NO CORRECTO" ? "destructive" : "outline"} aria-pressed={d.validacion === "NO CORRECTO"} onClick={() => alternar(b.id, "NO CORRECTO")}>
                      <XCircle className="mr-1 h-3.5 w-3.5" /> No correcto
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Conversación con el comercial</Label>
                    <ListaMensajes mensajes={h} />
                    <Textarea rows={2} value={d.nota} onChange={(e) => setBloque(b.id, { nota: e.target.value })} placeholder="Escribe un mensaje (se envía al guardar)…" />
                  </div>
                </div>
                );
              })}

              {bloquesDe(sel).length === 0 && Object.keys(sel.campos ?? {}).length > 0 && (
                <div className="space-y-1 rounded-md border p-3 text-sm">
                  {Object.entries(sel.campos).map(([k, val]) => (
                    <p key={k} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right font-medium">{String(val)}</span>
                    </p>
                  ))}
                </div>
              )}

              {sel.transcripcion && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Transcripción original</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reanalizar.isPending}
                      onClick={() => {
                        if (!confirm("Se sustituyen los bloques actuales por los que proponga el análisis. ¿Continuar?")) return;
                        reanalizar.mutate(
                          {
                            id: sel.id,
                            transcripcion: sel.transcripcion!,
                            cliente_nombre: sel.cod_cliente ? nombrePorCod.get(sel.cod_cliente) ?? "" : "",
                          },
                          {
                            onSuccess: (n) => toast({ title: `Reanalizada: ${n} bloque(s)` }),
                            onError: (e) => toast({ title: "No se ha podido reanalizar", description: (e as Error).message, variant: "destructive" }),
                          },
                        );
                      }}
                    >
                      {reanalizar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                      Reanalizar
                    </Button>
                  </div>
                  <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">{sel.transcripcion}</p>
                  {(sel.analisis_modelo || sel.analisis_prompt_version) && (
                    <p className="text-[11px] text-muted-foreground">
                      Analizada con {sel.analisis_modelo ?? "—"} · {sel.analisis_prompt_version ?? "—"}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                {editaObs ? (
                  <>
                    <Label>Observaciones (editable)</Label>
                    <Textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                  </>
                ) : (
                  <>
                    <Label>Observaciones del comercial</Label>
                    <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm">{sel.observaciones || "—"}</p>
                  </>
                )}
              </div>

              {bloquesDe(sel).length === 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant={valVisita === "CORRECTO" ? "default" : "outline"} onClick={() => setValVisita(valVisita === "CORRECTO" ? "pendiente" : "CORRECTO")}>Correcta</Button>
                    <Button size="sm" variant={valVisita === "NO CORRECTO" ? "destructive" : "outline"} onClick={() => setValVisita(valVisita === "NO CORRECTO" ? "pendiente" : "NO CORRECTO")}>No correcta</Button>
                  </div>
                  <Label>Conversación con el comercial</Label>
                  <ListaMensajes mensajes={hilo(null)} />
                  <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe un mensaje (se envía al guardar)…" />
                </div>
              )}

              {sel.cod_cliente && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={justificar} onChange={(e) => setJustificar(e.target.checked)} />
                    Justificar caída de ventas de este cliente
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Crea una situación con efecto “caída justificada”: el cliente sigue en alertas, pero con el motivo visible.
                  </p>
                  {justificar && (
                    <Input value={etiquetaSituacion} onChange={(e) => setEtiquetaSituacion(e.target.value)} maxLength={40} placeholder="Etiqueta corta" />
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {sel && !cargandoBloques && bloquesDe(sel).length > 0 && (
              <Button variant="outline" className="sm:mr-auto" onClick={marcarPendientesCorrectos} disabled={guardando}>Marcar pendientes como correctos</Button>
            )}
            <Button variant="outline" onClick={() => guardar(false)} disabled={guardando || cargandoBloques || !hayCambios}>Guardar</Button>
            <Button onClick={() => guardar(true)} disabled={guardando || cargandoBloques}>
              {guardando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Guardar y siguiente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
