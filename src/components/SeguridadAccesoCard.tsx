import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { registrarEvento } from "@/lib/auditoria";

const CLAVES = ["control_acceso_modo", "alta_dispositivo_modo"] as const;

export default function SeguridadAccesoCard() {
  const [modo, setModo] = useState("observacion");
  const [altaModo, setAltaModo] = useState("auto");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings" as never)
        .select("key, value")
        .in("key", CLAVES as unknown as string[]);
      const filas = (data ?? []) as unknown as { key: string; value: string }[];
      filas.forEach((f) => {
        if (f.key === "control_acceso_modo") setModo(f.value);
        if (f.key === "alta_dispositivo_modo") setAltaModo(f.value);
      });
      setLoading(false);
    })();
  }, []);

  const guardar = async (key: string, value: string) => {
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key, value } as never, { onConflict: "key" } as never);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return false;
    }
    registrarEvento("cambio_config_seguridad", { entidad: "ajuste", entidad_id: key, detalle: { key, value } });
    toast({ title: "Ajuste guardado" });
    return true;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" /> Control de acceso por equipo
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Modo de control de acceso</Label>
          <Select
            value={modo}
            disabled={loading}
            onValueChange={async (v) => {
              const ok = await guardar("control_acceso_modo", v);
              if (ok) setModo(v);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="observacion">Observación (solo registra)</SelectItem>
              <SelectItem value="bloqueo">Bloqueo (impide la entrada)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            En observación nadie se queda fuera: solo queda constancia en Auditoría. En bloqueo, un equipo no autorizado
            o bloqueado no podrá entrar y el usuario tendrá que llamarte.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Alta de equipos nuevos</Label>
          <Select
            value={altaModo}
            disabled={loading}
            onValueChange={async (v) => {
              const ok = await guardar("alta_dispositivo_modo", v);
              if (ok) setAltaModo(v);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automática hasta el máximo</SelectItem>
              <SelectItem value="codigo">Con código de alta</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Con código, cada equipo nuevo necesita un código de 8 caracteres que generas tú desde la ficha del usuario.
            Solo impide la entrada si el modo de control está en bloqueo.
          </p>
        </div>
        {modo === "bloqueo" && (
          <p className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            Atención: el modo bloqueo está activo. Un comercial con un equipo nuevo o bloqueado no podrá acceder.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
