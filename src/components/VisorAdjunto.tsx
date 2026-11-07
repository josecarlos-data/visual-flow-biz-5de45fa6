import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatearTamano, type Adjunto } from "@/lib/camposVisita";
import { cn } from "@/lib/utils";

const BUCKET = "visitas-adjuntos";
const VALIDEZ_S = 600;

const ext = (n: string) => n.split(".").pop()?.toLowerCase() ?? "";
const clase = (a: Adjunto): "imagen" | "pdf" | "otro" => {
  const t = (a.tipo ?? "").toLowerCase();
  const e = ext(a.nombre) || ext(a.path);
  if (t.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(e)) return "imagen";
  if (t === "application/pdf" || e === "pdf") return "pdf";
  return "otro";
};
const esIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

interface Urls { ver: string; descargar: string; caduca: number }

/** Botón con el nombre del archivo; al pulsarlo abre el visor dentro de la app. */
export function BotonAdjunto({ adjunto, className }: { adjunto: Adjunto; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const Icono = clase(adjunto) === "imagen" ? ImageIcon : clase(adjunto) === "pdf" ? FileText : Paperclip;
  const tam = formatearTamano(adjunto.tamano);
  return (
    <>
      <button
        type="button"
        className={cn("inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-foreground hover:bg-accent", className)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto(true); }}
      >
        <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{adjunto.nombre}</span>
        {tam && <span className="shrink-0 text-muted-foreground">· {tam}</span>}
      </button>
      {abierto && <VisorAdjunto adjunto={adjunto} open={abierto} onOpenChange={setAbierto} />}
    </>
  );
}

/** Diálogo que firma la URL al abrirse y muestra imagen, PDF o descarga. */
export function VisorAdjunto({ adjunto, open, onOpenChange }: { adjunto: Adjunto; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [urls, setUrls] = useState<Urls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [falloVista, setFalloVista] = useState(false);
  const [zoom, setZoom] = useState(false);
  const tipo = clase(adjunto);
  const ios = esIOS();

  const firmar = useCallback(async () => {
    setError(null);
    const s = supabase.storage.from(BUCKET);
    const [ver, desc] = await Promise.all([
      s.createSignedUrl(adjunto.path, VALIDEZ_S),
      s.createSignedUrl(adjunto.path, VALIDEZ_S, { download: adjunto.nombre }),
    ]);
    if (ver.error || !ver.data?.signedUrl || desc.error || !desc.data?.signedUrl) {
      // El almacenamiento no distingue «sin permiso» de «no existe»: ambos llegan como no encontrado.
      setError("No tienes permiso para ver este archivo");
      setUrls(null);
      return;
    }
    setUrls({ ver: ver.data.signedUrl, descargar: desc.data.signedUrl, caduca: Date.now() + (VALIDEZ_S - 30) * 1000 });
  }, [adjunto.path, adjunto.nombre]);

  useEffect(() => { if (open) void firmar(); }, [open, firmar]);

  // Si el visor sigue abierto cerca de la caducidad, vuelve a firmar.
  useEffect(() => {
    if (!urls) return;
    const t = window.setTimeout(() => void firmar(), Math.max(0, urls.caduca - Date.now()));
    return () => window.clearTimeout(t);
  }, [urls, firmar]);

  const tam = formatearTamano(adjunto.tamano);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none p-3 sm:h-[90vh] sm:max-w-4xl sm:rounded-lg sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="truncate text-base">{adjunto.nombre}</DialogTitle>
          <DialogDescription>{tam || (tipo === "imagen" ? "Imagen" : tipo === "pdf" ? "PDF" : "Archivo")}</DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-auto rounded-md border bg-muted">
          {error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{error}</div>
          ) : !urls ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : tipo === "imagen" && !falloVista ? (
            <div className={cn("flex min-h-full", zoom ? "items-start justify-start" : "items-center justify-center")}>
              <img
                src={urls.ver}
                alt={adjunto.nombre}
                onError={() => setFalloVista(true)}
                onClick={() => setZoom((z) => !z)}
                className={cn(zoom ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain")}
              />
            </div>
          ) : tipo === "pdf" && !ios ? (
            <iframe src={urls.ver} title={adjunto.nombre} className="h-full w-full bg-background" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p className="font-medium text-foreground">{adjunto.nombre}</p>
              {tam && <p>{tam}</p>}
              <p>
                {tipo === "imagen"
                  ? "No se puede previsualizar este formato en este dispositivo."
                  : tipo === "pdf"
                    ? "Ábrelo en otra pestaña para verlo completo."
                    : "Este tipo de archivo no se puede previsualizar."}
              </p>
            </div>
          )}
        </div>

        {tipo === "imagen" && urls && !falloVista && !error && (
          <p className="text-center text-xs text-muted-foreground">Toca la imagen para {zoom ? "ajustarla" : "ampliarla"}.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline" size="sm" disabled={!urls}>
            <a href={urls?.ver} target="_blank" rel="noopener noreferrer" aria-disabled={!urls} onClick={(e) => { if (!urls) e.preventDefault(); }}>
              <ExternalLink className="mr-1 h-4 w-4" /> Abrir en otra pestaña
            </a>
          </Button>
          <Button asChild size="sm" disabled={!urls}>
            <a href={urls?.descargar} aria-disabled={!urls} onClick={(e) => { if (!urls) e.preventDefault(); }}>
              <Download className="mr-1 h-4 w-4" /> Descargar
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
