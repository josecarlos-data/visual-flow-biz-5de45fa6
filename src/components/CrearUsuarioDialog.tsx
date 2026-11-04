import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, KeyRound } from "lucide-react";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "director_comercial", label: "Director comercial" },
  { value: "jefe_de_zona", label: "Jefe de zona" },
  { value: "comercial", label: "Comercial" },
  { value: "marketing", label: "Marketing" },
];

const generar = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?";
  const a = new Uint32Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => c[n % c.length]).join("");
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendedores: string[];
  delegaciones: string[];
  dashboards: { key: string; name: string }[];
  onCreado: () => void;
}

export default function CrearUsuarioDialog({ open, onOpenChange, vendedores, delegaciones, dashboards, onCreado }: Props) {
  const vacio = { full_name: "", email: "", username: "", role: "", employee_code: "", delegacion: "", password: "" };
  const [f, setF] = useState(vacio);
  const [paneles, setPaneles] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [creada, setCreada] = useState<{ email: string; password: string } | null>(null);

  const cerrar = (o: boolean) => {
    if (!o) { setF(vacio); setPaneles([]); setCreada(null); }
    onOpenChange(o);
  };

  const crear = async () => {
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("admin-crear-usuario", { body: { ...f, dashboards: paneles } });
    setEnviando(false);
    let msg = data?.error as string | undefined;
    if (error && !msg) {
      try { msg = (await (error as any).context?.json())?.error; } catch { /* sin cuerpo */ }
    }
    if (error || !data?.ok) {
      toast({ title: "No se ha creado el usuario", description: msg ?? "Inténtalo de nuevo.", variant: "destructive" });
      return;
    }
    setCreada({ email: f.email, password: f.password });
    onCreado();
  };

  const set = (k: keyof typeof vacio) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const listo = f.full_name && f.email && f.role && f.password.length >= 12;

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {creada ? (
          <>
            <DialogHeader>
              <DialogTitle>Usuario creado</DialogTitle>
              <DialogDescription>
                Entrega esta contraseña temporal a la persona. Solo se muestra ahora; tendrá que cambiarla en su primer acceso.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div><span className="text-muted-foreground">Correo:</span> {creada.email}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-muted px-2 py-1">{creada.password}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(creada.password); toast({ title: "Copiada" }); }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <DialogFooter><Button onClick={() => cerrar(false)}>Hecho</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
              <DialogDescription>Quedará aprobado y activo, y deberá cambiar la contraseña al entrar.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1"><Label>Nombre completo</Label><Input value={f.full_name} onChange={(e) => set("full_name")(e.target.value)} /></div>
              <div className="grid gap-1"><Label>Correo</Label><Input type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} /></div>
              <div className="grid gap-1"><Label>Nombre de usuario (opcional)</Label><Input value={f.username} onChange={(e) => set("username")(e.target.value)} /></div>
              <div className="grid gap-1">
                <Label>Rol</Label>
                <Select value={f.role} onValueChange={set("role")}>
                  <SelectTrigger><SelectValue placeholder="Elige un rol" /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Comercial (opcional)</Label>
                <Select value={f.employee_code || "__ninguno"} onValueChange={(v) => set("employee_code")(v === "__ninguno" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ninguno">Ninguno</SelectItem>
                    {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Delegación (opcional)</Label>
                <Select value={f.delegacion || "__ninguna"} onValueChange={(v) => set("delegacion")(v === "__ninguna" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ninguna">Ninguna</SelectItem>
                    {delegaciones.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Paneles</Label>
                <div className="grid grid-cols-2 gap-1">
                  {dashboards.map((d) => (
                    <label key={d.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={paneles.includes(d.key)}
                        onCheckedChange={(c) => setPaneles((p) => (c ? [...p, d.key] : p.filter((x) => x !== d.key)))}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Contraseña temporal (mínimo 12)</Label>
                <div className="flex gap-2">
                  <Input value={f.password} onChange={(e) => set("password")(e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => set("password")(generar())}><KeyRound className="mr-1 h-3.5 w-3.5" />Generar</Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
              <Button disabled={!listo || enviando} onClick={crear}>{enviando ? "Creando…" : "Crear usuario"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
