import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Eye, Pencil, RotateCcw, Save, ChevronDown, AlertTriangle, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import AppSettingsCard from "@/components/AppSettingsCard";

interface SystemFunction {
  id: string;
  name: string;
  formula: string;
  description: string | null;
  updated_at: string;
}

interface Doc {
  queCalcula: string;
  pasos: string[];
  ejemplo: string[];
  nota?: string;
}

/** Explicación en lenguaje llano + ejemplo de cada cálculo del CRM. */
const DOCS: { claves: string[]; titulo: string; doc: Doc }[] = [
  {
    claves: ["proyec"],
    titulo: "Proyección de cierre de año",
    doc: {
      queCalcula:
        "Estima cómo va a cerrar el año a partir de lo vendido hasta la fecha, repartido con el mismo ritmo estacional que tuvo el año anterior. No aplica ningún porcentaje fijo de crecimiento: si vendes más que el año pasado, la proyección sube sola.",
      pasos: [
        "El año se divide en 24 quincenas (del 1 al 15 y del 16 a fin de mes), igual que la facturación de la empresa.",
        "Se toma el corte: la última quincena CERRADA con datos cargados. Si hay datos hasta el 29 de julio, el corte es la quincena 13 (hasta el 15/07), porque la segunda de julio todavía está abierta.",
        "Se suma lo vendido hasta el corte.",
        "Se mira qué porcentaje del año anterior representaron esas mismas quincenas (su peso).",
        "Proyección del ritmo anual = vendido hasta el corte ÷ peso acumulado.",
        "Cada quincena futura se estima con ese ritmo × su peso; si una quincena abierta ya tiene facturación mayor que lo estimado, se usa lo realmente facturado.",
      ],
      nota: "La proyección solo usa quincenas cerradas para no distorsionar el cálculo con una quincena a medias. El importe 'Vendido' que se muestra en pantalla sí incluye la quincena en curso, por eso cuadra siempre con la facturación total.",
      ejemplo: [
        "Vendido hasta el 15/07: 667.622 €",
        "Esas mismas quincenas pesaron el 51,3 % del año 2025",
        "Ritmo anual: 667.622 / 0,513 = 1.301.400 €",
        "Proyección de cierre ≈ 1.301.400 € (101,4 % del objetivo de 1.300.250 €)",
      ],
    },
  },
  {
    claves: ["crecimiento", "variacion", "variación"],
    titulo: "Crecimiento / variación vs año anterior",
    doc: {
      queCalcula:
        "Compara lo vendido este año con lo vendido el año pasado en el mismo periodo (YTD, del 1 de enero a la fecha de corte). Positivo = crecimiento, negativo = caída.",
      pasos: [
        "Ventas del año actual hasta la fecha de corte.",
        "Ventas del año anterior hasta esa misma fecha.",
        "Diferencia = actual − anterior.",
        "Variación % = (diferencia ÷ anterior) × 100.",
      ],
      ejemplo: [
        "Ventas 2026 hasta 29/07: 891.956 €",
        "Ventas 2025 hasta 29/07: 844.657 €",
        "Diferencia: 47.299 €",
        "Variación: (47.299 / 844.657) × 100 = +5,6 %",
      ],
    },
  },
  {
    claves: ["ticket"],
    titulo: "Ticket medio",
    doc: {
      queCalcula: "Importe medio de cada transacción (albarán o factura), no de cada línea de producto.",
      pasos: [
        "Se suma el importe facturado del periodo.",
        "Se cuentan los documentos distintos (transacciones), sin contar los abonos.",
        "Ticket medio = importe ÷ número de documentos.",
      ],
      ejemplo: [
        "Facturación: 891.956 €",
        "Transacciones: 6.553",
        "Ticket medio: 891.956 / 6.553 = 136,11 €",
      ],
    },
  },
];

