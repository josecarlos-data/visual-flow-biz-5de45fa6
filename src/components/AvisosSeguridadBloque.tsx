import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface Resumen {
  ultima_comprobacion: string | null;
  ultimo_aviso: { en: string; resultado: string; categoria: string | null } | null;
}

const LIMITE_LATIDO_MIN = 30;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const haceMin = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AvisosSeguridadBloque({ guardar }: { guardar: (key: string, value: string) => Promise<boolean> }) {
  const [activo, setActivo] = useState(true);
  const [email, setEmail] = useState("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ajustes }, { data: res }] = await Promise.all([
        supabase.from("app_settings" as never).select("key, value").in("key", ["avisos_seguridad_activo", "avisos_seguridad_email"]),
        supabase.rpc("avisos_resumen_panel" as never),
      ]);
      ((ajustes ?? []) as unknown as { key: string; value: string }[]).forEach((f) => {
        if (f.key === "avisos_seguridad_activo") setActivo(f.value === "true");
        if (f.key === "avisos_seguridad_email") setEmail(f.value);
      });
      setResumen((res as unknown as Resumen) ?? null);
      setLoading(false);
    })();
  }, []);

  const ultimo = resumen?.ultimo_aviso ?? null;
  const avisoMal = ultimo && (ultimo.resultado === "denegado" || ultimo.resultado === "fallo");
  const latido = resumen?.ultima_comprobacion ?? null;
  const sinComprobar = !latido || haceMin(latido) > LIMITE_LATIDO_MIN;

  return (
    <div className="space-y-3 sm:col-span-2 lg:col-span-3 rounded-md border p-3">
      <p className="text-sm font-medium">Avisos por correo</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <Switch
            id="avisos-activo"
            checked={activo}
            disabled={loading}
            onCheckedChange={async (v) => {
              if (await guardar("avisos_seguridad_activo", v ? "true" : "false")) setActivo(v);
            }}
          />
          <Label htmlFor="avisos-activo">Enviar avisos de seguridad</Label>
        </div>
        <p className="text-xs text-muted-foreground sm:order-last">
          Envía un correo cuando hay suspensiones, intentos repetidos desde una conexión, cambios en esta configuración,
          nuevos administradores, segundos factores restablecidos o bajas. Como mucho uno por tipo cada 30 minutos.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="avisos-email">Correo destinatario</Label>
          <div className="flex gap-2">
            <Input id="avisos-email" type="email" value={email} disabled={loading} onChange={(e) => setEmail(e.target.value)} />
            <Button
              variant="outline"
              disabled={loading}
              onClick={async () => {
                const v = email.trim();
                if (!EMAIL_RE.test(v)) {
                  toast({ title: "Correo no válido", variant: "destructive" });
                  return;
                }
                await guardar("avisos_seguridad_email", v);
              }}
            >
              Guardar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dirección que recibe los avisos. Si la cambias, la anterior recibe también un aviso del cambio.
          </p>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <p className="text-muted-foreground">
          Último aviso enviado: {ultimo ? fecha(ultimo.en) : "ninguno todavía"}
          {avisoMal && <span className="ml-2 font-medium text-destructive">Los avisos no están llegando</span>}
        </p>
        <p className="text-muted-foreground">
          Última comprobación: {latido ? `hace ${haceMin(latido)} minutos` : "nunca"}
          {sinComprobar && <span className="ml-2 font-medium text-destructive">Los avisos no se están comprobando</span>}
        </p>
      </div>
    </div>
  );
}
