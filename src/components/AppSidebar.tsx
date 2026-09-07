import * as Icons from "lucide-react";
import { Users, Database, BarChart3, LogOut, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import logoRimosaIcon from "@/assets/logo_rimosa_icon.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { role, user, signOut, dashboards } = useAuth();
  const isAdmin = role === "admin";
  const esDireccion = role === "director_comercial";
  const puedeRevisar = isAdmin || esDireccion || role === "jefe_de_zona";

  const mainItems = dashboards.map((d) => {
    const IconComp = (d.icon && (Icons as any)[d.icon]) || BarChart3;
    return { title: d.name, url: d.route, icon: IconComp, end: d.route === "/" };
  });

  const objetivosItem = { title: "Objetivos", url: "/admin/objetivos", icon: Icons.Target };

  const adminItems = isAdmin
    ? [
        { title: "Usuarios", url: "/admin/users", icon: Users },
        { title: "Datos", url: "/admin/data", icon: Database },
        { title: "Plantillas de visita", url: "/admin/visitas", icon: Icons.ClipboardList },
        { title: "Situaciones de cliente", url: "/admin/situaciones", icon: Icons.ShieldAlert },
        objetivosItem,
        { title: "Auditoría", url: "/admin/auditoria", icon: Icons.ScrollText },
        { title: "Funciones", url: "/admin/functions", icon: Settings },
      ]
    : esDireccion
      ? [objetivosItem]
      : [];


  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <img src={logoRimosaIcon} alt="RIMOSA" className="h-8 w-8 object-contain" />
        <span className="font-semibold text-primary">RIMOSA</span>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                ...mainItems,
                ...(puedeRevisar ? [{ title: "Revisión de visitas", url: "/visitas/revision", icon: Icons.ClipboardCheck, end: false }] : []),
              ].map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.end} activeClassName="bg-accent text-accent-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} activeClassName="bg-accent text-accent-foreground font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="mb-2 truncate text-sm text-muted-foreground">
          {user?.email}
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
