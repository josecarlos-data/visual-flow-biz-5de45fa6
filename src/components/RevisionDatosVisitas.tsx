import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Fila = { id: string; fecha: string; comercial: string | null; cliente_externo: string | null; titulo: string | null; problema: string };

export function RevisionDatosVisitas() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["visitas_revision_datos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("visitas_revision_datos");
      if (error) throw error;
      return (data ?? []) as Fila[];
    },
  });
  const futuras = data?.filter((f) => f.problema === "fecha_futura") ?? [];
  const sinCliente = data?.filter((f) => f.problema === "sin_cliente") ?? [];
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-ES");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Visitas por revisar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? <Skeleton className="h-16 w-full" /> : error ? (
          <p className="text-destructive">No se ha podido cargar la revisión.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={futuras.length ? "destructive" : "secondary"}>{futuras.length} con fecha futura</Badge>
              <Badge variant="secondary">{sinCliente.length}{sinCliente.length >= 1000 ? "+" : ""} sin cliente asociado</Badge>
            </div>
            {futuras.length > 0 && (
              <ul className="divide-y rounded-md border">
                {futuras.map((f) => (
                  <li key={f.id} className="flex flex-wrap justify-between gap-2 p-2">
                    <span className="font-medium">{fmt(f.fecha)}</span>
                    <span className="text-muted-foreground">{f.comercial ?? "—"} · {f.titulo || f.cliente_externo || "Sin título"}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
