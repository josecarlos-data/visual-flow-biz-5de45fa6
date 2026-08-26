import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { MotivoCampo } from "@/hooks/useCrm";
import { parseMulti, resolverOpciones, serializeMulti, type CatalogoMap } from "@/lib/motivoCampos";

interface Props {
  campo: MotivoCampo;
  valores: Record<string, string>;
  catalogos?: CatalogoMap;
  /** Trazabilidad de la propuesta de la IA para este campo. */
  meta?: { cita?: string; confianza?: string };
  onChange: (patch: Record<string, string>) => void;
}

interface ProductoSugerido {
  referencia: string;
  descripcion: string | null;
  familia: string | null;
  marca: string | null;
}

function BuscadorReferencia({ campo, valores, onChange }: Props) {
  const [texto, setTexto] = useState(valores[campo.campo_key] ?? "");
  const [sugerencias, setSugerencias] = useState<ProductoSugerido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const timer = useRef<number>();

  useEffect(() => setTexto(valores[campo.campo_key] ?? ""), [valores, campo.campo_key]);

  const buscar = (q: string) => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setBuscando(true);
      const { data, error } = await supabase.rpc("buscar_productos" as never, { _q: q.trim(), _limite: 15 } as never);
      setBuscando(false);
      if (error) return;
      setSugerencias((data ?? []) as unknown as ProductoSugerido[]);
      setAbierto(true);
    }, 250);
  };

  const elegir = (p: ProductoSugerido) => {
    setTexto(p.referencia);
    setAbierto(false);
    onChange({
      [campo.campo_key]: p.referencia,
      [`${campo.campo_key}_descripcion`]: p.descripcion ?? "",
      [`${campo.campo_key}_familia`]: p.familia ?? "",
      [`${campo.campo_key}_marca`]: p.marca ?? "",
    });
  };

  const desc = valores[`${campo.campo_key}_descripcion`];
  const marca = valores[`${campo.campo_key}_marca`];

  return (
    <div className="relative space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={texto}
          placeholder={campo.placeholder ?? "Escribe referencia o descripción"}
          onChange={(e) => {
            setTexto(e.target.value);
            onChange({ [campo.campo_key]: e.target.value });
            buscar(e.target.value);
          }}
          onFocus={() => sugerencias.length && setAbierto(true)}
        />
        {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {abierto && sugerencias.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {sugerencias.map((p) => (
            <button
              key={p.referencia}
              type="button"
              className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => elegir(p)}
            >
              <span className="font-medium">{p.referencia}</span>
              <span className="text-xs text-muted-foreground">
                {[p.descripcion, p.marca].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}

      {(desc || marca) && (
        <p className="text-xs text-muted-foreground">{[desc, marca].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  );
}

function Adjunto({ campo, valores, onChange }: Props) {
  const { user } = useAuth();
  const [subiendo, setSubiendo] = useState(false);
  const valor = valores[campo.campo_key] ?? "";
  const nombre = valores[`${campo.campo_key}_nombre`] ?? valor.split("/").pop() ?? "";

  const subir = async (file: File) => {
    if (!user) return;
    setSubiendo(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("visitas-adjuntos").upload(path, file, { upsert: false });
      if (error) throw error;
      onChange({ [campo.campo_key]: path, [`${campo.campo_key}_nombre`]: file.name });
    } catch (e) {
      toast({ title: "No se ha podido subir el archivo", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubiendo(false);
    }
  };

  if (valor) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="max-w-[70%] truncate">{nombre}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ [campo.campo_key]: "", [`${campo.campo_key}_nombre`]: "" })}
        >
          <X className="mr-1 h-4 w-4" />Quitar
        </Button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
      {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      {subiendo ? "Subiendo…" : "Hacer foto o adjuntar archivo"}
      <input
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void subir(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function MultiSelect({ campo, valores, catalogos, onChange }: Props) {
  const opciones = resolverOpciones(campo.opciones, catalogos);
  const seleccion = parseMulti(valores[campo.campo_key]);
  const alternar = (o: string) => {
    const next = seleccion.includes(o) ? seleccion.filter((x) => x !== o) : [...seleccion, o];
    onChange({ [campo.campo_key]: serializeMulti(next) });
  };
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <Badge
          key={o}
          variant={seleccion.includes(o) ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => alternar(o)}
        >
          {o}
        </Badge>
      ))}
      {opciones.length === 0 && <p className="text-xs text-muted-foreground">Sin opciones configuradas.</p>}
    </div>
  );
}

/** Renderiza un campo de plantilla de visita según su tipo. */
export function CampoVisita(props: Props) {
  const { campo, valores, catalogos, onChange } = props;
  const valor = valores[campo.campo_key] ?? "";
  const set = (v: string) => onChange({ [campo.campo_key]: v });

  const control = (() => {
    switch (campo.tipo) {
      case "numero":
        return <Input type="number" inputMode="decimal" placeholder={campo.placeholder ?? ""} value={valor} onChange={(e) => set(e.target.value)} />;
      case "fecha":
        return <Input type="date" value={valor} onChange={(e) => set(e.target.value)} />;
      case "select":
        return (
          <Select value={valor} onValueChange={set}>
            <SelectTrigger><SelectValue placeholder={campo.placeholder ?? "Selecciona una opción"} /></SelectTrigger>
            <SelectContent>
              {resolverOpciones(campo.opciones, catalogos).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multiselect":
        return <MultiSelect {...props} />;
      case "booleano":
        return (
          <div className="flex items-center gap-2">
            <Switch checked={valor === "si"} onCheckedChange={(v) => set(v ? "si" : "no")} />
            <span className="text-sm text-muted-foreground">{valor === "si" ? "Sí" : "No"}</span>
          </div>
        );
      case "referencia":
        return <BuscadorReferencia {...props} />;
      case "adjunto":
        return <Adjunto {...props} />;
      case "texto":
        return <Input placeholder={campo.placeholder ?? ""} value={valor} onChange={(e) => set(e.target.value)} />;
      default:
        return <Textarea rows={3} placeholder={campo.placeholder ?? ""} value={valor} onChange={(e) => set(e.target.value)} />;
    }
  })();

  const meta = props.meta;
  const dudoso = meta?.confianza === "baja";

  return (
    <div
      className={
        dudoso
          ? "space-y-1.5 rounded-md border border-amber-400/70 bg-amber-50/50 p-2 dark:bg-amber-500/10"
          : "space-y-1.5"
      }
    >
      <Label>
        {campo.label}
        {campo.is_required && <span className="ml-1 text-destructive">*</span>}
        {!campo.is_required && campo.requerido_validacion && (
          <Badge variant="outline" className="ml-2 text-[10px]">Necesario para validar</Badge>
        )}
        {meta?.confianza && (
          <Badge
            variant={dudoso ? "destructive" : "secondary"}
            className="ml-2 cursor-help text-[10px]"
            title={meta.cita ? `«${meta.cita}»` : "Propuesto por la IA"}
          >
            IA · {meta.confianza}
          </Badge>
        )}
      </Label>
      {control}
      {meta?.cita && dudoso && (
        <p className={`text-xs italic ${dudoso ? "text-amber-700 dark:text-amber-500" : "text-muted-foreground"}`}>
          «{meta.cita}»
        </p>
      )}
      {campo.ayuda && valor === "" && <p className="text-xs text-muted-foreground">{campo.ayuda}</p>}
    </div>
  );
}
