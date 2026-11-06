import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useEnviarMensaje, type VisitaMensaje } from "@/hooks/useVisitaMensajes";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ListaMensajes({ mensajes }: { mensajes: VisitaMensaje[] }) {
  if (!mensajes.length) return null;
  return (
    <div className="space-y-1.5">
      {mensajes.map((m) => (
        <div key={m.id} className={`rounded-md border p-2 text-sm ${m.es_dueno ? "bg-muted/40" : "border-primary/30 bg-primary/5"}`}>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{m.autor_nombre ?? "—"}</span> · {fechaHora(m.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{m.texto}</p>
        </div>
      ))}
    </div>
  );
}

/** Hilo con cuadro de respuesta que envía al momento. */
export function ConversacionBloque({ visitaId, bloqueId, mensajes, puedeEscribir }: {
  visitaId: string; bloqueId: string | null; mensajes: VisitaMensaje[]; puedeEscribir: boolean;
}) {
  const [texto, setTexto] = useState("");
  const enviar = useEnviarMensaje();
  return (
    <div className="space-y-2">
      <ListaMensajes mensajes={mensajes} />
      {puedeEscribir && (
        <div className="flex items-end gap-2">
          <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe una respuesta…" />
          <Button
            size="icon"
            aria-label="Enviar"
            disabled={!texto.trim() || enviar.isPending}
            onClick={() => enviar.mutate({ visitaId, bloqueId, texto }, {
              onSuccess: () => setTexto(""),
              onError: (e) => toast({ title: "No se ha podido enviar", description: (e as Error).message, variant: "destructive" }),
            })}
          >
            {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
