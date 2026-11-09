import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Search, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { eur, pct } from "@/lib/format";
import { metaDesde } from "@/lib/objetivosV2";
import {
  cargarObjetivoV2,
  useAvanceV2,
  useObjetivosV2Mutations,
  usePropuestaV2,
  useSinCodigo,
  useTiposObjetivo,
  type AvanceV2,
  type ObjetivoV2Input,
} from "@/hooks/useObjetivosV2";

const anio = new Date().getFullYear();
const nuevo = (): ObjetivoV2Input => ({
  nombre: "",
  tipo: "cartera",
  desde: `${anio}-01-01`,
  hasta: `${anio}-12-31`,
  medida: "importe",
  atribucion: "foto_cartera",
  comparacion: "fecha_corte",
  meta_tipo: "pct",
  meta_valor: 5,
  modo_lista: "conjunto",
  excluir_de_cartera: false,
  contar_ajenos: false,
  tramos: [{ pct: 100, etiqueta: "Objetivo", importe: null }],
  mostrar_importe: false,
  estado: "borrador",
  nota: null,
  asignaciones: [],
  clientes: [],
});

const PASOS = ["Tipo", "Periodo", "Atribución", "Meta de grupo", "Excepciones", "Clientes", "Tramos", "Resumen"];
const ESTADOS: Record<string, string> = { borrador: "Borrador", activo: "Activo", cerrado: "Cerrado", archivado: "Archivado" };

