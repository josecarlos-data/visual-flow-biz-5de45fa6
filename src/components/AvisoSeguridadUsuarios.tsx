import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

const LIMITE_LATIDO_MIN = 30;

interface Resumen {
  ultima_comprobacion: string | null;
  ultimo_aviso: { resultado: string } | null;
}

/** Aviso breve en Usuarios: solo aparece si algo de Seguridad requiere atención. */
export default function AvisoSeguridadUsuarios({ onModo2fa }: { onModo2fa?: (modo: string) => void }) {
  const [problemas, setProblemas] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: ajustes }, { data: res }] = await Promise.all([
        supabase.from("app_settings" as never).select("key, value").in("key", ["control_acceso_modo", "segundo_factor_modo"]),
        supabase.rpc("avisos_resumen_panel" as never),
      ]);
      const filas = (ajustes ?? []) as unknown as { key: string; value: string }[];
      const p: string[] = [];
      filas.forEach((f) => {
        if (f.key === "segundo_factor_modo") onModo2fa?.(f.value);
        if (f.key === "control_acceso_modo" && f.value === "bloqueo") p.push("El modo bloqueo está activo.");
      });
      const r = (res as unknown as Resumen) ?? null;
      if (r?.ultimo_aviso && (r.ultimo_aviso.resultado === "denegado" || r.ultimo_aviso.resultado === "fallo")) {
        p.push("Los avisos no están llegando.");
      }
      const latido = r?.ultima_comprobacion;
      if (!latido || Date.now() - new Date(latido).getTime() > LIMITE_LATIDO_MIN * 60000) {
        p.push("Los avisos no se están comprobando.");
      }
      setProblemas(p);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!problemas.length) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{problemas.join(" ")}</span>
      </div>
      <Button asChild size="sm" variant="outline" className="w-fit">
        <Link to="/admin/seguridad">Ir a Seguridad</Link>
      </Button>
    </div>
  );
}
