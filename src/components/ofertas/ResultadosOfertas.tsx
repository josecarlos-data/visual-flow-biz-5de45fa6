import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "@e965/xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { importePorComprador, tasaConversion } from "@/lib/comunicaciones";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));
const pct0 = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} %`);
const ORIGEN: Record<string, string> = { manual: "Manual", recomendacion: "Recomendación" };
const AGRUPAR: Record<string, string> = { oferta: "Oferta", comercial: "Comercial", delegacion: "Delegación", origen: "Origen" };

interface Fila {
  clave: string; etiqueta: string; confirmados: number; medibles: number; compradores: number; compradores_vigencia: number;
  importe: number; margen: number | null; dias_medios: number | null; fecha_corte: string;
}
type Orden = "importe" | "conversion" | "compradores";

export function ResultadosOfertas({ desde, hasta }: { desde: string; hasta: string }) {
  const [dias, setDias] = useState("30");
  const [agrupar, setAgrupar] = useState("oferta");
  const [orden, setOrden] = useState<Orden>("importe");

  const q = useQuery({
    queryKey: ["ofertas_resultados", desde, hasta, dias, agrupar],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ofertas_resultados", { _desde: desde || null, _hasta: hasta || null, _dias: Number(dias), _agrupar: agrupar } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const filas = [...(q.data ?? [])].sort((a, b) => {
    if (orden === "conversion") return (tasaConversion(b.compradores, b.medibles) ?? -1) - (tasaConversion(a.compradores, a.medibles) ?? -1);
    if (orden === "compradores") return b.compradores - a.compradores;
    return Number(b.importe) - Number(a.importe);
  });
  const verMargen = filas.some((f) => f.margen != null);
  const nombre = (f: Fila) => (agrupar === "origen" ? ORIGEN[f.etiqueta] ?? f.etiqueta : f.etiqueta);

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(filas.map((f) => ({
      [AGRUPAR[agrupar]]: nombre(f), Confirmados: f.confirmados, Medibles: f.medibles, Compradores: f.compradores,
      "Conversión %": tasaConversion(f.compradores, f.medibles) ?? "", "Compraron en vigencia": f.compradores_vigencia,
      Importe: Number(f.importe), ...(verMargen ? { Margen: Number(f.margen ?? 0) } : {}),
      "Importe por comprador": importePorComprador(Number(f.importe), f.compradores) ?? "", "Días hasta compra": f.dias_medios ?? "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, `resultados_ofertas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Compras de lo ofertado desde el día del envío confirmado hasta el final de la ventana. Si una compra encaja con varias ofertas, cuenta para la enviada más recientemente. Los abonos restan. Es una asociación, no prueba que la oferta cause la venta.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><Label className="text-xs">Ventana</Label>
          <Select value={dias} onValueChange={setDias}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["15", "30", "60"].map((d) => <SelectItem key={d} value={d}>{d} días</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs">Agrupar por</Label>
          <Select value={agrupar} onValueChange={setAgrupar}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(AGRUPAR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs">Ordenar por</Label>
          <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="importe">Importe</SelectItem>
              <SelectItem value="conversion">Conversión</SelectItem>
              <SelectItem value="compradores">Compradores</SelectItem>
            </SelectContent>
          </Select></div>
        <div className="flex items-end">
          <Button size="sm" variant="outline" className="w-full" disabled={!filas.length} onClick={exportar}><Download className="mr-1 h-3 w-3" />Exportar</Button>
        </div>
      </div>

      {q.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        : q.error ? <p className="text-sm text-destructive">No se han podido cargar los resultados.</p>
        : !filas.length ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay envíos confirmados en este periodo.</CardContent></Card>
        : filas.map((f, i) => {
          const conv = tasaConversion(f.compradores, f.medibles);
          return (
            <Card key={f.clave}><CardContent className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate font-semibold"><span className="mr-1 text-muted-foreground">{i + 1}.</span>{nombre(f)}</p>
                <p className="shrink-0 font-semibold text-primary">{eur(f.importe)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <div><p className="text-xs text-muted-foreground">Compraron</p><p className="font-medium">{f.compradores} de {f.medibles}</p></div>
                <div><p className="text-xs text-muted-foreground">Conversión</p><p className="font-medium">{pct0(conv)}</p></div>
                <div><p className="text-xs text-muted-foreground">En vigencia</p><p className="font-medium">{f.compradores_vigencia}</p></div>
                <div><p className="text-xs text-muted-foreground">Por comprador</p><p className="font-medium">{eur(importePorComprador(Number(f.importe), f.compradores))}</p></div>
                <div><p className="text-xs text-muted-foreground">Días hasta compra</p><p className="font-medium">{f.dias_medios == null ? "—" : Number(f.dias_medios).toLocaleString("es-ES")}</p></div>
              </div>
              {verMargen && <p className="text-xs text-muted-foreground">Margen: {eur(f.margen)}</p>}
              {f.confirmados > f.medibles && (
                <p className="text-xs text-muted-foreground">{f.confirmados - f.medibles} envío{f.confirmados - f.medibles === 1 ? "" : "s"} pendiente{f.confirmados - f.medibles === 1 ? "" : "s"} de datos de ventas.</p>
              )}
            </CardContent></Card>
          );
        })}
    </div>
  );
}

interface Linea {
  fecha: string; id_documento: string | null; referencia: string; descripcion: string | null;
  unidades: number; importe: number; margen: number | null; atribuida_a_otra: string | null;
}

/** Compras de lo ofertado tras un envío concreto. */
export function ComprasEnvio({ envioId }: { envioId: string }) {
  const q = useQuery({
    queryKey: ["oferta_envio_compras", envioId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("oferta_envio_compras", { _envio_id: envioId, _dias: 30 } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Linea[];
    },
  });
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (q.error) return <p className="text-xs text-destructive">No se han podido cargar las compras.</p>;
  const lineas = q.data ?? [];
  const propias = lineas.filter((l) => !l.atribuida_a_otra);
  const total = propias.reduce((s, l) => s + Number(l.importe), 0);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compras en los 30 días siguientes</p>
      {!lineas.length ? <p className="text-sm text-muted-foreground">Sin compras de lo ofertado.</p> : (
        <>
          <div className="divide-y rounded-md border text-xs">
            {lineas.map((l, i) => (
              <div key={i} className={`flex items-start justify-between gap-2 p-2 ${l.atribuida_a_otra ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.referencia}{l.descripcion ? ` · ${l.descripcion}` : ""}</p>
                  <p className="text-muted-foreground">{new Date(`${l.fecha}T00:00:00`).toLocaleDateString("es-ES")}{l.id_documento ? ` · ${l.id_documento}` : ""} · {Number(l.unidades).toLocaleString("es-ES")} ud.</p>
                  {l.atribuida_a_otra && <p className="text-muted-foreground">Cuenta para «{l.atribuida_a_otra}»</p>}
                </div>
                <span className="shrink-0 font-medium">{eur(l.importe)}</span>
              </div>
            ))}
          </div>
          <p className="text-right text-sm font-semibold">Total atribuido: {eur(total)}</p>
        </>
      )}
    </div>
  );
}
