import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Ban, Loader2, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { parsePatrones } from "@/lib/ofertas";

type Fila = { valor: string; clientes: number; bloqueado: boolean };

export default function PatronesProhibicionCard() {
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [guardando, setGuardando] = useState(false);

  const patrones = texto.split("\n").map((s) => s.trim()).filter(Boolean);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "ofertas_patrones_prohibicion").maybeSingle()
      .then(({ data }) => setTexto(parsePatrones(data?.value).join("\n")));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("ofertas_patrones_vista_previa", { _patrones: patrones });
      setFilas((data ?? []) as Fila[]);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const guardar = async () => {
    setGuardando(true);
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "ofertas_patrones_prohibicion", value: JSON.stringify(patrones) }, { onConflict: "key" });
    setGuardando(false);
    toast(error ? { title: "Error al guardar", description: error.message, variant: "destructive" } : { title: "Patrones guardados" });
  };

  const bloqueados = (filas ?? []).filter((f) => f.bloqueado);
  const totalBloq = bloqueados.reduce((s, f) => s + f.clientes, 0);

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Ban className="h-5 w-5" />Prohibición de venta: bloqueo de ofertas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Un patrón por línea. Se bloquea al cliente si su prohibición de venta contiene alguno, sin distinguir mayúsculas ni tildes. El resto solo muestra un aviso.</p>
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <div className="space-y-2">
            <Textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} className="font-mono text-sm" />
            <Button size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar
            </Button>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium">{totalBloq.toLocaleString("es-ES")} clientes bloqueados</p>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded border p-2">
              {filas === null ? <Loader2 className="h-4 w-4 animate-spin" /> : filas.map((f) => (
                <div key={f.valor} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{f.valor}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{f.clientes.toLocaleString("es-ES")}</span>
                    <Badge variant={f.bloqueado ? "destructive" : "outline"}>{f.bloqueado ? "Bloquea" : "Aviso"}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
