import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronLeft, Info, Loader2, MessageCircle, Ban } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { componerMensaje, enlaceOferta } from "@/lib/ofertas";
import { enlaceWhatsApp, guardarPendiente, normalizarMovil, primerMovil } from "@/lib/ofertasEnvio";

export interface ClienteEnvio {
  cod_cliente: number;
  cliente: string;
  persona_contacto?: string | null;
  telefono?: string | null;
  telefono2?: string | null;
  telefono_whatsapp?: string | null;
}

export interface OfertaEnvio {
  oferta_id: string;
  titulo: string;
  mensaje: string;
  token: string;
  bloqueos: string[];
  avisos: string[];
  ultimo_envio: string | null;
  ultimo_envio_por?: string | null;
}

export function useUrlBaseOfertas() {
  return useQuery({
    queryKey: ["app_setting", "ofertas_url_base"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ofertas_url_base").maybeSingle();
      return data?.value ?? window.location.origin;
    },
  });
}

const fecha = (d: string) => new Date(d).toLocaleDateString("es-ES");

/** Paso de envío de una oferta a un cliente (vista previa, teléfono y apertura de WhatsApp). */
export function PasoEnvio({
  cliente, oferta, tandaId, onEnviado,
}: { cliente: ClienteEnvio; oferta: OfertaEnvio; tandaId?: string; onEnviado: () => void }) {
  const qc = useQueryClient();
  const { data: urlBase } = useUrlBaseOfertas();
  const detectado = primerMovil(cliente.telefono_whatsapp, cliente.telefono, cliente.telefono2);
  const [tel, setTel] = useState(detectado ? `+${detectado}` : "");
  const [guardar, setGuardar] = useState(!detectado);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setTel(detectado ? `+${detectado}` : "");
    setGuardar(!detectado);
  }, [cliente.cod_cliente, detectado]);

  const movil = normalizarMovil(tel);
  const mensaje = useMemo(
    () => componerMensaje(oferta.mensaje, cliente.persona_contacto ?? null, urlBase ? enlaceOferta(urlBase, oferta.token) : null),
    [oferta, cliente.persona_contacto, urlBase],
  );

  const abrir = async () => {
    if (!movil) return;
    setEnviando(true);
    const ventana = window.open("", "_blank");
    const { data, error } = await supabase.rpc("registrar_envio_oferta", {
      _oferta_id: oferta.oferta_id, _cod_cliente: cliente.cod_cliente, _telefono: movil,
      _mensaje: mensaje, _guardar_telefono: guardar && movil !== detectado, _tanda_id: tandaId ?? null,
    });
    setEnviando(false);
    if (error || !data) {
      ventana?.close();
      toast({ title: "No se ha podido preparar el envío", description: error?.message, variant: "destructive" });
      return;
    }
    guardarPendiente({ id: data as string, cliente: cliente.cliente, titulo: oferta.titulo });
    const url = enlaceWhatsApp(movil, mensaje);
    if (ventana) ventana.location.href = url; else window.location.href = url;
    qc.invalidateQueries({ queryKey: ["ofertas_envios"] });
    onEnviado();
  };

  return (
    <div className="space-y-3">
      {oferta.ultimo_envio && (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <Info className="h-3.5 w-3.5" /> Ya enviada el {fecha(oferta.ultimo_envio)}{oferta.ultimo_envio_por ? ` por ${oferta.ultimo_envio_por}` : ""}
        </p>
      )}
      {oferta.avisos.map((a) => (
        <p key={a} className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />{a}</p>
      ))}
      <div>
        <Label className="text-xs text-muted-foreground">Mensaje</Label>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-sans text-sm">{mensaje}</pre>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tel-wa">Móvil de WhatsApp</Label>
        <Input id="tel-wa" inputMode="tel" placeholder="6XX XXX XXX" value={tel} onChange={(e) => setTel(e.target.value)} />
        {tel && !movil && <p className="text-xs text-destructive">Introduce un móvil español (empieza por 6 o 7, 9 cifras).</p>}
        {movil && movil !== detectado && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={guardar} onCheckedChange={(v) => setGuardar(!!v)} /> Guardar en la ficha
          </label>
        )}
      </div>
      <Button className="w-full" disabled={!movil || enviando} onClick={abrir}>
        {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
        Abrir WhatsApp
      </Button>
    </div>
  );
}

export function EnviarOfertaDialog({
  open, onOpenChange, cliente,
}: { open: boolean; onOpenChange: (v: boolean) => void; cliente: ClienteEnvio }) {
  const [elegida, setElegida] = useState<OfertaEnvio | null>(null);
  const { data: prefs } = useQuery({
    queryKey: ["preferencias_ofertas", cliente.cod_cliente],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("cliente_preferencias_ofertas").select("telefono_whatsapp").eq("cod_cliente", cliente.cod_cliente).maybeSingle();
      return data;
    },
  });
  const { data: ofertas, isLoading, error } = useQuery({
    queryKey: ["ofertas_para_cliente", cliente.cod_cliente],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_para_cliente", { _cod_cliente: cliente.cod_cliente });
      if (error) throw error;
      return (data ?? []) as unknown as OfertaEnvio[];
    },
  });
  useEffect(() => { if (!open) setElegida(null); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {elegida && (
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Volver" onClick={() => setElegida(null)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {elegida ? elegida.titulo : "Enviar oferta"}
          </DialogTitle>
        </DialogHeader>
        {elegida ? (
          <PasoEnvio
            cliente={{ ...cliente, telefono_whatsapp: prefs?.telefono_whatsapp ?? cliente.telefono_whatsapp }}
            oferta={elegida}
            onEnviado={() => onOpenChange(false)}
          />
        ) : isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">No se han podido cargar las ofertas.</p>
        ) : !ofertas?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No hay ofertas vigentes.</p>
        ) : (
          <div className="space-y-2">
            {ofertas.map((o) => {
              const bloqueada = o.bloqueos.length > 0;
              return (
                <button
                  key={o.oferta_id}
                  type="button"
                  disabled={bloqueada}
                  onClick={() => setElegida(o)}
                  className="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{o.titulo}</span>
                    {bloqueada ? <Badge variant="destructive" className="shrink-0">Bloqueada</Badge> : <Badge className="shrink-0">Disponible</Badge>}
                  </div>
                  {o.bloqueos.map((b) => (
                    <p key={b} className="mt-1 flex items-center gap-1 text-xs text-destructive"><Ban className="h-3 w-3 shrink-0" />{b}</p>
                  ))}
                  {!bloqueada && o.ultimo_envio && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Ya enviada el {fecha(o.ultimo_envio)}{o.ultimo_envio_por ? ` por ${o.ultimo_envio_por}` : ""}</p>
                  )}
                  {!bloqueada && o.avisos.map((a) => <p key={a} className="mt-1 text-xs text-muted-foreground">{a}</p>)}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
