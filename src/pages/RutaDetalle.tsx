import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Navigation,
  CalendarPlus,
  TrendingUp,
  TrendingDown,
  Minus,
  MoreVertical,
  Phone,
  MapPinOff,
  ClipboardList,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SituacionBadge } from "@/components/SituacionBadge";
import { TramosMapaDialog } from "@/components/TramosMapaDialog";
import { useRutaClientes, usePlanificarRuta, tendencia, eur, fechaCorta, hoyISO, type RutaCliente } from "@/hooks/useCrm";
import { urlCliente, tramos, tieneGeo, optimizarRuta, posicionActual, distanciaTotalKm, type Punto } from "@/lib/maps";


const ICONO = { sube: TrendingUp, baja: TrendingDown, estable: Minus, nuevo: TrendingUp } as const;
const COLOR = {
  sube: "text-emerald-600 dark:text-emerald-400",
  baja: "text-destructive",
  estable: "text-muted-foreground",
  nuevo: "text-emerald-600 dark:text-emerald-400",
} as const;

type Orden = "ventas" | "tendencia" | "visita" | "cercania";

const diasDesde = (iso: string | null) => {
  if (!iso) return null;
  const ms = Date.now() - new Date(`${iso}T00:00:00`).getTime();
  return Math.floor(ms / 86400000);
};