const DOCS_EXTRA: { titulo: string; doc: Doc }[] = [
  {
    titulo: "Clientes activos",
    doc: {
      queCalcula:
        "Cliente activo es el que ha comprado dentro de los últimos años configurados (por defecto 3, ajustable arriba en 'Años para considerar cliente activo').",
      pasos: [
        "Se toma la última compra de cada cliente.",
        "Se compara con el 1 de enero del año de referencia menos los años configurados + 1.",
        "Si la última compra es posterior, el cliente cuenta como activo.",
      ],
      ejemplo: [
        "Año de referencia: 2026 · años configurados: 3",
        "Fecha límite: 01/01/2024",
        "Cliente con última compra 12/03/2025 → activo",
        "Cliente con última compra 08/11/2023 → inactivo",
      ],
    },
  },
  {
    titulo: "Tasa de devolución",
    doc: {
      queCalcula: "Peso de los abonos (devoluciones) sobre la facturación del año.",
      pasos: [
        "Se suma el importe de los documentos de tipo Abono.",
        "Se divide entre la facturación total del año y se multiplica por 100.",
      ],
      ejemplo: [
        "Abonos: 104.874 €",
        "Facturación: 1.000.000 €",
        "Tasa: (104.874 / 1.000.000) × 100 = 10,5 %",
      ],
    },
  },
  {
    titulo: "Ritmo necesario por quincena",
    doc: {
      queCalcula: "Cuánto hay que facturar en cada quincena que queda para alcanzar el objetivo del año.",
      pasos: [
        "Pendiente = objetivo − vendido acumulado.",
        "Quincenas restantes = 24 − quincena de corte.",
        "Ritmo = pendiente ÷ quincenas restantes.",
      ],
      ejemplo: [
        "Objetivo: 1.300.250 € · vendido: 707.042 €",
        "Pendiente: 593.208 €",
        "Quincenas restantes: 24 − 13 = 11",
        "Ritmo: 593.208 / 11 = 53.928 € por quincena",
      ],
    },
  },
  {
    titulo: "Objetivo de cartera vs rutas especiales",
    doc: {
      queCalcula:
        "Los objetivos de un comercial se separan en dos bolsas independientes: su cartera habitual y las rutas especiales asignadas este año (por ejemplo JAB2026). Las ventas de una ruta especial nunca suman al objetivo de cartera.",
      pasos: [
        "Cada cliente tiene comercial asignado y, opcionalmente, una ruta especial.",
        "Las ventas de clientes con ruta especial con objetivo propio van a ese objetivo de ruta.",
        "El resto de ventas del comercial van al objetivo de cartera.",
        "La suma de todos sus objetivos coincide con su facturación total del año.",
      ],
      ejemplo: [
        "Facturación total del comercial: 891.956 €",
        "Ruta especial JAB2026: 184.914 €",
        "Cartera: 891.956 − 184.914 = 707.042 €",
      ],
    },
  },
];

function docFor(name: string): Doc | null {
  const lower = name.toLowerCase();
  const hit = DOCS.find((d) => d.claves.some((k) => lower.includes(k)));
  return hit ? hit.doc : null;
}


function validateFormula(formula: string): { valid: boolean; suggestion?: string; warning?: string } {
  const trimmed = formula.trim();
  if (!trimmed) return { valid: false, warning: "La fórmula no puede estar vacía." };

  let depth = 0;
  for (const ch of trimmed) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) {
    if (depth > 0) return { valid: false, suggestion: trimmed + ")".repeat(depth) };
    return { valid: false, warning: "Paréntesis desbalanceados. Revisa la fórmula." };
  }

  return { valid: true };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function Explicacion({ doc }: { doc: Doc }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Qué calcula</p>
        <p className="text-sm text-muted-foreground">{doc.queCalcula}</p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Cómo se calcula</p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          {doc.pasos.map((p, i) => <li key={i}>{p}</li>)}
        </ol>
      </div>

      {doc.nota && (
        <div className="rounded-md border bg-accent/40 p-2 text-xs text-muted-foreground">
          <p className="mb-0.5 text-[11px] font-medium text-foreground">Nota importante</p>
          <p>{doc.nota}</p>
        </div>
      )}

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Ejemplo</p>
        <div className="space-y-0.5 rounded-md border bg-muted/40 p-2 text-[11px]">
          {doc.ejemplo.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </div>
    </div>
  );
}

