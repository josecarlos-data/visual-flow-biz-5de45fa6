import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { borrarPendiente, leerPendiente, type EnvioPendiente } from "@/lib/ofertasEnvio";

export const EVENTO_ENVIO_CONFIRMADO = "oferta-envio-confirmado";

/** Al volver a la app tras abrir WhatsApp, pregunta «¿Se envió?». */
export function ConfirmarEnvioOferta() {
  const qc = useQueryClient();
  const [pendiente, setPendiente] = useState<EnvioPendiente | null>(null);

  useEffect(() => {
    const revisar = () => {
      if (document.visibilityState === "visible") {
        const p = leerPendiente();
        if (p) setPendiente(p);
      }
    };
    const t = setTimeout(revisar, 0);
    document.addEventListener("visibilitychange", revisar);
    window.addEventListener("focus", revisar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", revisar);
      window.removeEventListener("focus", revisar);
    };
  }, []);

  const responder = async (enviado: boolean) => {
    if (!pendiente) return;
    const { error } = await supabase.rpc("confirmar_envio_oferta", { _envio_id: pendiente.id, _enviado: enviado });
    if (error) {
      toast({ title: "No se ha podido guardar la respuesta", description: error.message, variant: "destructive" });
      return;
    }
    borrarPendiente();
    setPendiente(null);
    qc.invalidateQueries({ queryKey: ["ofertas_envios"] });
    qc.invalidateQueries({ queryKey: ["ofertas_para_cliente"] });
    qc.invalidateQueries({ queryKey: ["ofertas_destinatarios"] });
    window.dispatchEvent(new CustomEvent(EVENTO_ENVIO_CONFIRMADO));
  };

  return (
    <AlertDialog open={!!pendiente}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Se envió la oferta?</AlertDialogTitle>
          <AlertDialogDescription>
            «{pendiente?.titulo}» a {pendiente?.cliente}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>No se envió</AlertDialogCancel>
          <AlertDialogAction onClick={() => responder(true)}>Sí, enviada</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
