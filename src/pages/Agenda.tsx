import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Plus, Check, Trash2, ChevronLeft, ChevronRight, MapPin, Route, Navigation, Mic, StickyNote, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useAgenda,
  useAgendaMutations,
  useClientes,
  useCoordsClientes,
  useReordenarAgenda,
  hoyISO,
} from "@/hooks/useCrm";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { TramosMapaDialog } from "@/components/TramosMapaDialog";
import { optimizarRuta, posicionActual, tramos, distanciaTotalKm } from "@/lib/maps";
import { eur, num } from "@/lib/format";


function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días transcurridos desde una fecha ISO hasta hoy (medianoche local). null si no hay fecha; 0 si es futura. */
function diasDesde(fecha: string | null): number | null {
  if (!fecha) return null;
  const fin = new Date(`${fecha}T00:00:00`);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - fin.getTime()) / 86400000);
  return dias < 0 ? 0 : dias;
}

export default function Agenda() {
  const { user } = useAuth();
  const [fecha, setFecha] = useState(hoyISO());
  const { data: plan } = useAgenda(fecha, fecha, user?.id ?? null);
  useScrollRestore("agenda", !!plan);
  const { add, update, remove } = useAgendaMutations();
  const { data: clientes } = useClientes(false);
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [optimizando, setOptimizando] = useState(false);
  const [mapaOpen, setMapaOpen] = useState(false);

  // Edición de notas de la parada: parada abierta y borrador del textarea.
  const [notaEditId, setNotaEditId] = useState<string | null>(null);
  const [notaBorrador, setNotaBorrador] = useState("");


  const codigosPlan = useMemo(() => (plan ?? []).map((p) => p.cod_cliente), [plan]);
  const { data: coords } = useCoordsClientes(codigosPlan);
  const reordenar = useReordenarAgenda();

const clienteMap = useMemo(() => {
    const m = new Map<number, { cliente: string; localidad: string | null; ruta: string | null; importe_actual: number; ultima_compra: string | null }>();
    for (const c of clientes ?? [])
      m.set(c.cod_cliente, {
        cliente: c.cliente,
        localidad: c.localidad,
        ruta: c.ruta,
        importe_actual: c.importe_actual,
        ultima_compra: c.ultima_compra,
      });
    return m;
  }, [clientes]);

  const paradas = useMemo(
    () =>
      (plan ?? []).map((p) => ({
        id: p.id,
        cod_cliente: p.cod_cliente,
        cliente: clienteMap.get(p.cod_cliente)?.cliente ?? `Cliente #${p.cod_cliente}`,
        latitud: coords?.get(p.cod_cliente)?.latitud ?? null,
        longitud: coords?.get(p.cod_cliente)?.longitud ?? null,
      })),
    [plan, coords, clienteMap],
  );

  const conGeo = paradas.filter((p) => p.latitud != null && p.longitud != null).length;
  const hayPendientes = (plan ?? []).some((p) => p.estado !== "realizada");

  const optimizar = async () => {
    if (conGeo < 2) {
      toast({
        title: "Faltan ubicaciones",
        description: "Necesitas al menos dos clientes con ubicación registrada para optimizar el recorrido.",
        variant: "destructive",
      });
      return;
    }
    setOptimizando(true);
    const origen = await posicionActual();
    const ordenadas = optimizarRuta(paradas, origen);
    try {
      await reordenar.mutateAsync(ordenadas.map((p, i) => ({ id: p.id, orden: i + 1 })));
      toast({
        title: "Recorrido optimizado",
        description: `${conGeo} paradas ordenadas por cercanía · ≈ ${distanciaTotalKm(ordenadas, origen).toFixed(0)} km.`,
      });
    } catch (e) {
      toast({ title: "No se ha podido reordenar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setOptimizando(false);
    }
  };

  const bloques = useMemo(() => tramos(paradas), [paradas]);

  const abrirMapa = () => {
    if (bloques.length === 0) {
      toast({
        title: "Sin ubicaciones",
        description: "Ningún cliente del día tiene ubicación registrada.",
        variant: "destructive",
      });
      return;
    }
    setMapaOpen(true);
  };


  const opciones = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const list = clientes ?? [];
    if (!term) return list.slice(0, 25);
    return list
      .filter((c) => c.cliente.toLowerCase().includes(term) || String(c.cod_cliente).includes(term) || (c.ruta ?? "").toLowerCase() === term)
      .slice(0, 25);
  }, [clientes, busqueda]);

  const etiquetaDia = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const añadir = (cod: number) => {
    if (!user) return;
    add.mutate({ user_id: user.id, cod_cliente: cod, fecha, orden: (plan?.length ?? 0) + 1 });
    setOpen(false);
    setBusqueda("");
  };

  const abrirNota = (id: string, notas: string | null) => {
    setNotaEditId(id);
    setNotaBorrador(notas ?? "");
  };

  const guardarNota = () => {
    if (!notaEditId) return;
    const texto = notaBorrador.trim();
    update.mutate({ id: notaEditId, notas: texto || null });
    setNotaEditId(null);
    setNotaBorrador("");
  };


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Agenda</h1>
        <p className="text-sm text-muted-foreground">Planifica tu ruta del día</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setFecha(addDays(fecha, -1))} aria-label="Día anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => setFecha(addDays(fecha, 1))} aria-label="Día siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base capitalize">{etiquetaDia}</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Añadir</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Añadir cliente a la ruta</DialogTitle></DialogHeader>
              <Input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, código o ruta…"
              />
              <div className="max-h-72 space-y-1 overflow-auto">
                {opciones.map((c) => (
                  <button
                    key={c.cod_cliente}
                    type="button"
                    onClick={() => añadir(c.cod_cliente)}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{c.cliente}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      #{c.cod_cliente}{c.ruta ? ` · Ruta ${c.ruta}` : ""}
                    </span>
                  </button>
                ))}
                {opciones.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>}
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {!plan || plan.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No hay visitas planificadas para este día.</p>
            </div>
          ) : (
plan.map((p, i) => {
              const c = clienteMap.get(p.cod_cliente);
              const hecha = p.estado === "realizada";
              const dias = diasDesde(c?.ultima_compra ?? null);
              return (
                <div key={p.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/clientes/${p.cod_cliente}?volver=${encodeURIComponent('/agenda')}&volverTxt=${encodeURIComponent('Agenda')}`} className="block">
                        <p className={`truncate font-medium ${hecha ? "text-muted-foreground line-through" : ""}`}>
                          {c?.cliente ?? `Cliente #${p.cod_cliente}`}
                        </p>
                        {c?.localidad && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />{c.localidad}
                          </p>
                        )}
</Link>
                      {c && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
                          <span className={dias != null && dias > 90 ? "font-medium text-destructive" : "text-muted-foreground"}>
                            {dias == null ? "Sin compras" : `${num(dias)} ${dias === 1 ? "día" : "días"} sin comprar`}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span>{eur(c.importe_actual)}</span>
                        </p>
                      )}
                      {p.notas && (
                        <p className="mt-1 flex items-start gap-1.5 rounded bg-muted/50 px-2 py-1 text-xs break-words">
                          <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <span>{p.notas}</span>
                        </p>
                      )}
                      {p.visita_id && (
                        <Link
                          to={`/clientes/${p.cod_cliente}?tab=visitas&volver=${encodeURIComponent('/agenda')}&volverTxt=${encodeURIComponent('Agenda')}`}
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          Ver visitas del cliente
                        </Link>
                      )}
                      {!hecha && (
                        <Button asChild size="sm" variant="outline" className="mt-2">
                          <Link to={`/visitas/nueva?cliente=${p.cod_cliente}&volver=${encodeURIComponent('/agenda')}&volverTxt=${encodeURIComponent('Agenda')}`}>
                            <Mic className="mr-2 h-4 w-4" />Registrar visita
                          </Link>
                        </Button>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {hecha && <Badge variant="secondary">Hecha</Badge>}
                      {p.visita_id && (
                        <span className="text-xs text-muted-foreground">Visita registrada</span>
                      )}
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar nota de la parada"
                          onClick={() => abrirNota(p.id, p.notas)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Marcar como realizada"
                          onClick={() => update.mutate({ id: p.id, estado: hecha ? "pendiente" : "realizada" })}
                        >
                          <Check className={`h-4 w-4 ${hecha ? "text-primary" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => remove.mutate(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {plan && plan.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={optimizar} disabled={optimizando}>
              <Route className="mr-2 h-4 w-4" />
              {optimizando ? "Optimizando…" : "Optimizar recorrido"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={abrirMapa}>
              <Navigation className="mr-2 h-4 w-4" />Ver en el mapa
            </Button>
          </div>
          {conGeo < plan.length && (
            <p className="text-xs text-muted-foreground">
              {plan.length - conGeo} clientes sin ubicación registrada quedan al final del recorrido.
            </p>
          )}
          {!hayPendientes && (
            <Button asChild className="w-full">
              <Link to="/visitas/nueva"><Plus className="mr-2 h-4 w-4" />Registrar visita</Link>
            </Button>
          )}
        </div>
      )}

      <TramosMapaDialog
        open={mapaOpen}
        onOpenChange={setMapaOpen}
        bloques={bloques}
        sinGeo={(plan?.length ?? 0) - conGeo}
      />

      <Dialog open={notaEditId != null} onOpenChange={(v) => { if (!v) setNotaEditId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nota de la parada</DialogTitle></DialogHeader>
          <Textarea
            autoFocus
            rows={3}
            value={notaBorrador}
            onChange={(e) => setNotaBorrador(e.target.value)}
            placeholder="Motivo de la visita…"
          />
          <div className="flex justify-end">
            <Button onClick={guardarNota}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>



    </div>
  );
}
