import { useState } from "react";
import { CheckCircle2, Clock, XCircle, ChevronLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversacionBloque } from "@/components/ConversacionBloque";
import { useMisRevisiones, useMensajesVisita, useMarcarLeida, type MiRevision } from "@/hooks/useVisitaMensajes";
import { fechaCorta, useMotivos, useVisitaBloques, type VisitaBloque } from "@/hooks/useCrm";
import { Pencil } from "lucide-react";
import { presentarCampos } from "@/lib/camposVisita";
import { BotonAdjunto } from "@/components/VisorAdjunto";
import { CompletarBloqueDialog } from "@/components/CompletarBloqueDialog";

type Filtro = "sin_leer" | "esperando" | "todas";

const estadoBloque = (v: string | null) =>
  v === "CORRECTO" ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Correcto</Badge>
  : v === "NO CORRECTO" ? <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> No correcto</Badge>
  : <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendiente</Badge>;

function ErrorCarga({ texto, reintentar }: { texto: string; reintentar: () => void }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm">
        <p>{texto}</p>
        <Button size="sm" variant="outline" onClick={reintentar}>Reintentar</Button>
      </CardContent>
    </Card>
  );
}

function DatosBloque({ bloque, titulo }: { bloque: VisitaBloque | undefined; titulo: string }) {
  const { data: motivos } = useMotivos();
  const [abierto, setAbierto] = useState(false);
  if (!bloque) return <p className="text-xs text-muted-foreground">Cargando datos…</p>;
  const def = motivos?.find((m) => m.key === bloque.motivo_key)?.campos ?? [];
  const items = presentarCampos(bloque.campos, def);
  const validado = bloque.validacion === "CORRECTO";
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="space-y-1 rounded-md border p-2 text-sm">
          {items.map((it) => (
            <div key={it.clave} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{it.label}</span>
              {it.clase === "adjunto" ? <BotonAdjunto adjunto={it.adjunto} /> : <span className="text-right font-medium">{it.valor}</span>}
            </div>
          ))}
        </div>
      )}
      {validado ? (
        <p className="text-xs text-muted-foreground">Validado, no se puede cambiar.</p>
      ) : (
        <>
          <Button size="sm" variant="outline" className="w-full" onClick={() => setAbierto(true)} disabled={!motivos}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Completar datos
          </Button>
          <CompletarBloqueDialog bloque={bloque} campos={def} titulo={titulo} open={abierto} onOpenChange={setAbierto} />
        </>
      )}
    </div>
  );
}

function Detalle({ r, volver }: { r: MiRevision; volver: () => void }) {
  useMarcarLeida(r.visita_id);
  const { data: mensajes, isLoading, isError, refetch } = useMensajesVisita(r.visita_id);
  const { data: bloquesMap } = useVisitaBloques([r.visita_id]);
  const bloquesBD = bloquesMap?.get(r.visita_id) ?? [];
  const hilo = (id: string | null) => (mensajes ?? []).filter((m) => m.bloque_id === id);
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={volver}><ChevronLeft className="mr-1 h-4 w-4" /> Avisos de revisión</Button>
      <div>
        <h1 className="text-xl font-bold">{r.cliente}</h1>
        <p className="text-sm text-muted-foreground">{fechaCorta(r.fecha)}</p>
      </div>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : isError ? (
        <ErrorCarga texto="No se han podido cargar los mensajes." reintentar={() => refetch()} />
      ) : (
        <>
          {r.bloques.map((b, i) => (
            <Card key={b.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{i + 1}. {b.motivo ?? "Bloque"}</p>
                  {estadoBloque(bloquesBD.find((x) => x.id === b.id)?.validacion ?? b.validacion)}
                </div>
                <DatosBloque bloque={bloquesBD.find((x) => x.id === b.id)} titulo={b.motivo ?? "Bloque"} />
                <ConversacionBloque visitaId={r.visita_id} bloqueId={b.id} mensajes={hilo(b.id)} puedeEscribir />
              </CardContent>
            </Card>
          ))}
          {(r.bloques.length === 0 || hilo(null).length > 0) && (
            <Card>
              <CardContent className="space-y-2 p-3">
                <p className="font-medium">Visita</p>
                <ConversacionBloque visitaId={r.visita_id} bloqueId={null} mensajes={hilo(null)} puedeEscribir />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function MisRevisiones() {
  const [filtro, setFiltro] = useState<Filtro>("sin_leer");
  const [limite, setLimite] = useState(30);
  const [sel, setSel] = useState<MiRevision | null>(null);
  const { data, isLoading, isError, refetch } = useMisRevisiones(filtro, limite);
  const total = data?.[0]?.total ?? 0;

  if (sel) return <Detalle r={sel} volver={() => setSel(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avisos de revisión</h1>
        <p className="text-sm text-muted-foreground">Mensajes y correcciones de dirección sobre tus visitas.</p>
      </div>
      <Tabs value={filtro} onValueChange={(v) => { setFiltro(v as Filtro); setLimite(30); }}>
        <TabsList className="w-full">
          <TabsTrigger value="sin_leer" className="flex-1">Sin leer</TabsTrigger>
          <TabsTrigger value="esperando" className="flex-1">Esperando mi respuesta</TabsTrigger>
          <TabsTrigger value="todas" className="flex-1">Todas</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : isError ? (
        <ErrorCarga texto="No se han podido cargar los avisos de revisión." reintentar={() => refetch()} />
      ) : !data?.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay novedades.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map((r) => (
            <Card key={r.visita_id} className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => setSel(r)}>
              <CardContent className="space-y-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{r.cliente}</p>
                  {r.sin_leer > 0 && <Badge>{r.sin_leer} nuevo{r.sin_leer === 1 ? "" : "s"}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {fechaCorta(r.fecha)} · {r.bloques.map((b) => b.motivo ?? "Bloque").join(" + ") || "Sin bloques"}
                </p>
                <div className="flex flex-wrap gap-1">{r.bloques.map((b) => <span key={b.id}>{estadoBloque(b.validacion)}</span>)}</div>
                {r.ultimo_texto && (
                  <p className="line-clamp-2 text-sm"><span className="text-muted-foreground">{r.ultimo_autor ?? "—"}: </span>{r.ultimo_texto}</p>
                )}
              </CardContent>
            </Card>
          ))}
          {data.length < total && (
            <Button variant="outline" className="w-full" onClick={() => setLimite((l) => l + 30)}>Ver más</Button>
          )}
        </div>
      )}
    </div>
  );
}
