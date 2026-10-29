import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, Copy, Loader2, Megaphone, Paperclip, Plus, Trash2, X, Send, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePerfilAtributos } from "@/hooks/useCrm";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnvioMultiple } from "@/components/ofertas/EnvioMultiple";
import { Recomendados } from "@/components/ofertas/Recomendados";
import {
  componerMensaje, enlaceOferta, estadoVisible, PIE_OFERTA,
  type AdjuntoOferta, type EstadoOferta, type RequisitoPerfil,
} from "@/lib/ofertas";

interface Oferta {
  id: string;
  titulo: string;
  descripcion: string | null;
  mensaje: string;
  estado: EstadoOferta;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  marcas: string[];
  referencias: string[];
  familias: string[];
  delegaciones: string[];
  tipos_cliente: string[];
  requisitos: RequisitoPerfil[];
  adjuntos: AdjuntoOferta[];
  token: string;
  updated_at: string;
}

const VACIA: Omit<Oferta, "id" | "token" | "updated_at"> = {
  titulo: "", descripcion: "", mensaje: "Hola {contacto}, ", estado: "borrador",
  vigente_desde: null, vigente_hasta: null, marcas: [], referencias: [], familias: [],
  delegaciones: [], tipos_cliente: [], requisitos: [], adjuntos: [],
};

const ETIQUETA: Record<string, string> = { borrador: "Borrador", publicada: "Publicada", archivada: "Archivada", vencida: "Vencida" };
const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("es-ES") : "—");

type Opcion = { codigo: string; nombre: string };

function useUrlBase() {
  return useQuery({
    queryKey: ["app_setting", "ofertas_url_base"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ofertas_url_base").maybeSingle();
      return data?.value ?? window.location.origin;
    },
  });
}

