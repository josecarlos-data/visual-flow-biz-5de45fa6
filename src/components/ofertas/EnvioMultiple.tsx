import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2, MessageCircle, SkipForward, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PasoEnvio, type OfertaEnvio } from "./EnviarOfertaDialog";
import { EVENTO_ENVIO_CONFIRMADO } from "./ConfirmarEnvioOferta";
import { ETIQUETA_ENVIO, estadoEnvioVisible, leerPendiente, TOPE_TANDA } from "@/lib/ofertasEnvio";

interface Destinatario {
  cod_cliente: number; cliente: string; localidad: string | null; ruta: string | null;
  persona_contacto: string | null; telefono_whatsapp: string | null; telefono: string | null; telefono2: string | null;
  bloqueos: string[]; avisos: string[]; ultimo_envio: string | null;
}
interface OfertaVigente { oferta_id: string; titulo: string; vigente_hasta: string | null }

function PendientesConfirmar() {
  const { data } = useQuery({
    queryKey: ["ofertas_envios", "pendientes"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("ofertas_envios")
        .select("id, estado, abierto_en, cod_cliente, ofertas(titulo), clientes(cliente)")
        .eq("user_id", u.user?.id ?? "").in("estado", ["abierto", "sin_confirmar"])
        .order("abierto_en", { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  if (!data?.length) return null;
  const responder = async (id: string, enviado: boolean) => {
    const { error } = await supabase.rpc("confirmar_envio_oferta", { _envio_id: id, _enviado: enviado });
    if (error) toast({ title: "No se ha podido guardar", description: error.message, variant: "destructive" });
    window.dispatchEvent(new CustomEvent(EVENTO_ENVIO_CONFIRMADO));
  };
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-sm font-semibold">Pendientes de confirmar ({data.length})</p>
        {data.map((e) => {
          const r = e as unknown as { id: string; estado: string; abierto_en: string; ofertas: { titulo: string } | null; clientes: { cliente: string } | null };
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
              <div className="min-w-0">
                <p className="truncate">{r.clientes?.cliente} · {r.ofertas?.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.abierto_en).toLocaleDateString("es-ES")} · {ETIQUETA_ENVIO[estadoEnvioVisible(r.estado, r.abierto_en)]}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => responder(r.id, true)}>Se envió</Button>
                <Button size="sm" variant="ghost" onClick={() => responder(r.id, false)}>No</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function EnvioMultiple() {
  const [ofertaId, setOfertaId] = useState<string>("");
  const [ruta, setRuta] = useState("todas");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [tanda, setTanda] = useState<{ id: string; cola: number[]; i: number } | null>(null);
  const [esperando, setEsperando] = useState(false);

  const { data: ofertas } = useQuery({
    queryKey: ["ofertas_vigentes_envio"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_vigentes_envio");
      if (error) throw error;
      return (data ?? []) as OfertaVigente[];
    },
  });
  const { data: dest, isLoading, refetch } = useQuery({
    queryKey: ["ofertas_destinatarios", ofertaId],
    enabled: !!ofertaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_destinatarios", { _oferta_id: ofertaId });
      if (error) throw error;
      return (data ?? []) as unknown as Destinatario[];
    },
  });
  const { data: detalle } = useQuery({
    queryKey: ["ofertas_para_cliente", "detalle", ofertaId, tanda?.cola[tanda.i]],
    enabled: !!tanda,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_para_cliente", { _cod_cliente: tanda!.cola[tanda!.i] });
      if (error) throw error;
      return ((data ?? []) as unknown as OfertaEnvio[]).find((o) => o.oferta_id === ofertaId) ?? null;
    },
  });

  useEffect(() => {
    const avanzar = () => { setEsperando(false); refetch(); setTanda((t) => (t ? { ...t, i: t.i + 1 } : t)); };
    window.addEventListener(EVENTO_ENVIO_CONFIRMADO, avanzar);
    return () => window.removeEventListener(EVENTO_ENVIO_CONFIRMADO, avanzar);
  }, [refetch]);
  useEffect(() => { setSel([]); setTanda(null); }, [ofertaId]);

  const rutas = useMemo(() => Array.from(new Set((dest ?? []).map((d) => d.ruta).filter(Boolean) as string[])).sort(), [dest]);
  const filtrados = useMemo(() => (dest ?? []).filter((d) =>
    (ruta === "todas" || d.ruta === ruta)
    && (!q || `${d.cliente} ${d.localidad ?? ""} ${d.cod_cliente}`.toLowerCase().includes(q.toLowerCase()))), [dest, ruta, q]);
  const disponibles = filtrados.filter((d) => d.bloqueos.length === 0);
  const bloqueados = filtrados.filter((d) => d.bloqueos.length > 0);
  const mapa = useMemo(() => new Map((dest ?? []).map((d) => [d.cod_cliente, d])), [dest]);

  const toggle = (cod: number) => setSel((s) => {
    if (s.includes(cod)) return s.filter((x) => x !== cod);
    if (s.length >= TOPE_TANDA) { toast({ title: `Máximo ${TOPE_TANDA} clientes por tanda` }); return s; }
    return [...s, cod];
  });

  const actual = tanda && tanda.i < tanda.cola.length ? mapa.get(tanda.cola[tanda.i]) : null;
  const terminada = tanda && tanda.i >= tanda.cola.length;

  return (
    <div className="space-y-4">
      <PendientesConfirmar />
      <Select value={ofertaId} onValueChange={setOfertaId}>
        <SelectTrigger><SelectValue placeholder="Elige una oferta vigente" /></SelectTrigger>
        <SelectContent>
          {(ofertas ?? []).map((o) => <SelectItem key={o.oferta_id} value={o.oferta_id}>{o.titulo}</SelectItem>)}
        </SelectContent>
      </Select>
      {ofertas && ofertas.length === 0 && <p className="text-sm text-muted-foreground">No hay ofertas vigentes.</p>}

      {tanda ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {terminada ? "Tanda terminada" : `Cliente ${tanda.i + 1} de ${tanda.cola.length}: ${actual?.cliente ?? ""}`}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setTanda(null)}><X className="mr-1 h-3 w-3" />Salir</Button>
            </div>
            {terminada ? (
              <Button variant="outline" onClick={() => { setTanda(null); setSel([]); }}>Volver a la lista</Button>
            ) : esperando || leerPendiente() ? (
              <p className="text-sm text-muted-foreground">Vuelve a esta pantalla tras enviar el mensaje para confirmar y pasar al siguiente.</p>
            ) : actual && detalle ? (
              detalle.bloqueos.length ? (
                <p className="text-sm text-destructive">{detalle.bloqueos[0]}</p>
              ) : (
                <PasoEnvio cliente={actual} oferta={detalle} tandaId={tanda.id} onEnviado={() => setEsperando(true)} />
              )
            ) : (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            )}
            {!terminada && (
              <Button size="sm" variant="outline" onClick={() => { setEsperando(false); setTanda({ ...tanda, i: tanda.i + 1 }); }}>
                <SkipForward className="mr-1 h-3 w-3" />Siguiente
              </Button>
            )}
          </CardContent>
        </Card>
      ) : ofertaId && (
        isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Buscar cliente o localidad" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select value={ruta} onValueChange={setRuta}>
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las rutas</SelectItem>
                  {rutas.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{disponibles.length} pueden recibirla · {sel.length} elegidos (máx. {TOPE_TANDA})</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSel(disponibles.slice(0, TOPE_TANDA).map((d) => d.cod_cliente))}>Elegir primeros {Math.min(TOPE_TANDA, disponibles.length)}</Button>
                <Button size="sm" disabled={!sel.length} onClick={() => setTanda({ id: crypto.randomUUID(), cola: sel, i: 0 })}>
                  <MessageCircle className="mr-1 h-3 w-3" />Empezar envío
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="divide-y p-0">
                {disponibles.length === 0 && <p className="p-4 text-sm text-muted-foreground">Ningún cliente puede recibirla con estos filtros.</p>}
                {disponibles.map((d) => (
                  <label key={d.cod_cliente} className="flex cursor-pointer items-center gap-3 p-3 text-sm">
                    <Checkbox checked={sel.includes(d.cod_cliente)} onCheckedChange={() => toggle(d.cod_cliente)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.cliente}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[d.localidad, d.ruta].filter(Boolean).join(" · ")}
                        {d.ultimo_envio ? ` · Ya enviada el ${new Date(d.ultimo_envio).toLocaleDateString("es-ES")}` : ""}
                      </p>
                    </div>
                    {d.avisos.length > 0 && <Badge variant="outline" className="shrink-0 text-xs">{d.avisos.length} aviso{d.avisos.length > 1 ? "s" : ""}</Badge>}
                  </label>
                ))}
              </CardContent>
            </Card>
            {bloqueados.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  {bloqueados.length} bloqueados <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="mt-2"><CardContent className="divide-y p-0">
                    {bloqueados.slice(0, 300).map((d) => (
                      <div key={d.cod_cliente} className="p-3 text-sm">
                        <p className="truncate font-medium">{d.cliente}</p>
                        <p className="text-xs text-destructive">{d.bloqueos.join(" · ")}</p>
                      </div>
                    ))}
                  </CardContent></Card>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )
      )}
    </div>
  );
}
