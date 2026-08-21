import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Check, X, Pencil, Save } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

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
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [delegaciones, setDelegaciones] = useState<string[]>([]);
  const [dashboardCatalog, setDashboardCatalog] = useState<DashboardCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<{ userId: string; field: "full_name" } | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, vendedoresRes, delegacionesRes, dashboardsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, employee_code, is_approved, delegacion, ver_margen"),
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
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const approveUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ is_approved: true }).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Usuario aprobado" }); fetchData(); }
  };

  const rejectUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ is_approved: false }).eq("user_id", userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Acceso revocado" }); fetchData(); }
  };

  const assignRole = async (userId: string, role: AppRole) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Rol asignado" }); fetchData(); }
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
    else { toast({ title: !current ? "Margen visible" : "Margen oculto" }); fetchData(); }
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

  const pendingUsers = users.filter((u) => !u.is_approved);
  const approvedUsers = users.filter((u) => u.is_approved);

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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
