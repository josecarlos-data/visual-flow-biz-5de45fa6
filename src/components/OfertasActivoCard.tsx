import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Megaphone } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAppSetting } from "@/hooks/useCrm";

/** Interruptor único de Ofertas y Comunicaciones. Solo admin (la tabla de ajustes solo admite escritura de admin). */
export default function OfertasActivoCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useAppSetting("ofertas_activo", "false");
  const activo = data === "true";

  const cambiar = async (v: boolean) => {
    const { error } = await supabase
      .from("app_settings" as never)
      .update({ value: v ? "true" : "false" } as never)
      .eq("key", "ofertas_activo");
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["app_setting", "ofertas_activo"] });
    toast({ title: v ? "Ofertas activadas" : "Ofertas desactivadas", description: "Los usuarios lo verán al volver a entrar." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4" /> Ofertas y Comunicaciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch id="ofertas-activo" checked={activo} disabled={isLoading} onCheckedChange={cambiar} />
          <Label htmlFor="ofertas-activo">{activo ? "Activa" : "Desactivada"}</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Desactivada: se ocultan los paneles, los botones de la ficha del cliente y el enlace público, y nadie puede enviar ofertas.
          Al activarla, todo vuelve a funcionar y los paneles reaparecen para quien los tenía asignados.
        </p>
      </CardContent>
    </Card>
  );
}
