import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVisitas, useClientes, useMotivos, useVisitaBloques, fechaCorta } from "@/hooks/useCrm";
import { useScrollRestore } from "@/hooks/useScrollRestore";

export default function Visitas() {
  const { data: visitas, isLoading } = useVisitas(300);
  useScrollRestore("visitas", !isLoading);
  const { data: clientes } = useClientes(false);
  const { data: motivos } = useMotivos();
  const [q, setQ] = useState("");
  const [motivoFiltro, setMotivoFiltro] = useState("todos");

  const nombreCliente = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of clientes ?? []) m.set(c.cod_cliente, c.cliente);
    return m;
  }, [clientes]);

  const titulo = (v: { cod_cliente: number | null; cliente_externo: string | null }) =>
    v.cod_cliente != null
      ? nombreCliente.get(v.cod_cliente) ?? `Cliente #${v.cod_cliente}`
      : v.cliente_externo ?? "Cliente potencial";

  // Bloques de las visitas cargadas: cada visita puede llevar varias plantillas.
  const { data: bloquesMap } = useVisitaBloques((visitas ?? []).map((v) => v.id));

  const motivosDe = (id: string, legacy: string | null) => {
    const bs = bloquesMap?.get(id) ?? [];
    if (bs.length) return bs.map((b) => b.motivo_key).filter(Boolean) as string[];
    return legacy ? [legacy] : [];
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (visitas ?? []).filter((v) => {
      if (motivoFiltro !== "todos" && !motivosDe(v.id, v.motivo_key).includes(motivoFiltro)) return false;
      if (!term) return true;
      return (
        titulo(v).toLowerCase().includes(term) ||
        (v.comercial_nombre ?? "").toLowerCase().includes(term) ||
        (v.ruta ?? "").toLowerCase().includes(term)
      );
    });
  }, [visitas, q, motivoFiltro, nombreCliente, bloquesMap]);


  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Visitas</h1>
          <p className="text-sm text-muted-foreground">Histórico de visitas registradas</p>
        </div>
        <Button asChild>
          <Link to="/visitas/nueva"><Plus className="mr-2 h-4 w-4" />Nueva</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cliente, comercial o ruta…"
            className="pl-9"
          />
        </div>
        <Select value={motivoFiltro} onValueChange={setMotivoFiltro}>
          <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los motivos</SelectItem>
            {(motivos ?? []).map((m) => <SelectItem key={m.key} value={m.key}>{m.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay visitas que coincidan con la búsqueda.</p>
            <Button asChild variant="outline"><Link to="/visitas/nueva">Registrar una visita</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const contenido = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{titulo(v)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fechaCorta(v.fecha)}
                      {v.hora ? ` · ${v.hora.slice(0, 5)}` : ""}
                      {v.comercial_nombre ? ` · ${v.comercial_nombre}` : ""}
                      {v.ruta ? ` · Ruta ${v.ruta}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {(motivosDe(v.id, v.motivo_key).length ? motivosDe(v.id, v.motivo_key) : [null]).map((k, i) => (
                      <Badge key={`${k}-${i}`} variant="secondary">
                        {motivos?.find((m) => m.key === k)?.nombre ?? "Visita"}
                      </Badge>
                    ))}
                    {v.validacion && v.validacion !== "pendiente" && (
                      <Badge variant={v.validacion === "CORRECTO" ? "outline" : "destructive"}>
                        {v.validacion === "CORRECTO" ? "Correcto" : "No correcto"}
                      </Badge>
                    )}
                  </div>
                </div>
                {(v.observaciones || v.transcripcion) && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {v.observaciones || v.transcripcion}
                  </p>
                )}
                {docsDe(v).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {docsDe(v).map((d) => (
                      <button
                        key={d.path}
                        type="button"
                        className="flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void abrirDocumento(d.path);
                        }}
                      >
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span className="truncate">{d.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
                {v.latitud != null && v.longitud != null && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />Visita geolocalizada
                  </p>
                )}
              </>
            );
            return v.cod_cliente != null ? (
              <Link key={v.id} to={`/clientes/${v.cod_cliente}?volver=${encodeURIComponent('/visitas')}&volverTxt=${encodeURIComponent('Visitas')}`} className="block rounded-lg border bg-card p-4 hover:bg-accent">
                {contenido}
              </Link>
            ) : (
              <div key={v.id} className="rounded-lg border bg-card p-4">{contenido}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
