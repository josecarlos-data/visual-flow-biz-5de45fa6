import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, SlidersHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function AppSettingsCard() {
  const [anios, setAnios] = useState("3");
  const [diasAtras, setDiasAtras] = useState("7");
  const [altaBloqueada, setAltaBloqueada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings" as never)
        .select("key, value")
        .in("key", ["anios_cliente_activo", "visita_dias_atras_max", "visita_alta_directa_bloqueada"]);
      for (const r of (data ?? []) as { key: string; value: string }[]) {
        if (r.key === "anios_cliente_activo") setAnios(r.value);
        if (r.key === "visita_dias_atras_max") setDiasAtras(r.value);
        if (r.key === "visita_alta_directa_bloqueada") setAltaBloqueada(r.value === "true");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const n = Number(anios);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      toast({ title: "Valor no válido", description: "Introduce un número entero entre 1 y 20.", variant: "destructive" });
      return;
    }
    const d = Number(diasAtras);
    if (!Number.isInteger(d) || d < 0 || d > 365) {
      toast({ title: "Valor no válido", description: "Los días atrás deben ser un número entero entre 0 y 365.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert([
        { key: "anios_cliente_activo", value: String(n) },
        { key: "visita_dias_atras_max", value: String(d) },
        { key: "visita_alta_directa_bloqueada", value: altaBloqueada ? "true" : "false" },
      ] as never, { onConflict: "key" } as never);
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Parámetro guardado", description: "Los parámetros generales se han actualizado." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4" /> Parámetros generales
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="anios-activo">Años para considerar activo a un cliente</Label>
          <Input
            id="anios-activo"
            type="number"
            min={1}
            max={20}
            value={anios}
            disabled={loading}
            onChange={(e) => setAnios(e.target.value)}
            className="sm:max-w-[160px]"
          />
          <p className="text-xs text-muted-foreground">
            Un cliente es activo si tiene alguna venta dentro de ese número de años.
          </p>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="dias-atras">Días atrás para registrar una visita</Label>
          <Input
            id="dias-atras"
            type="number"
            min={0}
            max={365}
            value={diasAtras}
            disabled={loading}
            onChange={(e) => setDiasAtras(e.target.value)}
            className="sm:max-w-[160px]"
          />
          <p className="text-xs text-muted-foreground">Un comercial no puede registrar visitas futuras ni más antiguas. El admin está exento.</p>
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch id="alta-bloqueada" checked={altaBloqueada} disabled={loading} onCheckedChange={setAltaBloqueada} />
            <Label htmlFor="alta-bloqueada">Visitas solo desde «Registrar visita»</Label>
          </div>
          <p className="text-xs text-muted-foreground">Actívalo cuando todos usen la versión nueva: bloquea las altas por otras vías.</p>
        </div>
        <Button onClick={save} disabled={saving || loading} className="gap-2">
          <Save className="h-4 w-4" /> Guardar
        </Button>
      </CardContent>
    </Card>
  );
}
