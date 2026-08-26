import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Pencil, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  useCatalogos, useClientePerfil, useClientePerfilHistorico, usePerfilAtributos, usePerfilMutations,
  type PerfilAtributo, type PerfilHecho,
} from "@/hooks/useCrm";
import { parseMulti, resolverOpciones, serializeMulti } from "@/lib/motivoCampos";

const diaMes = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Diálogo de alta o cambio de valor: siempre genera un hecho nuevo. */
function EditorValor({
  atributo, hecho, cod, onClose,
}: {
  atributo: PerfilAtributo;
  hecho: PerfilHecho | undefined;
  cod: number;
  onClose: () => void;
}) {
  const { data: catalogos } = useCatalogos();
  const { guardarValor } = usePerfilMutations(cod);
  const opciones = useMemo(() => resolverOpciones(atributo.opciones, catalogos), [atributo.opciones, catalogos]);
  const [valor, setValor] = useState(hecho?.valor_texto ?? "");
  const [multi, setMulti] = useState<string[]>(parseMulti(hecho?.valor_texto));

  const guardar = () => {
    const texto = atributo.tipo === "multiselect" ? serializeMulti(multi) : valor.trim();
    if (!texto) {
      toast({ title: "Escribe un valor", variant: "destructive" });
      return;
    }
    const numero = atributo.tipo === "numero" ? Number(texto.replace(",", ".")) : NaN;
    if (atributo.tipo === "numero" && !Number.isFinite(numero)) {
      toast({ title: "El valor debe ser un número", variant: "destructive" });
      return;
    }
    guardarValor.mutate(
      {
        cod_cliente: cod,
        atributo_key: atributo.key,
        valor_texto: texto,
        valor_num: Number.isFinite(numero) ? numero : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Dato registrado" });
          onClose();
        },
        onError: (e) =>
          toast({ title: "No se ha podido guardar", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{atributo.nombre}</DialogTitle>
          <DialogDescription>
            {atributo.descripcion ?? "Se guarda como un dato nuevo; el anterior queda en el histórico."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">Valor{atributo.unidad ? ` (${atributo.unidad})` : ""}</Label>

          {atributo.tipo === "select" ? (
            <Select value={valor} onValueChange={setValor}>
              <SelectTrigger><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
              <SelectContent>
                {opciones.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : atributo.tipo === "multiselect" ? (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
              {opciones.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={multi.includes(o)}
                    onCheckedChange={(v) =>
                      setMulti((prev) => (v ? [...prev, o] : prev.filter((x) => x !== o)))
                    }
                  />
                  {o}
                </label>
              ))}
              {opciones.length === 0 && <p className="text-sm text-muted-foreground">Sin opciones en el catálogo.</p>}
            </div>
          ) : (
            <Input
              type={atributo.tipo === "numero" ? "number" : "text"}
              inputMode={atributo.tipo === "numero" ? "decimal" : undefined}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardarValor.isPending}>
            {guardarValor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaAtributo({
  atributo, hecho, cod, onEditar, valorAnterior,
}: {
  atributo: PerfilAtributo;
  hecho: PerfilHecho | undefined;
  cod: number;
  onEditar: () => void;
  valorAnterior?: string;
}) {
  const { confirmar } = usePerfilMutations(cod);
  const sinConfirmar = hecho?.estado === "sin_confirmar";

  const trazabilidad = useMemo(() => {
    if (!hecho) return "nunca observado";
    const partes: string[] = [`visto el ${diaMes(hecho.observado_en)}`];
    if (hecho.comercial_nombre) partes.push(`por ${hecho.comercial_nombre}`);
    if (valorAnterior) partes.push(`antes ${valorAnterior}`);
    return partes.join(" · ");
  }, [hecho, valorAnterior]);

  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{atributo.nombre}</p>
        <p className="text-xs text-muted-foreground">{trazabilidad}</p>
      </div>

      <div className="flex w-full items-start gap-2 sm:w-auto sm:justify-end">
        {hecho ? (
          <>
            <span
              className={`min-w-0 flex-1 break-words text-sm sm:flex-none sm:text-right ${
                sinConfirmar ? "text-muted-foreground" : "font-medium text-foreground"
              }`}
            >
              {hecho.valor_texto}
              {atributo.unidad ? ` ${atributo.unidad}` : ""}
            </span>
            {sinConfirmar && (
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="whitespace-nowrap">sin confirmar</Badge>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  title="Confirmar dato"
                  disabled={confirmar.isPending}
                  onClick={() =>
                    confirmar.mutate(hecho.id, {
                      onSuccess: () => toast({ title: "Dato confirmado" }),
                      onError: (e) =>
                        toast({ title: "No se ha podido confirmar", description: (e as Error).message, variant: "destructive" }),
                    })
                  }
                >
                  {confirmar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Cambiar valor" onClick={onEditar}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onEditar}>
            <Plus className="mr-1 h-4 w-4" /> Añadir
          </Button>
        )}
      </div>
    </div>
  );
}

/** Perfil comercial del cliente: valor vigente de cada atributo del catálogo. */
export function ClientePerfilTab({ cod }: { cod: number }) {
  const { data: atributos, isLoading } = usePerfilAtributos();
  const { data: hechos } = useClientePerfil(cod);
  const { data: historico } = useClientePerfilHistorico(cod);
  const [editando, setEditando] = useState<string | null>(null);

  const porAtributo = useMemo(() => {
    const map = new Map<string, PerfilHecho>();
    for (const h of hechos ?? []) map.set(h.atributo_key, h);
    return map;
  }, [hechos]);

  const valorAnteriorPorAtributo = useMemo(() => {
    const vistos = new Map<string, number>();
    const anteriores = new Map<string, string>();
    for (const h of historico ?? []) {
      const count = vistos.get(h.atributo_key) ?? 0;
      if (count === 1) anteriores.set(h.atributo_key, h.valor_texto);
      vistos.set(h.atributo_key, count + 1);
    }
    return anteriores;
  }, [historico]);

  const grupos = useMemo(() => {
    const map = new Map<string, PerfilAtributo[]>();
    for (const a of atributos ?? []) {
      const arr = map.get(a.grupo) ?? [];
      arr.push(a);
      map.set(a.grupo, arr);
    }
    return [...map.entries()];
  }, [atributos]);

  const sinConfirmar = (hechos ?? []).filter((h) => h.estado === "sin_confirmar").length;
  const atributoEditando = (atributos ?? []).find((a) => a.key === editando);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {sinConfirmar > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{sinConfirmar} {sinConfirmar === 1 ? "dato sin confirmar" : "datos sin confirmar"}</span>
        </div>
      )}

      {grupos.map(([grupo, items]) => (
        <Card key={grupo}>
          <CardHeader className="pb-2"><CardTitle className="text-base capitalize">{grupo}</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {items.map((a) => (
              <FilaAtributo
                key={a.key}
                atributo={a}
                hecho={porAtributo.get(a.key)}
                cod={cod}
                onEditar={() => setEditando(a.key)}
                valorAnterior={valorAnteriorPorAtributo.get(a.key)}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {atributoEditando && (
        <EditorValor
          atributo={atributoEditando}
          hecho={porAtributo.get(atributoEditando.key)}
          cod={cod}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
