import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversacionBloque } from "@/components/ConversacionBloque";
import type { MensajesDeVisita } from "@/hooks/useVisitaMensajes";

/** Mensajes de un bloque (o de la visita si bloqueId es null) en la ficha del cliente.
 *  Los datos y el permiso de escritura vienen del servidor, en una sola llamada para toda la ficha. */
export function MensajesFicha({ visitaId, bloqueId, hilo }: {
  visitaId: string; bloqueId: string | null; hilo: Pick<UseQueryResult<Map<string, MensajesDeVisita>, unknown>, "data">;
}) {
  const [abierto, setAbierto] = useState(false);
  const datos = hilo.data?.get(visitaId);
  if (!datos) return null; // sin permiso para conversar, cargando o error (el aviso de error va arriba)
  const ms = datos.mensajes.filter((m) => m.bloque_id === bloqueId);
  const puedeEscribir = datos.puede_escribir;
  if (!ms.length && !puedeEscribir) return null;
  return (
    <div className="space-y-1.5 pt-1">
      {ms.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-primary">Conversación de revisión</p>}
      {abierto || ms.length > 0 ? (
        <ConversacionBloque visitaId={visitaId} bloqueId={bloqueId} mensajes={ms} puedeEscribir={puedeEscribir} />
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAbierto(true)}>
          <MessageSquare className="mr-1 h-3.5 w-3.5" /> Escribir mensaje
        </Button>
      )}
    </div>
  );
}
