import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

const CLAVES = ["registro_consultas_activo", "auditoria_retencion_dias", "consultas_retencion_dias"];

function CampoDias({ id, label, ayuda, valor, setValor, onGuardar, disabled }: {
  id: string; label: string; ayuda: string; valor: string; setValor: (v: string) => void;
  onGuardar: () => void; disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} type="number" min={30} max={3650} value={valor} disabled={disabled}
          onChange={(e) => setValor(e.target.value)} className="max-w-[120px]" />
        <Button variant="outline" disabled={disabled} onClick={onGuardar}>Guardar</Button>
      </div>
      <p className="text-xs text-muted-foreground">{ayuda}</p>
    </div>
  );
}

export default function RegistroConsultasBloque({ guardar }: { guardar: (key: string, value: string) => Promise<boolean> }) {
  const [activo, setActivo] = useState(false);
  const [retAud, setRetAud] = useState("365");
  const [retCons, setRetCons] = useState("180");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings" as never).select("key, value").in("key", CLAVES);
      ((data ?? []) as unknown as { key: string; value: string }[]).forEach((f) => {
        if (f.key === "registro_consultas_activo") setActivo(f.value === "true");
        if (f.key === "auditoria_retencion_dias") setRetAud(f.value);
        if (f.key === "consultas_retencion_dias") setRetCons(f.value);
      });
      setLoading(false);
    })();
  }, []);

  const guardarDias = async (key: string, v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 30 || n > 3650) {
      toast({ title: "Valor no válido", description: "Introduce un número entero entre 30 y 3650.", variant: "destructive" });
      return;
    }
    await guardar(key, String(n));
  };

  return (
    <div className="space-y-3 rounded-md border p-3 sm:col-span-2 lg:col-span-3">
      <p className="text-sm font-medium">Registro de consultas</p>
      <div className="flex items-center gap-3">
        <Switch id="consultas-activo" checked={activo} disabled={loading}
          onCheckedChange={async (v) => { if (await guardar("registro_consultas_activo", v ? "true" : "false")) setActivo(v); }} />
        <Label htmlFor="consultas-activo">Registrar las consultas de fichas de cliente</Label>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Registra cada apertura de la ficha de un cliente y cada pestaña consultada dentro de ella. Nada más.
        </p>
        <p>
          Sirve solo para investigar una posible fuga de información (por ejemplo, qué clientes revisó alguien antes de
          irse a la competencia). Nunca para evaluar el rendimiento de nadie. Solo lo ven los administradores, y cada
          consulta de este registro queda a su vez en Auditoría.
        </p>
        <p>Ocupa poco: unas 500 consultas al día, 15–20 MB con 6 meses.</p>
        <p className="font-medium text-destructive">Antes de activarlo, informa a la plantilla.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoDias id="ret-aud" label="Conservación de Auditoría (días)" valor={retAud} setValor={setRetAud} disabled={loading}
          ayuda="Los eventos de Auditoría más antiguos se borran cada madrugada."
          onGuardar={() => guardarDias("auditoria_retencion_dias", retAud)} />
        <CampoDias id="ret-cons" label="Conservación de consultas (días)" valor={retCons} setValor={setRetCons} disabled={loading}
          ayuda="Las consultas más antiguas se borran cada madrugada."
          onGuardar={() => guardarDias("consultas_retencion_dias", retCons)} />
      </div>
    </div>
  );
}
