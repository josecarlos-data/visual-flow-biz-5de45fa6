import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Check, X, Pencil, Save, MonitorSmartphone } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { registrarEvento } from "@/lib/auditoria";
import SeguridadAccesoCard from "@/components/SeguridadAccesoCard";
import DispositivosUsuarioDialog from "@/components/DispositivosUsuarioDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const URL_PRODUCCION = "https://crmrimosa.josecarlossobrino.com";

type AppRole = Database["public"]["Enums"]["app_role"];

interface DashboardCatalogItem {
  key: string;
  name: string;
}

interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
  is_approved: boolean;
  ver_margen: boolean;
  delegacion: string | null;
  role: AppRole | null;
  dashboardKeys: string[];
  sesiones_max: number;
  dispositivos_max: number;
  debe_cambiar_password: boolean;
  password_cambiada_en: string | null;
  estado: string;
  estado_motivo: string | null;
  estado_cambiado_en: string | null;
  estado_cambiado_por: string | null;
  bloqueado_hasta: string | null;
  marcada_sospechosa: boolean;
  username: string | null;
}

const ESTADOS: { value: string; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "suspendido_temporal", label: "Suspendido temporalmente" },
  { value: "bloqueado_intentos", label: "Bloqueado por intentos" },
  { value: "bloqueado_admin", label: "Bloqueado por el administrador" },
  { value: "baja", label: "Baja" },
];
const etiquetaEstado = (e: string) => ESTADOS.find((x) => x.value === e)?.label ?? e;
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "";
/** Formato para input datetime-local en hora local. */
const aLocalInput = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [delegaciones, setDelegaciones] = useState<string[]>([]);
  const [dashboardCatalog, setDashboardCatalog] = useState<DashboardCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<{ userId: string; field: "full_name" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dispositivosDe, setDispositivosDe] = useState<UserRow | null>(null);
  const [accionPw, setAccionPw] = useState<{ u: UserRow; tipo: "restablecer" | "forzar" } | null>(null);
  const [verBajas, setVerBajas] = useState(false);
  const [cambioEstado, setCambioEstado] = useState<{ u: UserRow; estado: string; motivo: string; hasta: string } | null>(null);
  const [bajaDe, setBajaDe] = useState<{ u: UserRow; motivo: string } | null>(null);
  const [usernameEdit, setUsernameEdit] = useState<{ userId: string; valor: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, vendedoresRes, delegacionesRes, dashboardsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, employee_code, is_approved, delegacion, ver_margen, sesiones_max, dispositivos_max, debe_cambiar_password, password_cambiada_en, estado, estado_motivo, estado_cambiado_en, estado_cambiado_por, bloqueado_hasta, marcada_sospechosa, username"),
      supabase.rpc("get_distinct_vendedores"),
      supabase.rpc("get_distinct_delegaciones"),
      supabase
        .from("dashboards" as any)
        .select("key, name, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    const profiles = profilesRes.data ?? [];
    const catalog = (((dashboardsRes.data as any[]) ?? []) as DashboardCatalogItem[]).map((d) => ({
      key: d.key,
      name: d.name,
    }));
    setDashboardCatalog(catalog);

    setVendedores((vendedoresRes.data ?? []).map((d: { vendedor: string }) => d.vendedor));
    setDelegaciones((delegacionesRes.data ?? []).map((d: { delegacion: string }) => d.delegacion));


    const userIds = profiles.map((p) => p.user_id);
    const [rolesRes, accessRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      supabase.from("user_dashboard_access" as any).select("user_id, dashboard_key").in("user_id", userIds),
    ]);

    const rolesMap = new Map<string, AppRole>();
    (rolesRes.data ?? []).forEach((r) => rolesMap.set(r.user_id, r.role as AppRole));

    const accessMap = new Map<string, string[]>();
    (((accessRes.data as any[]) ?? []) as { user_id: string; dashboard_key: string }[]).forEach((a) => {
      const arr = accessMap.get(a.user_id) ?? [];
      arr.push(a.dashboard_key);
      accessMap.set(a.user_id, arr);
    });

    setUsers(
      profiles.map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email ?? null,
        employee_code: p.employee_code ?? null,
        is_approved: p.is_approved,
        ver_margen: (p as any).ver_margen ?? false,
        delegacion: (p as any).delegacion ?? null,
        role: rolesMap.get(p.user_id) ?? null,
        dashboardKeys: accessMap.get(p.user_id) ?? [],
        sesiones_max: (p as any).sesiones_max ?? 1,
        dispositivos_max: (p as any).dispositivos_max ?? 2,
        debe_cambiar_password: (p as any).debe_cambiar_password ?? false,
        password_cambiada_en: (p as any).password_cambiada_en ?? null,
        estado: p.estado ?? "activo",
        estado_motivo: p.estado_motivo ?? null,
        estado_cambiado_en: p.estado_cambiado_en ?? null,
        estado_cambiado_por: p.estado_cambiado_por ?? null,
        bloqueado_hasta: p.bloqueado_hasta ?? null,
        marcada_sospechosa: p.marcada_sospechosa ?? false,
        username: p.username ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const ejecutarAccionPw = async () => {
    if (!accionPw) return;
    const { u, tipo } = accionPw;
    setAccionPw(null);
    if (tipo === "restablecer") {
      if (!u.email) {
        toast({ title: "Este usuario no tiene correo", variant: "destructive" });
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: URL_PRODUCCION });
      if (error) {
        toast({ title: "No se ha podido enviar el correo", description: "Inténtalo de nuevo en unos minutos.", variant: "destructive" });
        return;
      }
    }
    const { error } = await supabase.from("profiles").update({ debe_cambiar_password: true } as any).eq("user_id", u.user_id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    registrarEvento(tipo === "restablecer" ? "password_restablecer_enviado" : "password_cambio_forzado", {
      entidad: "usuario", entidad_id: u.user_id, detalle: { email: u.email },
    });
    toast({ title: tipo === "restablecer" ? "Correo de restablecimiento enviado" : "Cambio de contraseña forzado" });
    fetchData();
  };

  const approveUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ is_approved: true }).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      registrarEvento("aprobacion_usuario", { entidad: "usuario", entidad_id: userId, detalle: { is_approved: true } });
      toast({ title: "Usuario aprobado" }); fetchData();
    }
  };

  const rejectUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ is_approved: false }).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      registrarEvento("baja_usuario", { entidad: "usuario", entidad_id: userId, detalle: { is_approved: false } });
      toast({ title: "Acceso revocado" }); fetchData();
    }
  };

  const assignRole = async (userId: string, role: AppRole) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      registrarEvento("cambio_rol", { entidad: "usuario", entidad_id: userId, detalle: { role } });
      toast({ title: "Rol asignado" }); fetchData();
    }
  };

  const assignVendedor = async (userId: string, vendedor: string) => {
    const value = vendedor === "__none__" ? null : vendedor;
    const { error } = await supabase.from("profiles").update({ employee_code: value } as any).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Vendedor asignado" }); fetchData(); }
  };

  const assignDelegacion = async (userId: string, delegacion: string) => {
    const value = delegacion === "__none__" ? null : delegacion;
    const { error } = await supabase.from("profiles").update({ delegacion: value } as any).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Delegación asignada" }); fetchData(); }
  };

  const toggleMargen = async (userId: string, current: boolean) => {
    const { error } = await supabase.from("profiles").update({ ver_margen: !current } as any).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      registrarEvento("cambio_ver_margen", { entidad: "usuario", entidad_id: userId, detalle: { ver_margen: !current } });
      toast({ title: !current ? "Margen visible" : "Margen oculto" }); fetchData();
    }
  };

  const toggleDashboard = async (userId: string, dashboardKey: string, currentlyHas: boolean) => {
    if (currentlyHas) {
      const { error } = await supabase
        .from("user_dashboard_access" as any)
        .delete()
        .eq("user_id", userId)
        .eq("dashboard_key", dashboardKey);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { toast({ title: "Acceso retirado" }); fetchData(); }
    } else {
      const { error } = await supabase
        .from("user_dashboard_access" as any)
        .insert({ user_id: userId, dashboard_key: dashboardKey } as any);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { toast({ title: "Acceso concedido" }); fetchData(); }
    }
  };

  const startEdit = (userId: string, currentValue: string | null) => {
    setEditingField({ userId, field: "full_name" });
    setEditValue(currentValue ?? "");
  };

  const saveEdit = async () => {
    if (!editingField) return;
    const { error } = await supabase.from("profiles").update({ full_name: editValue || null } as any).eq("user_id", editingField.userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Guardado" }); setEditingField(null); fetchData(); }
  };

  const cancelEdit = () => setEditingField(null);

  const nombreDe = (userId: string | null) => {
    if (!userId) return null;
    const x = users.find((u) => u.user_id === userId);
    return x ? x.full_name || x.email || "usuario" : "usuario eliminado";
  };

  const guardarUsername = async () => {
    if (!usernameEdit) return;
    setGuardando(true);
    const { error } = await supabase.rpc("admin_asignar_username", { _user_id: usernameEdit.userId, _username: usernameEdit.valor });
    setGuardando(false);
    if (error) { toast({ title: "No se ha guardado", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Nombre de usuario guardado" });
    setUsernameEdit(null);
    fetchData();
  };

  const elegirEstado = (u: UserRow, estado: string) => {
    if (estado === u.estado) return;
    const hasta = aLocalInput(new Date(Date.now() + 24 * 3600 * 1000));
    setCambioEstado({ u, estado, motivo: "", hasta });
  };

  const confirmarEstado = async () => {
    if (!cambioEstado) return;
    const { u, estado, motivo, hasta } = cambioEstado;
    if (estado !== "activo" && !motivo.trim()) {
      toast({ title: "El motivo es obligatorio", variant: "destructive" });
      return;
    }
    let hastaIso: string | undefined;
    if (estado === "suspendido_temporal") {
      const d = new Date(hasta);
      if (!hasta || isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        toast({ title: "Indica una fecha y hora de fin futura", variant: "destructive" });
        return;
      }
      hastaIso = d.toISOString();
    }
    setGuardando(true);
    const { error } = await supabase.rpc("admin_cambiar_estado", {
      _user_id: u.user_id, _estado: estado, _motivo: motivo.trim(), ...(hastaIso ? { _hasta: hastaIso } : {}),
    });
    setGuardando(false);
    if (error) { toast({ title: "No se ha cambiado el estado", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Estado: ${etiquetaEstado(estado)}` });
    setCambioEstado(null);
    fetchData();
  };

  const confirmarBaja = async () => {
    if (!bajaDe) return;
    if (!bajaDe.motivo.trim()) { toast({ title: "El motivo es obligatorio", variant: "destructive" }); return; }
    setGuardando(true);
    const { error } = await supabase.rpc("admin_dar_baja", { _user_id: bajaDe.u.user_id, _motivo: bajaDe.motivo.trim() });
    setGuardando(false);
    if (error) { toast({ title: "No se ha dado de baja", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Usuario dado de baja" });
    setBajaDe(null);
    fetchData();
  };

  const renderCuenta = (u: UserRow) => {
    const editando = usernameEdit?.userId === u.user_id;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {editando ? (
            <>
              <Input
                value={usernameEdit.valor}
                onChange={(e) => setUsernameEdit({ userId: u.user_id, valor: e.target.value.toLowerCase() })}
                onKeyDown={(e) => { if (e.key === "Enter") guardarUsername(); if (e.key === "Escape") setUsernameEdit(null); }}
                placeholder="nombre.usuario"
                className="h-8 min-w-0 flex-1"
                maxLength={30}
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={guardando} onClick={guardarUsername}><Save className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setUsernameEdit(null)}><X className="h-3.5 w-3.5" /></Button>
            </>
          ) : (
            <>
              <span className="truncate text-sm">{u.username ? `@${u.username}` : <span className="text-muted-foreground">Sin nombre de usuario</span>}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setUsernameEdit({ userId: u.user_id, valor: u.username ?? "" })} aria-label="Editar nombre de usuario">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
        <Select value={u.estado} onValueChange={(v) => elegirEstado(u, v)}>
          <SelectTrigger className="h-8 w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1">
          {u.estado !== "activo" && <Badge variant="destructive" className="w-fit">{etiquetaEstado(u.estado)}</Badge>}
          {u.marcada_sospechosa && <Badge variant="destructive" className="w-fit">Sospechosa</Badge>}
        </div>
        {u.estado === "suspendido_temporal" && u.bloqueado_hasta && (
          <span className="text-xs text-muted-foreground">Hasta {fechaHora(u.bloqueado_hasta)}</span>
        )}
        {u.estado_cambiado_en && (
          <span className="break-words text-xs text-muted-foreground">
            {u.estado_motivo ? `${u.estado_motivo} · ` : ""}{fechaHora(u.estado_cambiado_en)}{u.estado_cambiado_por ? ` · ${nombreDe(u.estado_cambiado_por)}` : ""}
          </span>
        )}
        {u.estado !== "baja" && (
          <Button size="sm" variant="outline" className="h-7 w-fit text-xs text-destructive" onClick={() => setBajaDe({ u, motivo: "" })}>
            Dar de baja
          </Button>
        )}
      </div>
    );
  };

  const pendingUsers = users.filter((u) => !u.is_approved);
  const approvedTodos = users.filter((u) => u.is_approved);
  const numBajas = approvedTodos.filter((u) => u.estado === "baja").length;
  const approvedUsers = verBajas ? approvedTodos : approvedTodos.filter((u) => u.estado !== "baja");

  const renderEditableName = (user: UserRow) => {
    const isEditing = editingField?.userId === user.user_id;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
            className="h-8 w-[140px]"
            autoFocus
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Save className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 group">
        <span>{user.full_name || "Sin nombre"}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(user.user_id, user.full_name)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h1>
        <p className="text-muted-foreground">Aprueba usuarios y asigna roles, vendedores y delegaciones</p>
      </div>

      <SeguridadAccesoCard />

      {pendingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pendientes de aprobación
              <Badge variant="destructive">{pendingUsers.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>{u.full_name || "Sin nombre"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email || "—"}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" onClick={() => approveUser(u.user_id)}>
                        <Check className="mr-1 h-4 w-4" /> Aprobar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectUser(u.user_id)}>
                        <X className="mr-1 h-4 w-4" /> Rechazar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usuarios aprobados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Cargando...</p>
          ) : approvedUsers.length === 0 ? (
            <p className="text-muted-foreground">No hay usuarios aprobados aún.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Delegación</TableHead>
                  <TableHead>Margen</TableHead>
                  <TableHead>Dashboards</TableHead>
                  <TableHead>Equipos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedUsers.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>{renderEditableName(u)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email || "—"}</TableCell>
                    <TableCell>
                      <Select value={u.employee_code ?? "__none__"} onValueChange={(val) => assignVendedor(u.user_id, val)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Asignar vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Ninguno</SelectItem>
                          {vendedores.map((v) => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={u.role ?? ""} onValueChange={(val) => assignRole(u.user_id, val as AppRole)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Asignar rol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comercial">Comercial</SelectItem>
                          <SelectItem value="jefe_de_zona">Jefe de Zona</SelectItem>
                          <SelectItem value="director_comercial">Director Comercial</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={u.delegacion ?? "__none__"} onValueChange={(val) => assignDelegacion(u.user_id, val)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Asignar delegación" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Ninguno</SelectItem>
                          {delegaciones.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Badge variant="secondary" className="opacity-70">Siempre</Badge>
                      ) : (
                        <Badge
                          variant={u.ver_margen ? "default" : "outline"}
                          className="cursor-pointer select-none"
                          onClick={() => toggleMargen(u.user_id, u.ver_margen)}
                        >
                          {u.ver_margen ? <Check className="mr-1 h-3 w-3" /> : null}
                          {u.ver_margen ? "Ve margen" : "Sin margen"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <div className="flex flex-wrap gap-1">
                          {dashboardCatalog.map((d) => (
                            <Badge key={d.key} variant="secondary" className="opacity-70">
                              {d.name}
                            </Badge>
                          ))}
                          <span className="text-xs text-muted-foreground self-center ml-1">(acceso total)</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {dashboardCatalog.length === 0 && (
                            <span className="text-xs text-muted-foreground">Sin dashboards configurados</span>
                          )}
                          {dashboardCatalog.map((d) => {
                            const has = u.dashboardKeys.includes(d.key);
                            return (
                              <Badge
                                key={d.key}
                                variant={has ? "default" : "outline"}
                                className="cursor-pointer select-none"
                                onClick={() => toggleDashboard(u.user_id, d.key, has)}
                              >
                                {has ? <Check className="mr-1 h-3 w-3" /> : null}
                                {d.name}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setDispositivosDe(u)}>
                        <MonitorSmartphone className="h-4 w-4" />
                        {u.dispositivos_max} · {u.sesiones_max === 0 ? "∞" : u.sesiones_max}
                      </Button>
                      {u.is_approved && (
                        <div className="mt-2 flex flex-col gap-1">
                          {u.debe_cambiar_password && <Badge variant="destructive" className="w-fit">Cambio pendiente</Badge>}
                          <span className="text-xs text-muted-foreground">
                            Contraseña: {u.password_cambiada_en ? new Date(u.password_cambiada_en).toLocaleDateString("es-ES") : "sin registro"}
                          </span>
                          <Button size="sm" variant="ghost" className="h-7 justify-start px-2 text-xs" onClick={() => setAccionPw({ u, tipo: "restablecer" })}>
                            Restablecer contraseña
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 justify-start px-2 text-xs" onClick={() => setAccionPw({ u, tipo: "forzar" })}>
                            Forzar cambio de contraseña
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!accionPw} onOpenChange={(v) => !v && setAccionPw(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accionPw?.tipo === "restablecer" ? "Restablecer contraseña" : "Forzar cambio de contraseña"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accionPw?.tipo === "restablecer"
                ? `Envía un enlace al correo ${accionPw?.u.email ?? ""}. La contraseña actual sigue funcionando hasta que el usuario ponga una nueva.`
                : "El usuario conoce su contraseña pero debe cambiarla al entrar. No se envía ningún correo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={ejecutarAccionPw}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dispositivosDe && (
        <DispositivosUsuarioDialog
          open={!!dispositivosDe}
          onOpenChange={(v) => !v && setDispositivosDe(null)}
          userId={dispositivosDe.user_id}
          nombreUsuario={dispositivosDe.full_name || dispositivosDe.email || "usuario"}
          sesionesMax={dispositivosDe.sesiones_max}
          dispositivosMax={dispositivosDe.dispositivos_max}
          onGuardado={fetchData}
        />
      )}
    </div>
  );
}
