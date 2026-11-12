import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { startRecording, type Recorder } from "@/lib/audio";
import { toast } from "@/hooks/use-toast";

/** Umbrales de seguridad de la grabación (en segundos). */
const AVISO_LARGA_S = 3 * 60; // aviso visible: la nota se está alargando
const LIMITE_MAX_S = 5 * 60; // parada automática (el audio va sin comprimir en RAM)
const SILENCIO_MAX_S = 45; // sin voz detectada: el SO puede haber quitado el micro
const NIVEL_SILENCIO = 0.02; // por debajo se considera silencio
const CONFIRMAR_DESDE_S = 2 * 60; // a partir de aquí se pide confirmación antes de analizar

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

interface Props {
  onAudio: (blob: Blob) => void;
  disabled?: boolean;
  processing?: boolean;
  hasResult?: boolean;
}

export function VoiceRecorder({ onAudio, disabled, processing, hasResult }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [sinVoz, setSinVoz] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  /** Audio ya grabado a la espera de que el comercial decida: analizar o descartar. */
  const [pendiente, setPendiente] = useState<{ blob: Blob; segundos: number; motivo: "limite" | "larga" } | null>(null);

  const recorderRef = useRef<Recorder | null>(null);
  const rafRef = useRef<number>();
  const silencioRef = useRef(0);
  const secondsRef = useRef(0);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= LIMITE_MAX_S) void detener("limite");
        return next;
      });
    }, 1000);

    let ultimo = performance.now();
    const tick = () => {
      const rec = recorderRef.current;
      if (rec) {
        const l = rec.getLevel();
        setLevel(l);
        const ahora = performance.now();
        const delta = (ahora - ultimo) / 1000;
        ultimo = ahora;
        silencioRef.current = l < NIVEL_SILENCIO ? silencioRef.current + delta : 0;
        setSinVoz(silencioRef.current >= SILENCIO_MAX_S);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearInterval(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  const reiniciar = () => {
    setRecording(false);
    setLevel(0);
    setSinVoz(false);
    silencioRef.current = 0;
  };

  const start = async () => {
    try {
      recorderRef.current = await startRecording();
      setPendiente(null);
      setSeconds(0);
      silencioRef.current = 0;
      setSinVoz(false);
      setRecording(true);
    } catch {
      toast({
        title: "No se puede acceder al micrófono",
        description: "Autoriza el micrófono en tu navegador para dictar la visita.",
        variant: "destructive",
      });
    }
  };

  /** Descarta la grabación en curso: no se sube nada ni se consume crédito. */
  const descartar = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setConfirmarDescarte(false);
    setPendiente(null);
    reiniciar();
    setSeconds(0);
    toast({ title: "Grabación descartada", description: "No se ha enviado nada a analizar." });
  };

  const detener = async (motivo: "manual" | "limite") => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    const duracion = secondsRef.current;
    reiniciar();
    const blob = await rec.stop();

    if (blob.size < 4096) {
      setSeconds(0);
      toast({
        title: "Grabación demasiado corta",
        description: "No se ha detectado voz. Vuelve a intentarlo.",
        variant: "destructive",
      });
      return;
    }

    if (motivo === "limite") {
      setPendiente({ blob, segundos: duracion, motivo: "limite" });
      toast({
        title: "Grabación detenida a los 5 minutos",
        description: "El audio está guardado: decide si lo analizas o lo descartas.",
      });
      return;
    }

    if (duracion >= CONFIRMAR_DESDE_S) {
      setPendiente({ blob, segundos: duracion, motivo: "larga" });
      return;
    }

    onAudio(blob);
  };

  if (processing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Transcribiendo y analizando la nota…</p>
      </div>
    );
  }

  // Audio grabado a la espera de decisión (límite alcanzado o nota larga).
  if (pendiente) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6">
        <p className="text-center text-sm font-medium">
          Nota de {mmss(pendiente.segundos)} · ¿Analizar?
        </p>
        <p className="text-center text-xs text-muted-foreground">
          {pendiente.motivo === "limite"
            ? "Se ha detenido automáticamente al llegar al límite de 5 minutos. El audio no se ha perdido."
            : "Es una nota larga: confirma antes de enviarla a analizar."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            onClick={() => {
              const blob = pendiente.blob;
              setPendiente(null);
              setSeconds(0);
              onAudio(blob);
            }}
          >
            Analizar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPendiente(null);
              setSeconds(0);
              toast({ title: "Grabación descartada", description: "No se ha enviado nada a analizar." });
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Descartar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6">
      {recording ? (
        <>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => detener("manual")}
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform active:scale-95"
              aria-label="Detener grabación"
            >
              <span
                className="absolute inset-0 rounded-full bg-destructive/30"
                style={{ transform: `scale(${1 + level * 0.6})`, transition: "transform 80ms linear" }}
              />
              <Square className="relative h-7 w-7 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmarDescarte(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm transition-transform active:scale-95 hover:text-foreground"
              aria-label="Descartar grabación"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          <div className="text-center">
            <p className="font-mono text-lg font-semibold tabular-nums">{mmss(seconds)}</p>
            <p className="text-xs text-muted-foreground">Grabando… pulsa el cuadrado para terminar</p>
          </div>

          {seconds >= AVISO_LARGA_S && (
            <p className="flex items-center gap-1 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              La nota se está alargando; se detendrá sola a los {LIMITE_MAX_S / 60} minutos.
            </p>
          )}

          {sinVoz && (
            <div className="w-full rounded-md border border-amber-400/70 bg-amber-50/60 p-3 text-center text-xs dark:bg-amber-500/10">
              <p className="font-medium">No se detecta voz desde hace un rato</p>
              <p className="text-muted-foreground">
                Puede que otra aplicación (una llamada) haya tomado el micrófono.
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setConfirmarDescarte(true)}>
                <Trash2 className="mr-1 h-4 w-4" /> Descartar y volver a empezar
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95",
              disabled ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
            )}
            aria-label="Grabar nota de voz"
          >
            {hasResult ? <RotateCcw className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            {disabled
              ? "Selecciona primero un cliente"
              : hasResult
              ? "Vuelve a dictar para añadir o sustituir"
              : "Pulsa y cuenta cómo ha ido la visita"}
          </p>
        </>
      )}

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar la grabación?</AlertDialogTitle>
            <AlertDialogDescription>
              El audio se borra sin enviarse: no se transcribe ni se analiza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir grabando</AlertDialogCancel>
            <AlertDialogAction onClick={descartar}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
