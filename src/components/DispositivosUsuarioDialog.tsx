import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { registrarEvento } from "@/lib/auditoria";
import { Ban, Copy, KeyRound, Pencil, Trash2, Unlock } from "lucide-react";

interface DispositivoRow {
  id: string;
  dispositivo_id: string;
  nombre: string | null;
  user_agent: string | null;
  bloqueado: boolean;
  primera_vez: string;
  ultima_vez: string;
  sesiones_abiertas: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  nombreUsuario: string;
  sesionesMax: number;
  dispositivosMax: number;
  onGuardado: () => void;
}

const fecha = (v: string) =>
  new Date(v).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function DispositivosUsuarioDialog({
  open, onOpenChange, userId, nombreUsuario, sesionesMax, dispositivosMax, onGuardado,
}: Props) {
  const [dispositivos, setDispositivos] = useState<DispositivoRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sesiones, setSesiones] = useState(String(sesionesMax));
  const [equipos, setEquipos] = useState(String(dispositivosMax));
  const [codigo, setCodigo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await (supabase.rpc as any)("dispositivos_usuario", { _user_id: userId });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setDispositivos((data ?? []) as DispositivoRow[]);
    setCargando(false);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    setSesiones(String(sesionesMax));
    setEquipos(String(dispositivosMax));
    setCodigo(null);
    void cargar();
  }, [open, cargar, sesionesMax, dispositivosMax]);

  const guardarLimites = async () => {
    const s = Number(sesiones);
    const d = Number(equipos);
    if (!Number.isInteger(s) || s < 0 || s > 20 || !Number.isInteger(d) || d < 1 || d > 20) {
      toast({ title: "Valores no válidos", description: "Sesiones entre 0 y 20, equipos entre 1 y 20.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ sesiones_max: s, dispositivos_max: d } as any)
      .eq("user_id", userId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    registrarEvento("cambio_config_seguridad", {
      entidad: "usuario", entidad_id: userId, detalle: { sesiones_max: s, dispositivos_max: d },
    });
    toast({ title: "Límites guardados" });
    onGuardado();
  };

  const accion = async (id: string, acc: string, nombre?: string) => {
    const { error } = await (supabase.rpc as any)("admin_gestionar_dispositivo", { _id: id, _accion: acc, _nombre: nombre ?? null });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    registrarEvento("cambio_config_seguridad", { entidad: "dispositivo", entidad_id: id, detalle: { accion: acc } });
    void cargar();
  };

  const generarCodigo = async () => {
    const { data, error } = await (supabase.rpc as any)("admin_generar_codigo", { _user_id: userId });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setCodigo(data as string);
    registrarEvento("codigo_generado", { entidad: "usuario", entidad_id: userId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Equipos y sesiones de {nombreUsuario}</DialogTitle>
          <DialogDescription>Controla desde cuántos equipos y con cuántas sesiones puede entrar.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ses">Sesiones simultáneas (0 = sin límite)</Label>
            <Input id="ses" type="number" min={0} max={20} value={sesiones} onChange={(e) => setSesiones(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq">Máximo de equipos</Label>
            <Input id="eq" type="number" min={1} max={20} value={equipos} onChange={(e) => setEquipos(e.target.value)} />
          </div>
          <Button onClick={guardarLimites}>Guardar</Button>
        </div>

        <div className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Código de alta de equipo</p>
              <p className="text-xs text-muted-foreground">Válido 24 horas. Sirve para varios equipos de este usuario.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={generarCodigo}>
              <KeyRound className="h-4 w-4" /> Generar código
            </Button>
          </div>
          {codigo && (
            <div className="mt-3 flex items-center justify-center gap-3 rounded-md bg-muted p-3">
              <span className="font-mono text-3xl tracking-[0.3em]">{codigo}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(codigo);
                  toast({ title: "Código copiado" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Equipos ({dispositivos.length})</p>
          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!cargando && dispositivos.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no ha entrado desde ningún equipo.</p>
          )}
          {dispositivos.map((d) => (
            <div key={d.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.nombre || "Equipo sin nombre"}</span>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {d.dispositivo_id.replace(/-/g, "").slice(0, 8).toUpperCase()}
                </Badge>
                {d.bloqueado && <Badge variant="destructive">Bloqueado</Badge>}
                {d.sesiones_abiertas > 0 && <Badge variant="secondary">{d.sesiones_abiertas} sesión(es)</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Última conexión: {fecha(d.ultima_vez)}</p>
              <p className="truncate text-xs text-muted-foreground">{d.user_agent || "—"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    const nombre = window.prompt("Nombre del equipo", d.nombre ?? "");
                    if (nombre !== null) void accion(d.id, "renombrar", nombre);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Renombrar
                </Button>
                {d.bloqueado ? (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => accion(d.id, "desbloquear")}>
                    <Unlock className="h-3.5 w-3.5" /> Desbloquear
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => accion(d.id, "bloquear")}>
                    <Ban className="h-3.5 w-3.5" /> Bloquear
                  </Button>
                )}
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => accion(d.id, "eliminar")}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
