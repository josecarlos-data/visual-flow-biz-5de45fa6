import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import AvisosSeguridadBloque from "@/components/AvisosSeguridadBloque";
import RegistroConsultasBloque from "@/components/RegistroConsultasBloque";

const CLAVES = ["control_acceso_modo", "alta_dispositivo_modo", "control_sesiones_activo", "acceso_permite_correo", "segundo_factor_modo", "sesion_duracion_horas"] as const;

export default function SeguridadAccesoCard({
  activosSinUsuario = 0,
  onModo2fa,
}: {
  activosSinUsuario?: number;
  onModo2fa?: (modo: string) => void;
}) {
  const [modo, setModo] = useState("observacion");
  const [altaModo, setAltaModo] = useState("auto");
  const [sesionesActivo, setSesionesActivo] = useState("true");
  const [permiteCorreo, setPermiteCorreo] = useState("true");
  const [modo2fa, setModo2fa] = useState("desactivado");
  const [duracion, setDuracion] = useState("0");
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
        if (f.key === "control_sesiones_activo") setSesionesActivo(f.value);
        if (f.key === "acceso_permite_correo") setPermiteCorreo(f.value);
        if (f.key === "segundo_factor_modo") { setModo2fa(f.value); onModo2fa?.(f.value); }
        if (f.key === "sesion_duracion_horas") setDuracion(f.value.trim() || "0");
      });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async (key: string, value: string) => {
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key, value } as never, { onConflict: "key" } as never);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return false;
    }
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
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="space-y-1.5">
          <Label>Sesiones simultáneas</Label>
          <Select
            value={sesionesActivo}
            disabled={loading}
            onValueChange={async (v) => {
              const ok = await guardar("control_sesiones_activo", v);
              if (ok) setSesionesActivo(v);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Activo (limita por usuario)</SelectItem>
              <SelectItem value="false">Desactivado</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Limita desde cuántos equipos distintos puede entrar cada usuario a la vez. Desactívalo solo de forma
            temporal si alguien se ha quedado fuera.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Permitir acceso con correo</Label>
          <Select
            value={permiteCorreo}
            disabled={loading}
            onValueChange={async (v) => {
              if (v === "false" && activosSinUsuario > 0) {
                toast({
                  title: "No se puede desactivar todavía",
                  description: `Hay ${activosSinUsuario} usuario${activosSinUsuario === 1 ? "" : "s"} activo${activosSinUsuario === 1 ? "" : "s"} sin nombre de usuario.`,
                  variant: "destructive",
                });
                return;
              }
              const ok = await guardar("acceso_permite_correo", v);
              if (ok) setPermiteCorreo(v);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sí (usuario o correo)</SelectItem>
              <SelectItem value="false" disabled={activosSinUsuario > 0}>No (solo nombre de usuario)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Si lo desactivas, solo se podrá entrar con el nombre de usuario. Quien no tenga uno asignado no podrá acceder.
          </p>
          {activosSinUsuario > 0 && (
            <p className="text-xs text-destructive">
              {activosSinUsuario} usuario{activosSinUsuario === 1 ? "" : "s"} activo{activosSinUsuario === 1 ? "" : "s"} sin nombre de usuario.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Segundo factor</Label>
          <Select
            value={modo2fa}
            disabled={loading}
            onValueChange={async (v) => {
              if (v === "activo") {
                const { data } = await supabase.auth.mfa.listFactors();
                if (!data?.totp?.length) {
                  toast({
                    title: "Configura antes tu segundo factor",
                    description: "No puedes activarlo para todos los administradores sin tener el tuyo configurado. Márcate a ti mismo y pasa por modo «Solo marcados».",
                    variant: "destructive",
                  });
                  return;
                }
              }
              const ok = await guardar("segundo_factor_modo", v);
              if (ok) { setModo2fa(v); onModo2fa?.(v); }
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desactivado">Desactivado</SelectItem>
              <SelectItem value="marcados">Solo usuarios marcados</SelectItem>
              <SelectItem value="activo">Marcados y todos los administradores</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pide un código de Microsoft Authenticator o Google Authenticator al entrar. Quien lo tenga exigido y no lo haya
            configurado tendrá que darlo de alta en su próximo acceso.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="duracion-sesion">Duración máxima de sesión (horas)</Label>
          <div className="flex gap-2">
            <Input
              id="duracion-sesion"
              type="number"
              min={0}
              max={720}
              value={duracion}
              disabled={loading}
              onChange={(e) => setDuracion(e.target.value)}
              className="max-w-[120px]"
            />
            <Button
              variant="outline"
              disabled={loading}
              onClick={async () => {
                const n = Number(duracion);
                if (!Number.isInteger(n) || n < 0 || n > 720) {
                  toast({ title: "Valor no válido", description: "Introduce un número entero entre 0 y 720.", variant: "destructive" });
                  return;
                }
                const ok = await guardar("sesion_duracion_horas", String(n));
                if (ok) setDuracion(String(n));
              }}
            >
              Guardar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pasado este tiempo, el usuario tendrá que volver a entrar (0 = sin límite). Cuenta desde que el usuario inició sesión, no desde su última actividad. Para equipos desatendidos, usar el bloqueo de pantalla del dispositivo.
          </p>
        </div>
        <AvisosSeguridadBloque guardar={guardar} />
        <RegistroConsultasBloque guardar={guardar} />
        {modo2fa === "activo" && (
          <p className="sm:col-span-2 lg:col-span-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            Atención: el segundo factor es obligatorio para todos los administradores. Si alguien pierde el móvil, tendrá que
            restablecérselo otro administrador.
          </p>
        )}
        {modo === "bloqueo" && (
          <p className="sm:col-span-2 lg:col-span-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            Atención: el modo bloqueo está activo. Un comercial con un equipo nuevo o bloqueado no podrá acceder.
          </p>
        )}
        {sesionesActivo !== "true" && (
          <p className="sm:col-span-2 lg:col-span-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            Atención: el límite de sesiones simultáneas está desactivado. Cualquier usuario podrá entrar desde tantos
            equipos como tenga autorizados, sin expulsar las sesiones anteriores.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
