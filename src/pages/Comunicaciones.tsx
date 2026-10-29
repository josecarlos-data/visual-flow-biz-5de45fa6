import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "@e965/xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Download, Loader2, MessagesSquare } from "lucide-react";
import { ETIQUETA_ENVIO, estadoEnvioVisible } from "@/lib/ofertasEnvio";
import { diferenciaFrenteControl, variacionPct } from "@/lib/comunicaciones";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));
const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} %`);
const fecha = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("es-ES");
const POR_PAGINA = 50;

interface Fila {
  id: string; abierto_en: string; estado: string; cod_cliente: number; cliente: string; delegacion: string | null;
  oferta_id: string; oferta_titulo: string; comercial_nombre: string | null; telefono: string; mensaje: string;
  ventas_antes: number; ventas_despues: number | null; pendiente_datos: boolean; fecha_corte: string; total: number;
}

function hace(dias: number) {
  const d = new Date(); d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export default function Comunicaciones() {
  const [desde, setDesde] = useState(hace(90));
  const [hasta, setHasta] = useState("");
  const [oferta, setOferta] = useState("todas");
  const [estado, setEstado] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const [abierta, setAbierta] = useState<Fila | null>(null);
  const [exportando, setExportando] = useState(false);

  const filtros = {
    _desde: desde || null, _hasta: hasta || null,
    _oferta_id: oferta === "todas" ? null : oferta, _estado: estado === "todos" ? null : estado,
  };

  const listado = useQuery({
    queryKey: ["comunicaciones_listado", filtros, pagina],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comunicaciones_listado", { ...filtros, _limit: POR_PAGINA, _offset: pagina * POR_PAGINA } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });
  const porOferta = useQuery({
    queryKey: ["comunicaciones_resumen_oferta", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comunicaciones_resumen_oferta", { _desde: desde || null, _hasta: hasta || null } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, number & string>[];
    },
  });
  const porComercial = useQuery({
    queryKey: ["comunicaciones_resumen_comercial", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comunicaciones_resumen_comercial", { _desde: desde || null, _hasta: hasta || null } as never);
      if (error) throw error;
      return (data ?? []) as unknown as { user_id: string; comercial_nombre: string | null; envios: number; enviados: number; no_enviados: number; pendientes: number; clientes: number }[];
    },
  });

  const ofertas = useMemo(() => (porOferta.data ?? []).map((o) => ({ id: o.oferta_id as unknown as string, titulo: o.titulo as unknown as string })), [porOferta.data]);
  const total = listado.data?.[0]?.total ?? 0;
  const corte = listado.data?.[0]?.fecha_corte ?? (porOferta.data?.[0]?.fecha_corte as unknown as string | undefined);

  const exportar = async () => {
    setExportando(true);
    const { data } = await supabase.rpc("comunicaciones_listado", { ...filtros, _limit: 5000, _offset: 0 } as never);
    const filas = ((data ?? []) as unknown as Fila[]).map((f) => ({
      Fecha: fecha(f.abierto_en), Cliente: f.cliente, Código: f.cod_cliente, Delegación: f.delegacion ?? "",
      Oferta: f.oferta_titulo, Comercial: f.comercial_nombre ?? "", Estado: ETIQUETA_ENVIO[estadoEnvioVisible(f.estado, f.abierto_en)],
      "Ventas 30 días antes": Number(f.ventas_antes), "Ventas 30 días después": f.ventas_despues == null ? "Pendiente" : Number(f.ventas_despues),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Envíos");
    XLSX.writeFile(wb, `comunicaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExportando(false);
  };

  const cambiar = (fn: () => void) => { fn(); setPagina(0); };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><MessagesSquare className="h-6 w-6 text-primary" />Comunicaciones</h1>

      <Card><CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => cambiar(() => setDesde(e.target.value))} /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => cambiar(() => setHasta(e.target.value))} /></div>
        <div><Label className="text-xs">Oferta</Label>
          <Select value={oferta} onValueChange={(v) => cambiar(() => setOferta(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {ofertas.map((o) => <SelectItem key={o.id} value={o.id}>{o.titulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Estado</Label>
          <Select value={estado} onValueChange={(v) => cambiar(() => setEstado(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(ETIQUETA_ENVIO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>
      {corte && <p className="text-xs text-muted-foreground">Datos de ventas hasta el {fecha(corte)}. Las ventas posteriores se muestran cuando los datos cubren los 30 días siguientes al envío.</p>}

      <Tabs defaultValue="envios">
        <TabsList>
          <TabsTrigger value="envios">Envíos</TabsTrigger>
          <TabsTrigger value="ofertas">Por oferta</TabsTrigger>
          <TabsTrigger value="comerciales">Por comercial</TabsTrigger>
        </TabsList>

        <TabsContent value="envios" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{total} envío{total === 1 ? "" : "s"}</p>
            <Button size="sm" variant="outline" disabled={!total || exportando} onClick={exportar}>
              {exportando ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}Exportar a Excel
            </Button>
          </div>
          {listado.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            : listado.error ? <p className="text-sm text-destructive">No se han podido cargar los envíos.</p>
            : !listado.data?.length ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay envíos en este periodo.</CardContent></Card>
            : (
              <Card><CardContent className="divide-y p-0">
                {listado.data.map((f) => {
                  const ev = estadoEnvioVisible(f.estado, f.abierto_en);
                  return (
                    <button key={f.id} type="button" onClick={() => setAbierta(f)} className="block w-full p-3 text-left text-sm hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{f.cliente}</span>
                        <Badge variant={ev === "enviado" ? "default" : ev === "no_enviado" ? "secondary" : "outline"} className="shrink-0">{ETIQUETA_ENVIO[ev]}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{fecha(f.abierto_en)} · {f.oferta_titulo}{f.comercial_nombre ? ` · ${f.comercial_nombre}` : ""}</p>
                      {f.estado === "enviado" && (
                        <p className="text-xs text-muted-foreground">
                          Lo ofertado: {eur(f.ventas_antes)} antes → {f.pendiente_datos ? "pendiente" : eur(f.ventas_despues)} después
                        </p>
                      )}
                    </button>
                  );
                })}
              </CardContent></Card>
            )}
          {total > POR_PAGINA && (
            <div className="flex items-center justify-center gap-2">
              <Button size="icon" variant="outline" aria-label="Anterior" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm">{pagina + 1} / {Math.ceil(total / POR_PAGINA)}</span>
              <Button size="icon" variant="outline" aria-label="Siguiente" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ofertas" className="space-y-3">
          <p className="text-xs text-muted-foreground">Compara las ventas de lo ofertado 30 días antes y después del envío confirmado, frente a clientes que no la recibieron. Es una asociación, no prueba que la oferta cause la venta.</p>
          {porOferta.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            : !porOferta.data?.length ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin datos.</CardContent></Card>
            : porOferta.data.map((o) => {
              const r = o as unknown as Record<string, number>;
              const vEnv = variacionPct(r.ventas_antes, r.ventas_despues);
              const dif = r.medibles ? diferenciaFrenteControl(r.ventas_antes, r.ventas_despues, r.control_antes, r.control_despues) : null;
              return (
                <Card key={String(o.oferta_id)}><CardContent className="space-y-2 p-4">
                  <p className="font-semibold">{String(o.titulo)}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Enviadas</p><p className="font-medium">{r.enviados}</p></div>
                    <div><p className="text-xs text-muted-foreground">No enviadas</p><p className="font-medium">{r.no_enviados}</p></div>
                    <div><p className="text-xs text-muted-foreground">Sin confirmar</p><p className="font-medium">{r.pendientes}</p></div>
                    <div><p className="text-xs text-muted-foreground">Bajas tras envío</p><p className="font-medium">{r.bajas_tras_envio}</p></div>
                  </div>
                  {r.medibles ? (
                    <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-2 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-muted-foreground">Compraron después</p><p className="font-medium">{r.compradores_despues} de {r.medibles}</p></div>
                      <div><p className="text-xs text-muted-foreground">Ventas antes → después</p><p className="font-medium">{eur(r.ventas_antes)} → {eur(r.ventas_despues)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Variación</p><p className="font-medium">{pct(vEnv)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Frente a no receptores ({r.control_clientes})</p><p className="font-medium">{dif == null ? "—" : `${dif > 0 ? "+" : ""}${dif.toLocaleString("es-ES", { maximumFractionDigits: 0 })} puntos`}</p></div>
                    </div>
                  ) : r.enviados ? <p className="text-xs text-muted-foreground">Ventas pendientes: aún no hay 30 días de datos tras los envíos.</p> : null}
                </CardContent></Card>
              );
            })}
        </TabsContent>

        <TabsContent value="comerciales">
          <p className="mb-2 text-xs text-muted-foreground">Seguimiento de uso. No se usa para incentivos.</p>
          {porComercial.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            : !porComercial.data?.length ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin datos.</CardContent></Card>
            : (
              <Card><CardContent className="divide-y p-0">
                {porComercial.data.map((c) => (
                  <div key={c.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span className="font-medium">{c.comercial_nombre ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.envios} envíos · {c.enviados} confirmados ({c.envios ? Math.round((c.enviados / c.envios) * 100) : 0} %) · {c.clientes} clientes
                    </span>
                  </div>
                ))}
              </CardContent></Card>
            )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{abierta?.oferta_titulo}</DialogTitle></DialogHeader>
          {abierta && (
            <div className="space-y-2 text-sm">
              <p>{abierta.cliente} · {fecha(abierta.abierto_en)}{abierta.comercial_nombre ? ` · ${abierta.comercial_nombre}` : ""}</p>
              <p className="text-xs text-muted-foreground">Enviado al +{abierta.telefono}</p>
              <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-sans">{abierta.mensaje}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