export default function RutaDetalle() {
  const { codigo } = useParams<{ codigo: string }>();
  const ruta = decodeURIComponent(codigo ?? "");
  const { user } = useAuth();
  const [soloActivos, setSoloActivos] = useState(true);
  const { data: clientes, isLoading } = useRutaClientes(ruta, soloActivos);
  const planificar = usePlanificarRuta();

  const [orden, setOrden] = useState<Orden>("ventas");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [planOpen, setPlanOpen] = useState(false);
  const [mapaOpen, setMapaOpen] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [origen, setOrigen] = useState<Punto | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);

  const lista = useMemo(() => {
    const rows = [...(clientes ?? [])];
    if (orden === "tendencia") {
      const peso = (c: RutaCliente) => c.importe_actual - c.importe_anterior_ytd;
      rows.sort((a, b) => peso(a) - peso(b));
    } else if (orden === "visita") {
      rows.sort((a, b) => (a.ultima_visita ?? "").localeCompare(b.ultima_visita ?? ""));
    } else if (orden === "cercania") {
      return optimizarRuta(rows, origen);
    }
    return rows;
  }, [clientes, orden, origen]);

  const pedirGps = async () => {
    setBuscandoGps(true);
    const pos = await posicionActual();
    setBuscandoGps(false);
    if (!pos) {
      toast({
        title: "Sin ubicación",
        description: "No hemos podido obtener tu posición; se ordena desde el primer cliente.",
      });
    }
    setOrigen(pos);
    return pos;
  };

  const cambiarOrden = async (v: Orden) => {
    setOrden(v);
    if (v === "cercania" && !origen) await pedirGps();
  };

  // La selección se mantiene siempre explícita: por defecto, todos los clientes visibles.
  useEffect(() => {
    setSeleccion(new Set(lista.map((c) => c.cod_cliente)));
  }, [lista]);

  const toggle = (cod: number) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });

  const todosMarcados = lista.length > 0 && seleccion.size === lista.length;
  const alternarSeleccion = () =>
    setSeleccion(todosMarcados ? new Set() : new Set(lista.map((c) => c.cod_cliente)));

  const marcados = useMemo(
    () => lista.filter((c) => seleccion.has(c.cod_cliente)),
    [lista, seleccion],
  );
  const ordenadosMapa = useMemo(
    () => (orden === "cercania" ? marcados : optimizarRuta(marcados, origen)),
    [marcados, orden, origen],
  );
  const sinGeo = marcados.filter((c) => !tieneGeo(c));
  const bloques = tramos(ordenadosMapa);
  const kmTotales = distanciaTotalKm(ordenadosMapa, origen);

  const totalActual = lista.reduce((s, c) => s + c.importe_actual, 0);
  const totalAnterior = lista.reduce((s, c) => s + c.importe_anterior_ytd, 0);


  const abrirMapa = () => {
    if (bloques.length === 0) {
      toast({
        title: "Sin ubicaciones",
        description: "Ninguno de estos clientes tiene ubicación registrada todavía.",
        variant: "destructive",
      });
      return;
    }
    setMapaOpen(true);
  };


  const confirmarPlan = () => {
    if (!user) return;
    planificar.mutate(
      { userId: user.id, ruta, fecha, codigos: marcados.map((c) => c.cod_cliente) },
      {
        onSuccess: (n) => {
          setPlanOpen(false);
          toast({
            title: n > 0 ? "Ruta planificada" : "Sin cambios",
            description:
              n > 0
                ? `${n} visitas añadidas a tu agenda del ${fechaCorta(fecha)}.`
                : "Esos clientes ya estaban en la agenda de ese día.",
          });
        },
        onError: (e) =>
          toast({ title: "No se ha podido planificar", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link to="/rutas"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">Ruta {ruta}</h1>
          <p className="text-sm text-muted-foreground">
            {lista.length} {soloActivos ? "clientes activos" : "clientes"} · {eur(totalActual)} año actual ·{" "}
            {eur(totalAnterior)} año anterior
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={orden} onValueChange={(v) => cambiarOrden(v as Orden)}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ventas">Por ventas</SelectItem>
            <SelectItem value="tendencia">Primero los que caen</SelectItem>
            <SelectItem value="visita">Más tiempo sin visitar</SelectItem>
            <SelectItem value="cercania">Ruta más corta (cercanía)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex h-8 items-center rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setSoloActivos(true)}
            className={`h-7 rounded px-2 text-xs ${soloActivos ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setSoloActivos(false)}
            className={`h-7 rounded px-2 text-xs ${soloActivos ? "text-muted-foreground" : "bg-primary text-primary-foreground"}`}
          >
            Todos
          </button>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={alternarSeleccion}>
          {todosMarcados ? "Quitar selección" : "Seleccionar todos"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {seleccion.size} de {lista.length} seleccionados
        </span>

        {orden === "cercania" && (
          <span className="text-xs text-muted-foreground">
            {buscandoGps ? "Buscando tu ubicación…" : `≈ ${kmTotales.toFixed(0)} km`}
          </span>
        )}
      </div>


      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Esta ruta no tiene clientes en tu cartera.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => {
            const t = tendencia(c.importe_actual, c.importe_anterior_ytd);
            const Icono = ICONO[t];
            const dv = diasDesde(c.ultima_visita);
            const marcado = seleccion.has(c.cod_cliente);
            return (
              <div key={c.cod_cliente} className={`rounded-lg border bg-card p-4 ${marcado ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={marcado} onCheckedChange={() => toggle(c.cod_cliente)} className="mt-1" />
                  <Link to={`/clientes/${c.cod_cliente}?volver=${encodeURIComponent(`/rutas/${codigo}`)}&volverTxt=${encodeURIComponent(`Ruta ${ruta}`)}`} className="min-w-0 flex-1">
                    <p className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.cliente}</span>
                      {c.situacion_etiqueta && (
                        <SituacionBadge
                          className="shrink-0"
                          situacion={{
                            etiqueta: c.situacion_etiqueta,
                            categoria: c.situacion_categoria ?? "",
                            nota: null,
                            efecto: c.situacion_efecto,
                          }}
                        />
                      )}
                      {!c.activo && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">inactivo</Badge>
                      )}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>#{c.cod_cliente}</span>
                      {c.localidad && <span>{c.localidad}</span>}
                      <span>
                        {dv == null ? "Sin visitas registradas" : `Visitado hace ${dv} días`}
                      </span>
                      {c.dias_sin_comprar != null && <span>Compró hace {c.dias_sin_comprar} días</span>}
                      {!tieneGeo(c) && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <MapPinOff className="h-3 w-3" />sin ubicación
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{eur(c.importe_actual)}</span>
                    <span className={`flex items-center gap-1 text-xs ${COLOR[t]}`}>
                      <Icono className="h-3 w-3" />
                      {eur(c.importe_anterior_ytd)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/visitas/nueva?cliente=${c.cod_cliente}`}>
                            <ClipboardList className="mr-2 h-4 w-4" />Registrar visita
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/clientes/${c.cod_cliente}?volver=${encodeURIComponent(`/rutas/${codigo}`)}&volverTxt=${encodeURIComponent(`Ruta ${ruta}`)}`}>
                            <User className="mr-2 h-4 w-4" />Ver ficha
                          </Link>
                        </DropdownMenuItem>
                        {c.telefono && (
                          <DropdownMenuItem asChild>
                            <a href={`tel:${c.telefono}`}>
                              <Phone className="mr-2 h-4 w-4" />Llamar
                            </a>
                          </DropdownMenuItem>
                        )}
                        {tieneGeo(c) && (
                          <DropdownMenuItem asChild>
                            <a href={urlCliente(c)!} target="_blank" rel="noopener noreferrer">
                              <Navigation className="mr-2 h-4 w-4" />Cómo llegar
                            </a>
                          </DropdownMenuItem>
                        )}

                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barra de acciones fija */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button variant="outline" className="flex-1" onClick={abrirMapa} disabled={marcados.length === 0}>
            <Navigation className="mr-2 h-4 w-4" />Ver en el mapa
          </Button>
          <Button className="flex-1" onClick={() => setPlanOpen(true)} disabled={marcados.length === 0}>
            <CalendarPlus className="mr-2 h-4 w-4" />Planificar día
          </Button>

        </div>
      </div>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planificar la ruta {ruta}</DialogTitle>
            <DialogDescription>
              Se añadirán {marcados.length} clientes a tu agenda. Podrás quitar o reordenar visitas después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fecha-plan">Fecha</Label>
            <Input id="fecha-plan" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarPlan} disabled={planificar.isPending || marcados.length === 0}>
              {planificar.isPending ? "Guardando…" : "Añadir a la agenda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TramosMapaDialog
        open={mapaOpen}
        onOpenChange={setMapaOpen}
        bloques={bloques}
        sinGeo={sinGeo.length}
      />


      {sinGeo.length > 0 && !mapaOpen && (
        <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
          <MapPinOff className="h-3 w-3" />
          {sinGeo.length} clientes sin ubicación
        </Badge>
      )}
    </div>
  );
}
