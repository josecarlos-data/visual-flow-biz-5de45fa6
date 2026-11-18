import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvanceV2 } from "@/hooks/useObjetivosV2";
import { useKpiVisible } from "@/hooks/useKpiVisitas";
import { KpiTarjetasMes } from "@/components/kpi/KpiTarjetasMes";
import { KpiTablaAnual } from "@/components/kpi/KpiTablaAnual";
import { ObjetivoV2Card } from "@/components/ObjetivoV2Card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Objetivos() {
  const { user, role } = useAuth();
  // El bloque KPI solo se pinta si el servidor lo permite (kpi_visible_para).
  const { data: kpiVisible } = useKpiVisible();
  const gestorKpi = role === "admin" || role === "director_comercial" || role === "jefe_de_zona";
  const [vendedorSel, setVendedorSel] = useState("todos");
  const { data, isLoading, error } = useAvanceV2();

  // Los borradores nunca se enseñan en las tarjetas.
  const activos = useMemo(() => (data ?? []).filter((a) => a.estado === "activo" || a.estado === "cerrado"), [data]);
  const vendedores = useMemo(() => Array.from(new Set(activos.map((a) => a.vendedor))).sort(), [activos]);
  const soloPropios = activos.every((a) => a.user_id === user?.id);

  const visibles = activos
    .filter((a) => vendedorSel === "todos" || a.vendedor === vendedorSel)
    .sort((x, y) => Number(x.estado === "cerrado") - Number(y.estado === "cerrado"));

  return (
    <div className={`mx-auto space-y-4 p-3 md:p-6 ${kpiVisible && gestorKpi ? "max-w-6xl" : "max-w-3xl"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Target className="h-5 w-5 text-primary" /> Objetivos
        </h1>
        {!soloPropios && vendedores.length > 1 && (
          <Select value={vendedorSel} onValueChange={setVendedorSel}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los comerciales</SelectItem>
              {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {kpiVisible === true && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">{gestorKpi ? "KPI de visitas" : "KPI del mes"}</h2>
          {gestorKpi ? <KpiTablaAnual /> : <KpiTarjetasMes />}
        </section>
      )}

      {kpiVisible === true && <h2 className="pt-2 text-base font-semibold">Objetivos de venta</h2>}
      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && (
        <Card><CardContent className="p-6 text-sm text-destructive">
          No se pudieron cargar los objetivos: {(error as Error).message}
        </CardContent></Card>
      )}
      {!isLoading && !error && visibles.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Todavía no tienes objetivos asignados.</CardContent></Card>
      )}

      <div className="grid gap-3">
        {visibles.map((a) => <ObjetivoV2Card key={a.asignacion_id} a={a} mostrarVendedor={!soloPropios} />)}
      </div>
    </div>
  );
}
