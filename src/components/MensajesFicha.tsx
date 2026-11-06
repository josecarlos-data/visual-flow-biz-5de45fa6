import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversacionBloque } from "@/components/ConversacionBloque";
import { useMensajesVisita } from "@/hooks/useVisitaMensajes";

/** Mensajes de un bloque (o de la visita si bloqueId es null) en la ficha del cliente. */
export function MensajesFicha({ visitaId, bloqueId, puedeEscribir }: { visitaId: string; bloqueId: string | null; puedeEscribir: boolean }) {
  const { data } = useMensajesVisita(visitaId);
  const [abierto, setAbierto] = useState(false);
  const ms = (data ?? []).filter((m) => m.bloque_id === bloqueId);
  if (!ms.length && !puedeEscribir) return null;
  return (
    <div className="space-y-1.5 pt-1">
      {ms.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-primary">Conversación de revisión</p>}
      {abierto || ms.length > 0 ? (
        <ConversacionBloque visitaId={visitaId} bloqueId={bloqueId} mensajes={ms} puedeEscribir={puedeEscribir && (abierto || ms.length > 0)} />
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAbierto(true)}>
          <MessageSquare className="mr-1 h-3.5 w-3.5" /> Escribir mensaje
        </Button>
      )}
    </div>
  );
}
