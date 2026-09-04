import { useState } from "react";
import { Camera, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/** Documento adjunto a la visita completa (no a un bloque concreto). */
export interface DocVisita {
  path: string;
  nombre: string;
  tipo: string;
}

/** Abre un documento privado del bucket mediante una URL firmada temporal. */
export async function abrirDocumento(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from("visitas-adjuntos").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast({
      title: "No se ha podido abrir el documento",
      description: error?.message ?? "Enlace no disponible",
      variant: "destructive",
    });
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

interface Props {
  documentos: DocVisita[];
  onChange: (docs: DocVisita[]) => void;
}

export function DocumentosVisita({ documentos, onChange }: Props) {
  const { user } = useAuth();
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);

  const subir = async (files: File[]) => {
    if (!user || files.length === 0) return;
    const subidos: DocVisita[] = [];
    setProgreso({ hecho: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgreso({ hecho: i, total: files.length });
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("visitas-adjuntos").upload(path, file, { upsert: false });
        if (error) {
          toast({
            title: `No se ha podido subir «${file.name}»`,
            description: error.message,
            variant: "destructive",
          });
          break;
        }
        subidos.push({ path, nombre: file.name, tipo: file.type || "" });
      }
    } finally {
      setProgreso(null);
      if (subidos.length) onChange([...documentos, ...subidos]);
    }
  };

  const quitar = (path: string) => onChange(documentos.filter((d) => d.path !== path));

  const subiendo = progreso !== null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Paperclip className="h-4 w-4" /> Documentos de la visita
        {subiendo && (
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Subiendo {Math.min(progreso.hecho + 1, progreso.total)} de {progreso.total}…
          </span>
        )}
      </div>

      {documentos.length > 0 && (
        <ul className="space-y-1">
          {documentos.map((d) => (
            <li key={d.path} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{d.nombre}</span>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => quitar(d.path)}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline" size="sm" disabled={subiendo} className="flex-1">
          <label className="cursor-pointer">
            <Camera className="mr-2 h-4 w-4" />Hacer foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={subiendo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subir([f]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <Button asChild variant="outline" size="sm" disabled={subiendo} className="flex-1">
          <label className="cursor-pointer">
            <Paperclip className="mr-2 h-4 w-4" />Adjuntar archivos
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              disabled={subiendo}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length) void subir(fs);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sirven para toda la visita: un albarán con varias referencias se sube una sola vez.
      </p>
    </div>
  );
}
