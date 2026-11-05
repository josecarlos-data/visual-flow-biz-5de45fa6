import { useMemo, useState } from "react";
import { Plus, Trash2, Save, Loader2, GripVertical, ClipboardList, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { CatalogosAdmin } from "@/components/CatalogosAdmin";
import { RevisionDatosVisitas } from "@/components/RevisionDatosVisitas";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function ConfirmarEliminar({ etiqueta, titulo, retirar, onConfirm, disabled }: {
  etiqueta: string; titulo: string; retirar: string; onConfirm: () => void; disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          <Trash2 className="mr-2 h-4 w-4" />{etiqueta}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>
            Los datos ya registrados en visitas se quedarán sin etiqueta y no se podrán interpretar bien.
            Para retirarlo sin perder información, desactiva «{retirar}».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useMotivos, useMotivosAdmin, useCatalogos, type Motivo, type MotivoCampo } from "@/hooks/useCrm";
import {
  TIPOS_CAMPO,
  TIPOS_CON_OPCIONES,
  catalogoDe,
  opcionesLiterales,
  type CatalogoMap,
} from "@/lib/motivoCampos";

const SIN_CATALOGO = "__literal__";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

function CampoRow({
  campo,
  motivoKey,
  catalogos,
}: {
  campo: MotivoCampo | null;
  motivoKey: string;
  catalogos: CatalogoMap;
}) {
  const { guardarCampo, borrarCampo } = useMotivosAdmin();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [draft, setDraft] = useState<Partial<MotivoCampo>>(
    campo ?? {
      tipo: "texto",
      is_required: false,
      requerido_validacion: false,
      is_active: true,
      visibilidad: "normal",
      sort_order: 100,
      opciones: [],
      label: "",
    },
  );
  const nuevo = !campo;
  const claveCatalogo = catalogoDe(draft.opciones);
  const clavesCatalogo = Object.keys(catalogos).sort();

  const guardar = async () => {
    if (!draft.label?.trim()) {
      toast({ title: "Falta el nombre del campo", variant: "destructive" });
      return;
    }
    try {
      await guardarCampo.mutateAsync({
        ...(campo ?? {}),
        ...draft,
        motivo_key: motivoKey,
        campo_key: draft.campo_key?.trim() || slug(draft.label),
        label: draft.label.trim(),
        opciones: draft.opciones ?? [],
      } as MotivoCampo);
      toast({ title: nuevo ? "Campo añadido" : "Campo actualizado" });
      if (nuevo)
        setDraft({
          tipo: "texto",
          is_required: false,
          requerido_validacion: false,
          is_active: true,
          visibilidad: "normal",
          sort_order: 100,
          opciones: [],
          label: "",
        });
    } catch (e) {
      toast({ title: "No se ha podido guardar", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className={`space-y-3 rounded-lg border p-3 ${draft.is_active === false ? "opacity-60" : ""}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Nombre del campo</Label>
          <Input
            value={draft.label ?? ""}
            placeholder="Ej. Respuesta del cliente"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={draft.tipo ?? "texto"} onValueChange={(v) => setDraft((d) => ({ ...d, tipo: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_CAMPO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Ayuda para el comercial y la IA</Label>
        <Textarea
          rows={2}
          value={draft.ayuda ?? ""}
          placeholder="Qué debe contar en este campo y por qué el director lo exige"
          onChange={(e) => setDraft((d) => ({ ...d, ayuda: e.target.value }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Ejemplo (placeholder)</Label>
          <Input
            value={draft.placeholder ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Orden</Label>
          <Input
            type="number"
            value={draft.sort_order ?? 100}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Visibilidad</Label>
          <Select
            value={draft.visibilidad ?? "normal"}
            onValueChange={(v) => setDraft((d) => ({ ...d, visibilidad: v }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Lo rellena el comercial</SelectItem>
              <SelectItem value="sistema">De sistema (no se muestra)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {TIPOS_CON_OPCIONES.includes(draft.tipo ?? "") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Lista cerrada (catálogo)</Label>
            <Select
              value={claveCatalogo ?? SIN_CATALOGO}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, opciones: v === SIN_CATALOGO ? [] : { catalogo: v } }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CATALOGO}>Opciones escritas a mano</SelectItem>
                {clavesCatalogo.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!claveCatalogo && (
            <div className="space-y-1.5">
              <Label className="text-xs">Opciones (separadas por comas)</Label>
              <Input
                value={opcionesLiterales(draft.opciones).join(", ")}
                placeholder="Interesado, Lo piensa, Pedido cerrado"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    opciones: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
              />
            </div>
          )}
          {claveCatalogo && (
            <p className="self-end text-xs text-muted-foreground">
              Manda el catálogo «{claveCatalogo}»: {(catalogos[claveCatalogo] ?? []).length} opciones.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(draft.is_required)}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, is_required: v }))}
            />
            Obligatorio para guardar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(draft.requerido_validacion)}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, requerido_validacion: v }))}
            />
            Necesario para validar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.is_active !== false}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
            />
            En uso
          </label>
        </div>
        <div className="flex gap-2">
          {campo && isAdmin && (
            <ConfirmarEliminar
              etiqueta="Eliminar"
              titulo="¿Eliminar este campo?"
              retirar="En uso"
              onConfirm={() => borrarCampo.mutate(campo.id)}
              disabled={borrarCampo.isPending}
            />
          )}
          <Button size="sm" onClick={guardar} disabled={guardarCampo.isPending}>
            {guardarCampo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : nuevo ? <Plus className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            {nuevo ? "Añadir campo" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MotivoEditor({
  motivo,
  catalogos,
  verRetirados,
}: {
  motivo: Motivo;
  catalogos: CatalogoMap;
  verRetirados: boolean;
}) {
  const { guardarMotivo, borrarMotivo } = useMotivosAdmin();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [nombre, setNombre] = useState(motivo.nombre);
  const [descripcion, setDescripcion] = useState(motivo.descripcion ?? "");
  const [activo, setActivo] = useState(motivo.is_active);

  const campos = motivo.campos.filter((c) => verRetirados || c.is_active !== false);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Nombre de la plantilla</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cuándo se da por válida</Label>
          <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={activo} onCheckedChange={setActivo} />
          Disponible para los comerciales
        </label>
        <div className="flex gap-2">
          {isAdmin && (
            <ConfirmarEliminar
              etiqueta="Eliminar plantilla"
              titulo="¿Eliminar esta plantilla?"
              retirar="Disponible para los comerciales"
              onConfirm={() => borrarMotivo.mutate(motivo.key)}
            />
          )}
          <Button
            size="sm"
            onClick={() =>
              guardarMotivo.mutate(
                { ...motivo, nombre, descripcion: descripcion || null, is_active: activo },
                { onSuccess: () => toast({ title: "Plantilla actualizada" }) },
              )
            }
          >
            <Save className="mr-2 h-4 w-4" />Guardar plantilla
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Campos que debe cumplimentar el comercial</p>
        {campos.map((c) => <CampoRow key={c.id} campo={c} motivoKey={motivo.key} catalogos={catalogos} />)}
        <CampoRow campo={null} motivoKey={motivo.key} catalogos={catalogos} />
      </div>
    </div>
  );
}

export default function AdminVisitas() {
  const { data: motivos, isLoading } = useMotivos();
  const { data: catalogos } = useCatalogos();
  const { guardarMotivo } = useMotivosAdmin();
  const [nuevo, setNuevo] = useState("");
  const [verRetirados, setVerRetirados] = useState(false);

  const orden = useMemo(() => [...(motivos ?? [])].sort((a, b) => a.sort_order - b.sort_order), [motivos]);

  const crear = () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    guardarMotivo.mutate(
      {
        key: slug(nombre),
        nombre,
        descripcion: null,
        color: "#64748b",
        sort_order: (orden.at(-1)?.sort_order ?? 0) + 10,
        is_active: true,
      },
      {
        onSuccess: () => {
          setNuevo("");
          toast({ title: "Plantilla creada" });
        },
        onError: (e) => toast({ title: "No se ha podido crear", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Plantillas de visita</h1>
        <p className="text-sm text-muted-foreground">
          Define qué información debe recoger el comercial en cada tipo de visita
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nueva plantilla</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[200px] flex-1"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Ej. Cobro pendiente"
          />
          <Button onClick={crear} disabled={guardarMotivo.isPending || !nuevo.trim()}>
            <Plus className="mr-2 h-4 w-4" />Crear
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={verRetirados} onCheckedChange={setVerRetirados} />
            <EyeOff className="h-4 w-4" /> Ver campos retirados
          </label>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : orden.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Todavía no hay plantillas de visita.</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {orden.map((m) => (
            <AccordionItem key={m.key} value={m.key} className="rounded-lg border px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{m.nombre}</span>
                  <Badge variant="secondary">
                    {m.campos.filter((c) => c.is_active !== false).length} campos
                  </Badge>
                  {!m.is_active && <Badge variant="outline">Inactiva</Badge>}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <MotivoEditor motivo={m} catalogos={catalogos ?? {}} verRetirados={verRetirados} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {role === "admin" && <RevisionDatosVisitas />}

      <CatalogosAdmin />
    </div>

  );
}