export default function AdminObjetivos() {
  const { data: avance, isLoading } = useAvanceV2();
  const { data: sinCodigo } = useSinCodigo();
  const { duplicar, guardar } = useObjetivosV2Mutations();
  const [abierto, setAbierto] = useState(false);
  const [inicial, setInicial] = useState<ObjetivoV2Input | null>(null);

  const grupos = useMemo(() => {
    const m = new Map<string, AvanceV2[]>();
    for (const a of avance ?? []) m.set(a.objetivo_id, [...(m.get(a.objetivo_id) ?? []), a]);
    return Array.from(m.values());
  }, [avance]);

  const abrir = async (id?: string) => {
    try {
      setInicial(id ? await cargarObjetivoV2(id) : nuevo());
      setAbierto(true);
    } catch (e) {
      toast({ title: "No se pudo abrir el objetivo", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onDuplicar = async (id: string) => {
    try {
      await duplicar.mutateAsync(id);
      toast({ title: "Copia creada como borrador para el periodo siguiente" });
    } catch (e) {
      toast({ title: "No se pudo duplicar", description: (e as Error).message, variant: "destructive" });
    }
  };

  const onArchivar = async (id: string) => {
    try {
      const d = await cargarObjetivoV2(id);
      await guardar.mutateAsync({ ...d, estado: "archivado" });
      toast({ title: "Objetivo archivado" });
    } catch (e) {
      toast({ title: "No se pudo archivar", description: (e as Error).message, variant: "destructive" });
    }
  };

  const usuariosSinCodigo = (sinCodigo ?? []).filter((s) => s.caso === "usuario_sin_codigo");

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Target className="h-5 w-5 text-primary" /> Objetivos comerciales
        </h1>
        <Button onClick={() => abrir()}><Plus className="mr-2 h-4 w-4" /> Nuevo objetivo</Button>
      </div>

      {usuariosSinCodigo.length > 0 && <AvisoSinCodigo nombres={usuariosSinCodigo.map((s) => s.nombre ?? s.username ?? "")} />}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : grupos.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No hay objetivos.</CardContent></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {grupos.map((g) => {
            const o = g[0];
            const vendido = g.reduce((s, x) => s + (x.vendido ?? 0), 0);
            const meta = g.reduce((s, x) => s + (x.meta ?? 0), 0);
            return (
              <Card key={o.objetivo_id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.nombre}</p>
                      <p className="text-xs text-muted-foreground">{o.desde} → {o.hasta} · {g.length} comerciales</p>
                    </div>
                    <Badge variant={o.estado === "activo" ? "default" : "outline"}>{ESTADOS[o.estado] ?? o.estado}</Badge>
                  </div>
                  <p className="text-sm">{eur(vendido)} de {eur(meta)} · <b>{pct(meta > 0 ? (vendido / meta) * 100 : 0)}</b></p>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => abrir(o.objetivo_id)}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => onDuplicar(o.objetivo_id)}><Copy className="mr-1 h-3.5 w-3.5" /> Duplicar</Button>
                    <Button size="sm" variant="ghost" onClick={() => onArchivar(o.objetivo_id)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Archivar</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {abierto && inicial && (
        <Asistente inicial={inicial} sinCodigo={usuariosSinCodigo.map((s) => s.nombre ?? s.username ?? "")} onClose={() => setAbierto(false)} />
      )}
    </div>
  );
}

function AvisoSinCodigo({ nombres }: { nombres: string[] }) {
  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        Sin código de vendedor (no se calcula su avance): <b>{nombres.join(", ")}</b>. Asígnalo en Usuarios.
      </AlertDescription>
    </Alert>
  );
}

function Asistente({ inicial, sinCodigo, onClose }: { inicial: ObjetivoV2Input; sinCodigo: string[]; onClose: () => void }) {
  const [d, setD] = useState<ObjetivoV2Input>(inicial);
  const [paso, setPaso] = useState(0);
  const set = (p: Partial<ObjetivoV2Input>) => setD((x) => ({ ...x, ...p }));
  const { data: tipos } = useTiposObjetivo();
  const pctGrupo = d.meta_tipo === "pct" ? d.meta_valor ?? 0 : 0;
  const { data: propuesta, isLoading: cargandoProp } = usePropuestaV2(d.desde, d.hasta, pctGrupo, paso >= 3);
  const { guardar } = useObjetivosV2Mutations();
  const esLista = d.tipo === "clientes" || d.tipo === "cliente";
  const asignados = new Set(d.asignaciones.map((a) => a.vendedor));

  const toggleVendedor = (v: string, on: boolean) =>
    set({ asignaciones: on ? [...d.asignaciones, { vendedor: v, meta_tipo: null, meta_valor: null }] : d.asignaciones.filter((a) => a.vendedor !== v) });

  const setExcepcion = (v: string, p: Partial<ObjetivoV2Input["asignaciones"][number]>) =>
    set({ asignaciones: d.asignaciones.map((a) => (a.vendedor === v ? { ...a, ...p } : a)) });

  const onGuardar = async (estado: string) => {
    try {
      await guardar.mutateAsync({ ...d, estado });
      toast({ title: estado === "borrador" ? "Borrador guardado" : "Objetivo guardado" });
      onClose();
    } catch (e) {
      toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d.id ? "Editar objetivo" : "Nuevo objetivo"} · {paso + 1}/{PASOS.length} {PASOS[paso]}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          {PASOS.map((p, i) => (
            <button key={p} type="button" onClick={() => setPaso(i)} className={`h-1.5 flex-1 rounded ${i <= paso ? "bg-primary" : "bg-muted"}`} aria-label={p} />
          ))}
        </div>

        {sinCodigo.length > 0 && paso === 3 && <AvisoSinCodigo nombres={sinCodigo} />}

        <div className="min-h-[240px] space-y-3">
          {paso === 0 && (
            <RadioGroup value={d.tipo} onValueChange={(v) => set({ tipo: v, atribucion: v === "cartera" ? d.atribucion : "ficha_actual" })}>
              {(tipos ?? []).map((t) => (
                <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value={t.key} className="mt-1" />
                  <div><p className="font-medium">{t.nombre}</p><p className="text-xs text-muted-foreground">{t.descripcion}</p></div>
                </label>
              ))}
            </RadioGroup>
          )}

          {paso === 1 && (
            <>
              <div><Label>Nombre</Label><Input value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Ej. Cartera 2027" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Desde</Label><Input type="date" value={d.desde} onChange={(e) => set({ desde: e.target.value })} /></div>
                <div><Label>Hasta</Label><Input type="date" value={d.hasta} onChange={(e) => set({ hasta: e.target.value })} /></div>
              </div>
              <div>
                <Label>Qué se mide</Label>
                <Select value={d.medida} onValueChange={(v) => set({ medida: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="importe">Facturación (€)</SelectItem>
                    <SelectItem value="margen">Margen (€)</SelectItem>
                    <SelectItem value="unidades">Unidades</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {paso === 2 && (
            <>
              <div>
                <Label>A quién se atribuye la venta</Label>
                <RadioGroup value={d.atribucion} onValueChange={(v) => set({ atribucion: v })} className="mt-2">
                  <label className="flex items-start gap-2"><RadioGroupItem value="foto_cartera" className="mt-1" /><span><b>Foto de la cartera al crear</b> — los mismos clientes en los dos años.</span></label>
                  <label className="flex items-start gap-2"><RadioGroupItem value="ficha_actual" className="mt-1" /><span><b>Comercial actual de la ficha</b> — si un cliente cambia de comercial, se mueve con él.</span></label>
                </RadioGroup>
              </div>
              <div>
                <Label>Hasta qué fecha se compara el año anterior</Label>
                <RadioGroup value={d.comparacion} onValueChange={(v) => set({ comparacion: v })} className="mt-2">
                  <label className="flex items-center gap-2"><RadioGroupItem value="fecha_corte" /> Hasta la misma fecha de los datos</label>
                  <label className="flex items-center gap-2"><RadioGroupItem value="quincena_completa" /> Hasta la última quincena completa</label>
                </RadioGroup>
              </div>
              {esLista && (
                <label className="flex items-center gap-2"><Checkbox checked={d.contar_ajenos} onCheckedChange={(v) => set({ contar_ajenos: !!v })} /> Contar también clientes de la lista que sean de otro comercial</label>
              )}
            </>
          )}

          {paso === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Meta de grupo</Label>
                  <Select value={d.meta_tipo} onValueChange={(v) => set({ meta_tipo: v as "pct" | "importe" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pct">% sobre el año anterior</SelectItem>
                      <SelectItem value="importe">Importe fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{d.meta_tipo === "pct" ? "Crecimiento (%)" : "Importe"}</Label><Input type="number" value={d.meta_valor ?? ""} onChange={(e) => set({ meta_valor: e.target.value === "" ? null : Number(e.target.value) })} /></div>
              </div>
              {esLista && (
                <div>
                  <Label>Meta de la lista</Label>
                  <Select value={d.modo_lista} onValueChange={(v) => set({ modo_lista: v as "conjunto" | "por_cliente" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conjunto">Conjunta para todos los clientes</SelectItem>
                      <SelectItem value="por_cliente">Una meta por cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Label>Comerciales</Label>
              {cargandoProp ? <Skeleton className="h-40" /> : (
                <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  <div className="flex items-center justify-between p-2 text-xs">
                    <span className="text-muted-foreground">Base = mismo periodo del año anterior</span>
                    <Button size="sm" variant="ghost" onClick={() => set({ asignaciones: asignados.size ? [] : (propuesta ?? []).map((p) => ({ vendedor: p.vendedor, meta_tipo: null, meta_valor: null })) })}>
                      {asignados.size ? "Quitar todos" : "Todos"}
                    </Button>
                  </div>
                  {(propuesta ?? []).map((p) => (
                    <label key={p.vendedor} className="flex items-center gap-2 p-2 text-sm">
                      <Checkbox checked={asignados.has(p.vendedor)} onCheckedChange={(v) => toggleVendedor(p.vendedor, !!v)} />
                      <span className="flex-1">{p.vendedor}{!p.user_id && <span className="ml-1 text-xs text-muted-foreground">(sin usuario)</span>}</span>
                      <span className="text-xs text-muted-foreground">{eur(p.base_anterior)} → {eur(metaDesde(d.meta_tipo, d.meta_valor, p.base_anterior))}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {paso === 4 && (
            <>
              <p className="text-sm text-muted-foreground">Deja vacío para usar la meta de grupo. Pon un valor solo para las excepciones.</p>
              {d.asignaciones.length === 0 && <p className="text-sm">Primero elige comerciales en «Meta de grupo».</p>}
              {d.asignaciones.map((a) => {
                const base = propuesta?.find((p) => p.vendedor === a.vendedor)?.base_anterior ?? 0;
                const tipo = a.meta_tipo ?? d.meta_tipo;
                const val = a.meta_valor ?? d.meta_valor;
                return (
                  <div key={a.vendedor} className="grid grid-cols-[1fr_8rem_7rem] items-center gap-2 text-sm">
                    <span className="truncate">{a.vendedor}<br /><span className="text-xs text-muted-foreground">Meta: {eur(metaDesde(tipo, val, base))}</span></span>
                    <Select value={a.meta_tipo ?? "grupo"} onValueChange={(v) => setExcepcion(a.vendedor, { meta_tipo: v === "grupo" ? null : (v as "pct" | "importe"), meta_valor: v === "grupo" ? null : a.meta_valor })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grupo">De grupo</SelectItem>
                        <SelectItem value="pct">%</SelectItem>
                        <SelectItem value="importe">Importe</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" disabled={!a.meta_tipo} value={a.meta_valor ?? ""} onChange={(e) => setExcepcion(a.vendedor, { meta_valor: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                );
              })}
            </>
          )}

          {paso === 5 && <PasoClientes d={d} set={set} />}

          {paso === 6 && (
            <>
              <p className="text-sm text-muted-foreground">Cada tramo se alcanza al llegar a ese % de la meta. El importe en euros es opcional.</p>
              {d.tramos.map((t, i) => (
                <div key={i} className="grid grid-cols-[5rem_1fr_7rem_auto] items-center gap-2">
                  <Input type="number" value={t.pct} onChange={(e) => set({ tramos: d.tramos.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })} aria-label="%" />
                  <Input value={t.etiqueta} onChange={(e) => set({ tramos: d.tramos.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)) })} aria-label="Etiqueta" />
                  <Input type="number" placeholder="€ opcional" value={t.importe ?? ""} onChange={(e) => set({ tramos: d.tramos.map((x, j) => (j === i ? { ...x, importe: e.target.value === "" ? null : Number(e.target.value) } : x)) })} />
                  <Button size="icon" variant="ghost" onClick={() => set({ tramos: d.tramos.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set({ tramos: [...d.tramos, { pct: 110, etiqueta: "", importe: null }] })}><Plus className="mr-1 h-3.5 w-3.5" /> Añadir tramo</Button>
              <label className="flex items-center gap-2"><Switch checked={d.mostrar_importe} onCheckedChange={(v) => set({ mostrar_importe: v })} /> Enseñar el importe del tramo al comercial</label>
            </>
          )}

          {paso === 7 && (
            <div className="space-y-1 text-sm">
              <p><b>{d.nombre || "(sin nombre)"}</b> · {d.desde} → {d.hasta}</p>
              <p>Tipo: {tipos?.find((t) => t.key === d.tipo)?.nombre} · Atribución: {d.atribucion === "foto_cartera" ? "foto de la cartera" : "ficha actual"}</p>
              <p>Meta de grupo: {d.meta_tipo === "pct" ? `+${d.meta_valor ?? 0} %` : eur(d.meta_valor)} · {d.asignaciones.length} comerciales · {d.asignaciones.filter((a) => a.meta_tipo).length} excepciones</p>
              <p>Clientes a mano: {d.clientes.length}{d.excluir_de_cartera ? " · excluidos de la cartera" : ""}</p>
              <p>Tramos: {[...d.tramos].sort((a, b) => a.pct - b.pct).map((t) => `${t.etiqueta} ${t.pct} %`).join(" · ")}</p>
              <Textarea placeholder="Nota (criterio con el que se ha fijado)" value={d.nota ?? ""} onChange={(e) => set({ nota: e.target.value })} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row flex-wrap justify-between gap-2 sm:justify-between">
          <Button variant="outline" disabled={paso === 0} onClick={() => setPaso(paso - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Atrás</Button>
          {paso < PASOS.length - 1 ? (
            <Button onClick={() => setPaso(paso + 1)}>Siguiente <ChevronRight className="ml-1 h-4 w-4" /></Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" disabled={guardar.isPending} onClick={() => onGuardar("borrador")}>Guardar borrador</Button>
              <Button disabled={guardar.isPending} onClick={() => onGuardar(d.estado === "cerrado" ? "cerrado" : "activo")}>Activar</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasoClientes({ d, set }: { d: ObjetivoV2Input; set: (p: Partial<ObjetivoV2Input>) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ cod_cliente: number; cliente: string; vendedor: string | null }[]>([]);
  const asignados = d.asignaciones.map((a) => a.vendedor);

  const buscar = async () => {
    const t = q.trim();
    if (!t) return;
    let query = supabase.from("clientes").select("cod_cliente, cliente, vendedor").limit(20);
    query = /^\d+$/.test(t) ? query.eq("cod_cliente", Number(t)) : query.ilike("cliente", `%${t}%`);
    const { data, error } = await query;
    if (error) toast({ title: "No se pudo buscar", description: error.message, variant: "destructive" });
    setRes(data ?? []);
  };

  const anadir = (c: { cod_cliente: number; cliente: string; vendedor: string | null }) => {
    if (d.clientes.some((x) => x.cod_cliente === c.cod_cliente)) return;
    const vend = c.vendedor && asignados.includes(c.vendedor) ? c.vendedor : asignados.length === 1 ? asignados[0] : null;
    set({ clientes: [...d.clientes, { cod_cliente: c.cod_cliente, vendedor: vend, meta_tipo: null, meta_valor: null, nombre: c.cliente }] });
  };

  return (
    <>
      {d.tipo === "cartera" && (
        <p className="text-sm text-muted-foreground">
          En la cartera los clientes salen solos de la ficha{d.atribucion === "foto_cartera" ? " (foto al guardar)" : ""}. No hace falta añadir ninguno.
        </p>
      )}
      {d.tipo !== "cartera" && (
        <>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={d.excluir_de_cartera} onCheckedChange={(v) => set({ excluir_de_cartera: !!v })} /> Excluir estos clientes de la cartera del comercial</label>
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="Nombre o código de cliente" />
            <Button variant="outline" onClick={buscar}><Search className="h-4 w-4" /></Button>
          </div>
          {res.length > 0 && (
            <div className="max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
              {res.map((c) => (
                <button key={c.cod_cliente} type="button" className="flex w-full justify-between p-2 text-left hover:bg-muted" onClick={() => anadir(c)}>
                  <span>{c.cod_cliente} · {c.cliente}</span><span className="text-xs text-muted-foreground">{c.vendedor}</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1">
            {d.clientes.map((c) => (
              <div key={c.cod_cliente} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-2 text-sm sm:grid-cols-[1fr_9rem_7rem_6rem_auto]">
                <span className="truncate">{c.cod_cliente} · {c.nombre ?? ""}</span>
                <Select value={c.vendedor ?? "__"} onValueChange={(v) => set({ clientes: d.clientes.map((x) => (x.cod_cliente === c.cod_cliente ? { ...x, vendedor: v === "__" ? null : v } : x)) })}>
                  <SelectTrigger className="hidden sm:flex"><SelectValue placeholder="Comercial" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__">Sin comercial</SelectItem>
                    {asignados.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                {d.modo_lista === "por_cliente" ? (
                  <>
                    <Select value={c.meta_tipo ?? "pct"} onValueChange={(v) => set({ clientes: d.clientes.map((x) => (x.cod_cliente === c.cod_cliente ? { ...x, meta_tipo: v as "pct" | "importe" } : x)) })}>
                      <SelectTrigger className="hidden sm:flex"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="pct">%</SelectItem><SelectItem value="importe">Importe</SelectItem></SelectContent>
                    </Select>
                    <Input type="number" className="hidden sm:block" value={c.meta_valor ?? ""} onChange={(e) => set({ clientes: d.clientes.map((x) => (x.cod_cliente === c.cod_cliente ? { ...x, meta_tipo: x.meta_tipo ?? "pct", meta_valor: e.target.value === "" ? null : Number(e.target.value) } : x)) })} />
                  </>
                ) : <span className="hidden sm:block sm:col-span-2" />}
                <Button size="icon" variant="ghost" onClick={() => set({ clientes: d.clientes.filter((x) => x.cod_cliente !== c.cod_cliente) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
