import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { eur, pct } from "@/lib/format";
import { siguienteTramo } from "@/lib/objetivosV2";
import type { AvanceV2 } from "@/hooks/useObjetivosV2";

const fmtFecha = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

const valor = (v: number | null | undefined, medida: string) =>
  medida === "unidades" ? `${Math.round(v ?? 0).toLocaleString("es-ES")} uds` : eur(v ?? 0);

export function ObjetivoV2Card({ a, mostrarVendedor = false }: { a: AvanceV2; mostrarVendedor?: boolean }) {
  const avance = a.avance_pct ?? 0;
  const proy = a.proyeccion_pct ?? 0;
  const sig = siguienteTramo(a.tramos ?? [], a.vendido, a.meta);
  const estado =
    proy >= 100
      ? { t: "En objetivo", v: "default" as const }
      : proy >= 90
        ? { t: "Ajustado", v: "secondary" as const }
        : { t: "Por debajo", v: "destructive" as const };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{a.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {mostrarVendedor && <span className="font-medium text-foreground">{a.vendedor} · </span>}
              {fmtFecha(a.desde)} – {fmtFecha(a.hasta)} · {a.num_clientes} clientes
            </p>
          </div>
          <Badge variant={estado.v} className="shrink-0">{estado.t}</Badge>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold">{pct(avance)}</span>
            <span className="text-xs text-muted-foreground">
              {valor(a.vendido, a.medida)} de {valor(a.meta, a.medida)}
            </span>
          </div>
          <Progress value={Math.min(avance, 100)} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted p-2">
            <p className="text-xs text-muted-foreground">Falta</p>
            <p className="font-semibold">{valor(a.falta, a.medida)}</p>
          </div>
          <div className="rounded-md bg-muted p-2">
            <p className="text-xs text-muted-foreground">Proyección al cierre</p>
            <p className="font-semibold">{valor(a.proyeccion, a.medida)} <span className="text-xs font-normal">({pct(proy)})</span></p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Tramo:</span>
          {a.tramo ? (
            <Badge variant="outline">
              {a.tramo.etiqueta}
              {a.mostrar_importe && a.tramo.importe ? ` · ${eur(a.tramo.importe)}` : ""}
            </Badge>
          ) : (
            <span>ninguno aún</span>
          )}
          {sig && (
            <span className="text-xs text-muted-foreground">
              Para «{sig.tramo.etiqueta}» faltan {valor(sig.falta, a.medida)}
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Datos hasta {fmtFecha(a.fecha_corte)} · año anterior comparado hasta {fmtFecha(a.fin_comparable)}
        </p>
      </CardContent>
    </Card>
  );
}