function FunctionCard({ fn, onSave }: { fn: SystemFunction; onSave: (id: string, formula: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftFormula, setDraftFormula] = useState(fn.formula);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningMsg, setWarningMsg] = useState("");
  const [suggestionFormula, setSuggestionFormula] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const doc = docFor(fn.name);

  const handleSave = () => {
    const result = validateFormula(draftFormula);
    if (!result.valid && result.suggestion) {
      setSuggestionFormula(result.suggestion);
      setWarningMsg("La fórmula tiene paréntesis desbalanceados.");
      setWarningOpen(true);
      return;
    }
    if (!result.valid) {
      setWarningMsg(result.warning || "Fórmula inválida.");
      setSuggestionFormula(null);
      setWarningOpen(true);
      return;
    }
    setConfirmOpen(true);
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await onSave(fn.id, draftFormula);
      setEditing(false);
      setConfirmOpen(false);
      setWarningOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const resetDrafts = () => setDraftFormula(fn.formula);

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-accent/50">
              <CardTitle className="flex items-center gap-2 text-sm">
                <span className="font-mono text-primary">ƒ</span>
                <span className="truncate">{fn.name}</span>
                <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </CardTitle>
              {fn.description && <p className="text-xs text-muted-foreground">{fn.description}</p>}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Última actualización: {new Date(fn.updated_at).toLocaleDateString("es-ES")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => { setEditing(!editing); resetDrafts(); }}
                  title={editing ? "Ver" : "Editar"}
                >
                  {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {doc && <Explicacion doc={doc} />}

              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">Fórmula del sistema</p>
                {editing ? (
                  <Textarea
                    value={draftFormula}
                    onChange={(e) => setDraftFormula(e.target.value)}
                    className="min-h-[80px] bg-muted/50 font-mono text-sm"
                    placeholder="Escribe la fórmula del sistema..."
                  />
                ) : (
                  <div className="flex items-start gap-2 whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 font-mono text-sm">
                    <span className="flex-1">{fn.formula}</span>
                    <CopyButton text={fn.formula} />
                  </div>
                )}
              </div>

              {editing && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={resetDrafts}>
                    <RotateCcw className="h-3 w-3" />
                    Deshacer
                  </Button>
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSave}>
                    <Save className="h-3 w-3" />
                    Guardar
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Confirmar cambio</DialogTitle>
            <DialogDescription className="text-xs">
              Este cambio afectará al sistema y sus cálculos. ¿Desea continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={doSave} disabled={saving}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Advertencia
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line text-xs">{warningMsg}</DialogDescription>
          </DialogHeader>
          {suggestionFormula ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Corrección sugerida:</p>
              <div className="break-all rounded bg-muted/50 p-2 font-mono text-xs">{suggestionFormula}</div>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setWarningOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={() => { setDraftFormula(suggestionFormula); setWarningOpen(false); }}>
                  Usar corrección
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setWarningOpen(false)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => { setWarningOpen(false); setConfirmOpen(true); }}>
                Continuar de todos modos
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DocCard({ titulo, doc }: { titulo: string; doc: Doc }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-accent/50">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="font-mono text-primary">ƒ</span>
              <span className="truncate">{titulo}</span>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <Explicacion doc={doc} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function AdminFunctions() {
  const [functions, setFunctions] = useState<SystemFunction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFunctions();
  }, []);

  const loadFunctions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_functions")
      .select("id, name, formula, description, updated_at")
      .order("name");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setFunctions((data as SystemFunction[]) || []);
    }
    setLoading(false);
  };

  const handleSave = async (id: string, formula: string) => {
    const { error } = await supabase
      .from("system_functions")
      .update({ formula, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fórmula actualizada", description: "Los cambios se han guardado correctamente." });
    loadFunctions();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Funciones</h1>
        <p className="text-sm text-muted-foreground">
          Cómo calcula el CRM cada indicador, con un ejemplo sencillo para poder explicarlo
        </p>
      </div>

      <AppSettingsCard />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="py-6"><div className="h-4 animate-pulse rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {functions.map((fn) => (
            <FunctionCard key={fn.id} fn={fn} onSave={handleSave} />
          ))}
          {DOCS_EXTRA.map((d) => (
            <DocCard key={d.titulo} titulo={d.titulo} doc={d.doc} />
          ))}
        </div>
      )}
    </div>
  );
}
