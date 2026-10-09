import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SeguridadAccesoCard from "@/components/SeguridadAccesoCard";

export default function AdminSeguridad() {
  const [activosSinUsuario, setActivosSinUsuario] = useState(0);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("is_approved", true)
        .eq("estado", "activo")
        .is("username", null);
      setActivosSinUsuario(count ?? 0);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Seguridad</h1>
        <p className="text-muted-foreground">Control de acceso, sesiones, segundo factor y avisos por correo</p>
      </div>
      <SeguridadAccesoCard activosSinUsuario={activosSinUsuario} />
    </div>
  );
}
