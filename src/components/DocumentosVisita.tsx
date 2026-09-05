import { Camera, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useMotivos } from "@/hooks/useCrm";

/**
 * Documento adjunto a la visita completa (no a un bloque concreto).
 * Antes de guardar lleva `file` en memoria; tras la subida lleva `path`.
 * `nombre` es el campo antiguo, se conserva opcional para leer visitas ya guardadas.
 */
export interface DocVisita {
  file?: File;
  path?: string;
  nombre_original?: string;
  nombre?: string;
  tipo: string;
  tamano?: number;
  hash?: string;
  motivo_key?: string | null;
}

const SIN_MOTIVO = "__sin__";

/** Etiqueta legible de un documento, compatible con las visitas guardadas antes del refactor. */
export const nombreDoc = (d: DocVisita): string =>
  d.nombre_original ?? d.nombre ?? d.path?.split("/").pop() ?? "Documento";

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

/**
 * Sube al bucket los documentos pendientes. Se llama al guardar la visita, no al elegir el fichero.
 * La primera carpeta debe ser el uid: la política INSERT del bucket lo exige.
 */
export async function subirDocumentos(
  docs: DocVisita[],
  userId: string,
  fecha: string,
  codCliente: string,
  onProgreso?: (hecho: number, total: number) => void,
): Promise<DocVisita[]> {
  const salida: DocVisita[] = [];
  const dia = fecha.replace(/-/g, "");
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    onProgreso?.(i, docs.length);
    if (!d.file) {
      salida.push(d);
      continue;
    }
    const nombre = nombreDoc(d);
    const ext = nombre.includes(".") ? nombre.split(".").pop() : "jpg";
    const sufijo = crypto.randomUUID().replace(/-/g, "").slice(0, 4);
    const path = `${userId}/visita_${dia}_${codCliente}_${i + 1}_${sufijo}.${ext}`;
    const { error } = await supabase.storage.from("visitas-adjuntos").upload(path, d.file, { upsert: false });
    if (error) throw new Error(`«${nombre}»: ${error.message}`);
    const { file: _file, ...resto } = d;
    salida.push({ ...resto, path });
  }
  onProgreso?.(docs.length, docs.length);
  return salida;
}

interface Props {
  documentos: DocVisita[];
  onChange: (docs: DocVisita[]) => void;
}

export function DocumentosVisita({ documentos, onChange }: Props) {
  const { data: motivos } = useMotivos();
  const motivosActivos = (motivos ?? []).filter((m) => m.is_active);

  const anadir = async (files: File[]) => {
    const nuevos: DocVisita[] = [];
    const vistos = new Set(documentos.map((d) => d.hash).filter(Boolean) as string[]);
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (vistos.has(hash)) {
        toast({ title: "Este documento ya está en la lista", description: file.name });
        continue;
      }
      vistos.add(hash);
      nuevos.push({
        file,
        nombre_original: file.name,
        tipo: file.type || "",
        tamano: file.size,
        hash,
        motivo_key: null,
      });
    }
    if (nuevos.length) onChange([...documentos, ...nuevos]);
  };

  const quitar = (i: number) => onChange(documentos.filter((_, idx) => idx !== i));

  const setMotivo = (i: number, val: string) =>
    onChange(documentos.map((d, idx) => (idx === i ? { ...d, motivo_key: val === SIN_MOTIVO ? null : val } : d)));

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Paperclip className="h-4 w-4" /> Documentos de la visita
      </div>

      {documentos.length > 0 && (
        <ul className="space-y-1">
          {documentos.map((d, i) => (
            <li key={d.hash ?? d.path ?? i} className="space-y-1 rounded-md bg-background px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{nombreDoc(d)}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => quitar(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Select value={d.motivo_key ?? SIN_MOTIVO} onValueChange={(v) => setMotivo(i, v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_MOTIVO}>Sin asignar</SelectItem>
                  {motivosActivos.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline" size="sm" className="flex-1">
          <label className="cursor-pointer">
            <Camera className="mr-2 h-4 w-4" />Hacer foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void anadir([f]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <Button asChild variant="outline" size="sm" className="flex-1">
          <label className="cursor-pointer">
            <Paperclip className="mr-2 h-4 w-4" />Adjuntar archivos
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length) void anadir(fs);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sirven para toda la visita: se suben al guardar, no antes.
      </p>
    </div>
  );
}