/** Selector múltiple con búsqueda servida por la base de datos. */
function SelectorMultiple({
  label, valores, onChange, buscar, nombres,
}: {
  label: string;
  valores: string[];
  onChange: (v: string[]) => void;
  buscar: (q: string) => Promise<Opcion[]>;
  nombres?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [vistos, setVistos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setCargando(true);
    const t = setTimeout(async () => {
      const r = await buscar(q);
      if (vivo) { setOpciones(r); setCargando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, abierto, buscar]);

  const nombre = (c: string) => vistos[c] ?? nombres?.[c] ?? c;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {valores.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1">
            {nombre(v)}
            <button type="button" aria-label={`Quitar ${nombre(v)}`} onClick={() => onChange(valores.filter((x) => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs"><Plus className="mr-1 h-3 w-3" />Añadir</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <Input autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8" />
            <div className="max-h-60 overflow-y-auto">
              {cargando ? (
                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : opciones.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Sin resultados</p>
              ) : (
                opciones.map((o) => {
                  const sel = valores.includes(o.codigo);
                  return (
                    <button key={o.codigo} type="button"
                      className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${sel ? "font-medium text-primary" : ""}`}
                      onClick={() => {
                        setVistos((p) => ({ ...p, [o.codigo]: o.nombre }));
                        onChange(sel ? valores.filter((x) => x !== o.codigo) : [...valores, o.codigo]);
                      }}>
                      {o.nombre}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

const buscarOpcion = (tipo: string) => async (q: string): Promise<Opcion[]> => {
  const { data } = await supabase.rpc("ofertas_opciones", { _tipo: tipo, _q: q });
  return (data ?? []).map((o) => ({
    codigo: o.codigo, nombre: tipo === "tipo_cliente" ? `${o.codigo} · ${o.nombre}` : o.nombre,
  }));
};
const buscarMarcas = buscarOpcion("marca");
const buscarFamilias = buscarOpcion("familia");
const buscarTipos = buscarOpcion("tipo_cliente");
const buscarReferencias = async (q: string): Promise<Opcion[]> => {
  const { data } = await supabase.rpc("ofertas_buscar_referencias", { _q: q });
  return (data ?? []).map((p) => ({ codigo: p.referencia, nombre: `${p.referencia} · ${p.descripcion ?? ""}` }));
};
const buscarDelegaciones = async (q: string): Promise<Opcion[]> => {
  const { data } = await supabase.rpc("get_distinct_delegaciones");
  const lista = ((data ?? []) as unknown[]).map((d) => (typeof d === "string" ? d : (d as { delegacion: string }).delegacion)).filter(Boolean);
  return lista.filter((d) => d.toLowerCase().includes(q.toLowerCase())).map((d) => ({ codigo: d, nombre: d }));
};

function EditorOferta({ oferta, onClose }: { oferta: Oferta | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: atributos } = usePerfilAtributos();
  const [f, setF] = useState(() => (oferta ? { ...oferta } : { ...VACIA }));
  const [nuevos, setNuevos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async (estado?: EstadoOferta) => {
    if (!f.titulo.trim()) return toast({ title: "Escribe un título", variant: "destructive" });
    if (f.vigente_desde && f.vigente_hasta && f.vigente_hasta < f.vigente_desde)
      return toast({ title: "La fecha de fin es anterior a la de inicio", variant: "destructive" });
    setGuardando(true);
    try {
      const adjuntos = [...f.adjuntos];
      for (const file of nuevos) {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("ofertas-publicas").upload(path, file, { contentType: file.type });
        if (error) throw error;
        adjuntos.push({ path, nombre: file.name, tipo: file.type || "application/octet-stream", tamano: file.size });
      }
      const fila = {
        titulo: f.titulo.trim(), descripcion: f.descripcion?.trim() || null, mensaje: f.mensaje,
        estado: estado ?? f.estado, vigente_desde: f.vigente_desde || null, vigente_hasta: f.vigente_hasta || null,
        marcas: f.marcas, referencias: f.referencias, familias: f.familias, delegaciones: f.delegaciones,
        tipos_cliente: f.tipos_cliente,
        requisitos: f.requisitos.filter((r) => r.atributo_key) as never,
        adjuntos: adjuntos as never,
      };
      const { error } = oferta
        ? await supabase.from("ofertas").update(fila).eq("id", oferta.id)
        : await supabase.from("ofertas").insert(fila);
      if (error) throw error;
      // Quitar del almacén los adjuntos que se retiraron al editar.
      const quitados = (oferta?.adjuntos ?? []).filter((a) => !adjuntos.some((x) => x.path === a.path)).map((a) => a.path);
      if (quitados.length) await supabase.storage.from("ofertas-publicas").remove(quitados);
      toast({ title: "Oferta guardada" });
      qc.invalidateQueries({ queryKey: ["ofertas"] });
      onClose();
    } catch (e) {
      toast({ title: "No se ha podido guardar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{oferta ? "Editar oferta" : "Nueva oferta"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Título</Label><Input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Descripción (página pública)</Label>
            <Textarea rows={3} value={f.descripcion ?? ""} onChange={(e) => set("descripcion", e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={f.vigente_desde ?? ""} onChange={(e) => set("vigente_desde", e.target.value || null)} /></div>
            <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={f.vigente_hasta ?? ""} onChange={(e) => set("vigente_hasta", e.target.value || null)} /></div>
          </div>

          <div className="space-y-1.5">
            <Label>Mensaje de WhatsApp</Label>
            <Textarea rows={4} value={f.mensaje} onChange={(e) => set("mensaje", e.target.value)} />
            <p className="text-xs text-muted-foreground">Puedes usar {"{contacto}"}. Al final se añade siempre el enlace y este pie:</p>
            <p className="whitespace-pre-line rounded bg-muted px-2 py-1 text-xs">{PIE_OFERTA}</p>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Qué promociona</p>
            <SelectorMultiple label="Marcas" valores={f.marcas} onChange={(v) => set("marcas", v)} buscar={buscarMarcas} />
            <SelectorMultiple label="Referencias" valores={f.referencias} onChange={(v) => set("referencias", v)} buscar={buscarReferencias} />
            <SelectorMultiple label="Familias (opcional)" valores={f.familias} onChange={(v) => set("familias", v)} buscar={buscarFamilias} />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">A quién va dirigida <span className="font-normal text-muted-foreground">(vacío = todos)</span></p>
            <SelectorMultiple label="Delegaciones" valores={f.delegaciones} onChange={(v) => set("delegaciones", v)} buscar={buscarDelegaciones} />
            <SelectorMultiple label="Tipos de cliente" valores={f.tipos_cliente} onChange={(v) => set("tipos_cliente", v)} buscar={buscarTipos} />
            <div className="space-y-2">
              <Label>Requisitos de perfil</Label>
              {f.requisitos.map((r, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row">
                  <Select value={r.atributo_key} onValueChange={(v) => set("requisitos", f.requisitos.map((x, j) => (j === i ? { ...x, atributo_key: v } : x)))}>
                    <SelectTrigger className="sm:w-56"><SelectValue placeholder="Dato del perfil" /></SelectTrigger>
                    <SelectContent>{(atributos ?? []).map((a) => <SelectItem key={a.key} value={a.key}>{a.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Valores, separados por comas" value={r.valores.join(", ")}
                    onChange={(e) => set("requisitos", f.requisitos.map((x, j) => (j === i ? { ...x, valores: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar requisito" onClick={() => set("requisitos", f.requisitos.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => set("requisitos", [...f.requisitos, { atributo_key: "", valores: [] }])}>
                <Plus className="mr-1 h-3 w-3" />Añadir requisito
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Archivos (imagen o PDF, máx. 10 MB)</Label>
            {f.adjuntos.map((a) => (
              <div key={a.path} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                <span className="truncate">{a.nombre}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar archivo" onClick={() => set("adjuntos", f.adjuntos.filter((x) => x.path !== a.path))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            {nuevos.map((file, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-dashed px-2 py-1 text-sm">
                <span className="truncate">{file.name}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar archivo" onClick={() => setNuevos(nuevos.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Input type="file" accept="image/*,application/pdf" multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const grandes = files.filter((x) => x.size > 10 * 1024 * 1024);
                if (grandes.length) toast({ title: "Algún archivo supera 10 MB", variant: "destructive" });
                setNuevos([...nuevos, ...files.filter((x) => x.size <= 10 * 1024 * 1024)]);
                e.target.value = "";
              }} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="secondary" onClick={() => guardar()} disabled={guardando}>Guardar</Button>
          {f.estado === "borrador" && (
            <Button onClick={() => guardar("publicada")} disabled={guardando}>
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publicar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GestionOfertas() {
  const qc = useQueryClient();
  const { data: urlBase } = useUrlBase();
  const [editando, setEditando] = useState<Oferta | null | "nueva">(null);
  const [filtro, setFiltro] = useState<string>("activas");

  const { data: ofertas, isLoading } = useQuery({
    queryKey: ["ofertas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ofertas").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Oferta[];
    },
  });

  const lista = useMemo(() => (ofertas ?? []).filter((o) => {
    const ev = estadoVisible(o.estado, o.vigente_hasta);
    return filtro === "todas" || (filtro === "activas" ? ev === "borrador" || ev === "publicada" : ev === filtro);
  }), [ofertas, filtro]);

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoOferta }) => {
      const { error } = await supabase.from("ofertas").update({ estado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ofertas"] }),
    onError: (e) => toast({ title: "No se ha podido cambiar", description: (e as Error).message, variant: "destructive" }),
  });

  const eliminar = useMutation({
    mutationFn: async (o: Oferta) => {
      const { error } = await supabase.from("ofertas").delete().eq("id", o.id).eq("estado", "borrador");
      if (error) throw error;
      if (o.adjuntos.length) await supabase.storage.from("ofertas-publicas").remove(o.adjuntos.map((a) => a.path));
    },
    onSuccess: () => { toast({ title: "Borrador eliminado" }); qc.invalidateQueries({ queryKey: ["ofertas"] }); },
    onError: (e) => toast({ title: "No se ha podido eliminar", description: (e as Error).message, variant: "destructive" }),
  });

  const copiar = async (o: Oferta) => {
    const texto = componerMensaje(o.mensaje, "", enlaceOferta(urlBase ?? window.location.origin, o.token));
    await navigator.clipboard.writeText(texto);
    toast({ title: "Mensaje copiado" });
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Megaphone className="h-6 w-6 text-primary" />Ofertas</h1>
        <div className="flex gap-2">
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="activas">Activas</SelectItem>
              <SelectItem value="vencida">Vencidas</SelectItem>
              <SelectItem value="archivada">Archivadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setEditando("nueva")}><Plus className="mr-1 h-4 w-4" />Nueva</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : lista.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay ofertas en esta vista.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((o) => {
            const ev = estadoVisible(o.estado, o.vigente_hasta);
            return (
              <Card key={o.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.titulo}</p>
                      <p className="text-xs text-muted-foreground">{fmt(o.vigente_desde)} – {fmt(o.vigente_hasta)}</p>
                    </div>
                    <Badge variant={ev === "publicada" ? "default" : ev === "vencida" ? "destructive" : "secondary"}>{ETIQUETA[ev]}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {o.marcas.length > 0 && <span>{o.marcas.length} marca{o.marcas.length > 1 ? "s" : ""}</span>}
                    {o.referencias.length > 0 && <span>· {o.referencias.length} ref.</span>}
                    {o.delegaciones.length > 0 && <span>· {o.delegaciones.join(", ")}</span>}
                    {o.adjuntos.length > 0 && <span className="flex items-center gap-0.5">· <Paperclip className="h-3 w-3" />{o.adjuntos.length}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditando(o)}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
                    {o.estado === "publicada" && <Button size="sm" variant="outline" onClick={() => copiar(o)}><Copy className="mr-1 h-3 w-3" />Copiar mensaje</Button>}
                    {o.estado === "borrador" && <Button size="sm" onClick={() => cambiarEstado.mutate({ id: o.id, estado: "publicada" })}><Send className="mr-1 h-3 w-3" />Publicar</Button>}
                    {o.estado !== "archivada" && o.estado !== "borrador" && (
                      <Button size="sm" variant="ghost" onClick={() => cambiarEstado.mutate({ id: o.id, estado: "archivada" })}><Archive className="mr-1 h-3 w-3" />Archivar</Button>
                    )}
                    {o.estado === "borrador" && (
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => { if (confirm("¿Eliminar este borrador y sus archivos?")) eliminar.mutate(o); }}>
                        <Trash2 className="mr-1 h-3 w-3" />Eliminar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editando && <EditorOferta oferta={editando === "nueva" ? null : editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

function EnviarOfertas() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Megaphone className="h-6 w-6 text-primary" />Enviar ofertas</h1>
      <Tabs defaultValue="recomendados">
        <TabsList>
          <TabsTrigger value="recomendados">Recomendados</TabsTrigger>
          <TabsTrigger value="tandas">Todos los clientes</TabsTrigger>
        </TabsList>
        <TabsContent value="recomendados"><Recomendados /></TabsContent>
        <TabsContent value="tandas"><EnvioMultiple /></TabsContent>
      </Tabs>
    </div>
  );
}

export default function Ofertas() {
  const { role } = useAuth();
  const gestiona = role === "admin" || role === "director_comercial" || role === "marketing";
  const envia = role === "admin" || role === "director_comercial" || role === "jefe_de_zona" || role === "comercial";
  if (gestiona && !envia) return <GestionOfertas />;
  if (!gestiona) return <EnviarOfertas />;
  return (
    <Tabs defaultValue="gestion">
      <div className="px-4 pt-4 sm:px-6">
        <TabsList>
          <TabsTrigger value="gestion">Gestionar</TabsTrigger>
          <TabsTrigger value="enviar">Enviar</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="gestion"><GestionOfertas /></TabsContent>
      <TabsContent value="enviar"><EnviarOfertas /></TabsContent>
    </Tabs>
  );
}
