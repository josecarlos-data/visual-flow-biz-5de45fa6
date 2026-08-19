import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, Route as RouteIcon, User, ArrowDownAZ, ArrowDownWideNarrow } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientes, useSituacionesVigentes, eur, fechaCorta, type OrdenClientes } from "@/hooks/useCrm";
import { SituacionBadge } from "@/components/SituacionBadge";

export default function Clientes() {
  const [soloActivos, setSoloActivos] = useState(true);
  const [orden, setOrden] = useState<OrdenClientes>("ventas");
  const { data: clientes, isLoading, error } = useClientes(soloActivos, orden);
  const { mapa: situaciones } = useSituacionesVigentes();
  const [q, setQ] = useState("");
  const [ruta, setRuta] = useState("todas");

  const rutas = useMemo(() => {
    const s = new Set<string>();
    for (const c of clientes ?? []) if (c.ruta) s.add(c.ruta);
    return Array.from(s).sort();
  }, [clientes]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (clientes ?? []).filter((c) => {
      if (ruta !== "todas" && c.ruta !== ruta) return false;
      if (!term) return true;
      return (
        c.cliente.toLowerCase().includes(term) ||
        String(c.cod_cliente).includes(term) ||
        (c.localidad ?? "").toLowerCase().includes(term)
      );
    });
  }, [clientes, q, ruta]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Clientes</h1>
        <p className="text-sm text-muted-foreground">Tu cartera y la ficha completa de cada cliente</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, código o localidad…"
            className="pl-9"
          />
        </div>
        {rutas.length > 0 && (
          <Select value={ruta} onValueChange={setRuta}>
            <SelectTrigger className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las rutas</SelectItem>
              {rutas.map((r) => (
                <SelectItem key={r} value={r}>
                  Ruta {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            size="sm"
            variant={soloActivos ? "secondary" : "ghost"}
            className="h-7 px-3 text-xs"
            onClick={() => setSoloActivos(true)}
          >
            Activos
          </Button>
          <Button
            size="sm"
            variant={soloActivos ? "ghost" : "secondary"}
            className="h-7 px-3 text-xs"
            onClick={() => setSoloActivos(false)}
          >
            Todos
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setOrden((o) => (o === "ventas" ? "alfabetico" : "ventas"))}
        >
          {orden === "ventas" ? <ArrowDownWideNarrow className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
          {orden === "ventas" ? "Por ventas" : "A-Z"}
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            No se ha podido cargar la cartera: {(error as Error).message}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan con la búsqueda.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} clientes {soloActivos ? "activos" : "en total"}
          </p>
          <div className="space-y-2">
            {filtered.slice(0, 300).map((c) => (
              <Link
                key={c.cod_cliente}
                to={`/clientes/${c.cod_cliente}?volver=${encodeURIComponent('/clientes')}&volverTxt=${encodeURIComponent('Clientes')}`}
                className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{c.cliente}</span>
                      {situaciones.get(c.cod_cliente) && (
                        <SituacionBadge className="shrink-0" situacion={situaciones.get(c.cod_cliente)!} />
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>#{c.cod_cliente}</span>
                      {c.localidad && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.localidad}
                        </span>
                      )}
                      {c.vendedor && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {c.vendedor}
                        </span>
                      )}
                      {c.ultima_compra && <span>Última compra {fechaCorta(c.ultima_compra)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{eur(c.importe_actual)}</span>
                    {c.ruta && (
                      <Badge variant="secondary" className="gap-1">
                        <RouteIcon className="h-3 w-3" />
                        {c.ruta}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {filtered.length > 300 && (
            <p className="text-center text-xs text-muted-foreground">
              Mostrando 300 de {filtered.length}. Afina la búsqueda para ver más.
            </p>
          )}
        </>
      )}
    </div>
  );
}
