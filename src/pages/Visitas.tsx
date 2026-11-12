import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, CalendarDays, MapPin, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVisitas, useClientes, useMotivos, useVisitaBloques, fechaCorta } from "@/hooks/useCrm";
import { useAuth } from "@/hooks/useAuth";
import { CompletarDatosVisita } from "@/components/CompletarDatosVisita";
import { agruparMotivos, quitarMarcaInterna, etiquetaNoEfectiva, estadoRevision, bloquesCompletables, muestraEtiquetaEstado } from "@/lib/resumenVisita";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { nombreDoc, type DocVisita } from "@/components/DocumentosVisita";
import { BotonAdjunto } from "@/components/VisorAdjunto";

export default function Visitas() {
  const { data: visitas, isLoading } = useVisitas(300);
  useScrollRestore("visitas", !isLoading);
  const { data: clientes } = useClientes(false);
  const { data: motivos } = useMotivos();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [motivoFiltro, setMotivoFiltro] = useState("todos");

  const docsDe = (v: { campos: Record<string, unknown> }): DocVisita[] =>
    ((v.campos as { documentos?: DocVisita[] } | null)?.documentos ?? []).filter((d) => d?.path);

  const nombreCliente = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of clientes ?? []) m.set(c.cod_cliente, c.cliente);
    return m;
  }, [clientes]);

  const motivoNombre = useMemo(() => {
    const m = new Map<string, string>();
    for (const mo of motivos ?? []) m.set(mo.key, mo.nombre);
    return m;
  }, [motivos]);

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
            const bs = bloquesMap?.get(v.id) ?? [];
            const noEf = etiquetaNoEfectiva(v.resultado_visita);
            const incompleta = bs.some((b) => !b.completo);
            const estado = estadoRevision(v.validacion);
            const preview = quitarMarcaInterna(v.observaciones || v.transcripcion);
            const completables = bloquesCompletables(!!user && v.user_id === user.id, bs);
            const acciones = completables.length > 0 && (
              <div className="px-4 pb-3"><CompletarDatosVisita bloques={completables} motivos={motivos} /></div>
            );
            const contenido = (
              <>
                <div className="min-w-0">
                  <p className="truncate font-medium">{titulo(v)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fechaCorta(v.fecha)}
                    {v.hora ? ` · ${v.hora.slice(0, 5)}` : ""}
                    {v.comercial_nombre ? ` · ${v.comercial_nombre}` : ""}
                    {v.ruta ? ` · Ruta ${v.ruta}` : ""}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {noEf ? (
                    <Badge variant="outline">{noEf}</Badge>
                  ) : (
                    agruparMotivos(motivosDe(v.id, v.motivo_key).length ? motivosDe(v.id, v.motivo_key) : [null]).map((g) => (
                      <Badge key={String(g.key)} variant="secondary">
                        {(g.key && motivoNombre.get(g.key)) || "Visita"}{g.n > 1 ? ` ×${g.n}` : ""}
                      </Badge>
                    ))
                  )}
                  {v.tipo === "llamada" && <Badge variant="outline">Llamada</Badge>}
                  {incompleta && <Badge variant="outline" className="border-destructive/50 text-destructive">Incompleta</Badge>}
                  {muestraEtiquetaEstado(v.origen, v.validacion) && (
                    <Badge variant={estado === "No correcto" ? "destructive" : "outline"}>{estado}</Badge>
                  )}
                </div>
                {preview && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
                )}
                {docsDe(v).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {docsDe(v).map((d) => (
                      <span key={d.path} className="inline-flex max-w-full items-center gap-1">
                        <BotonAdjunto adjunto={{ path: d.path!, nombre: nombreDoc(d), tipo: d.tipo, tamano: d.tamano }} />
                        {d.motivo_key && motivoNombre.get(d.motivo_key) && (
                          <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                            {motivoNombre.get(d.motivo_key)}
                          </Badge>
                        )}
                      </span>
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
            return (
              <div key={v.id} className="rounded-lg border bg-card">
                {v.cod_cliente != null ? (
                  <Link to={`/clientes/${v.cod_cliente}?volver=${encodeURIComponent('/visitas')}&volverTxt=${encodeURIComponent('Visitas')}`} className="block rounded-lg p-4 hover:bg-accent">
                    {contenido}
                  </Link>
                ) : (
                  <div className="p-4">{contenido}</div>
                )}
                {acciones}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
