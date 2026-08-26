import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Save, Loader2, Wand2, FileText, Plus, Trash2, Lightbulb, AlertTriangle, Mic, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { CampoVisita } from "@/components/CampoVisita";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useClientes, useMotivos, useCatalogos, hoyISO, crearBloques, marcarPlanificadaRealizada, type Motivo, type MotivoCampo } from "@/hooks/useCrm";
import { camposVisibles, normalizarValoresNumericos } from "@/lib/motivoCampos";
import { cn } from "@/lib/utils";

type Meta = Record<string, { cita?: string; confianza?: string }>;

interface BloqueForm {
  uid: string;
  motivoKey: string;
  valores: Record<string, string>;
  meta: Meta;
}

const nuevoBloque = (motivoKey: string): BloqueForm => ({
  uid: crypto.randomUUID(),
  motivoKey,
  valores: {},
  meta: {},
});

const RESULTADOS = ["efectiva", "cliente_ausente", "cerrado", "sin_acceso"];

const ETIQUETA_RESULTADO: Record<string, string> = {
  efectiva: "Efectiva",
  cliente_ausente: "Cliente ausente",
  cerrado: "Cerrado",
  sin_acceso: "Sin acceso",
};

const ETIQUETA_TIPO: Record<string, string> = {
  cliente: "Cliente",
  ruta: "Ruta",
  llamada: "Llamada",
  agenda: "Agenda",
};

export default function NuevaVisita() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, employeeCode } = useAuth();
  const { data: clientes } = useClientes();
  const { data: motivos } = useMotivos();
  const { data: catalogos } = useCatalogos();

  const [codCliente, setCodCliente] = useState<string>(params.get("cliente") ?? "");
  const [fecha, setFecha] = useState<string>(hoyISO());
  const [resultado, setResultado] = useState<string>("efectiva");
  const [tipo, setTipo] = useState<string>("cliente");
  const [busqueda, setBusqueda] = useState("");
  const [bloques, setBloques] = useState<BloqueForm[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [transcripcion, setTranscripcion] = useState("");
  const [analisis, setAnalisis] = useState<{ modelo: string | null; version: string | null }>({ modelo: null, version: null });
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [extrayendo, setExtrayendo] = useState(false);
  const [errorExtraccion, setErrorExtraccion] = useState<string | null>(null);
  const [avisosRef, setAvisosRef] = useState<string[]>([]);
  const [repreguntaHecha, setRepreguntaHecha] = useState(false);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  /** Cliente con el que se hizo el último análisis por voz, para detectar cambios posteriores. */
  const [clienteAnalizado, setClienteAnalizado] = useState<string>("");
  const [avisoCliente, setAvisoCliente] = useState(false);
  const [saving, setSaving] = useState(false);

  const [detallesAbiertos, setDetallesAbiertos] = useState(false);
  const [chuletaAbierta, setChuletaAbierta] = useState(false);
  const [extrasAbiertos, setExtrasAbiertos] = useState(false);
  const [bloquesAbiertos, setBloquesAbiertos] = useState<string[]>([]);
  const [zonasBAbiertas, setZonasBAbiertas] = useState<Record<string, boolean>>({});

  const motivosActivos = useMemo(() => (motivos ?? []).filter((m) => m.is_active), [motivos]);
  const motivoDe = (key: string): Motivo | undefined => motivos?.find((m) => m.key === key);

  const cliente = useMemo(
    () => clientes?.find((c) => String(c.cod_cliente) === codCliente),
    [clientes, codCliente],
  );

  /**
   * El análisis se hizo con el nombre del cliente anterior en el prompt: si se cambia de
   * cliente con bloques ya extraídos por voz, se avisa. No se borra ni se bloquea nada.
   */
  const hayExtraccionVoz = transcripcion.trim() !== "" || bloques.some((b) => Object.keys(b.meta).length > 0);
  useEffect(() => {
    if (!clienteAnalizado || !codCliente) return;
    if (codCliente !== clienteAnalizado && hayExtraccionVoz) setAvisoCliente(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codCliente]);

  useEffect(() => {
    if (resultado !== "efectiva") setDetallesAbiertos(true);
  }, [resultado]);

  // Abre automáticamente los bloques que no están listos y los nuevos; respeta los ya vistos.
  useEffect(() => {
    setBloquesAbiertos((prev) => {
      const setPrev = new Set(prev);
      const abiertos = bloques
        .filter((b) => (estadoDe(b) !== "listo" || setPrev.has(b.uid)) && !setPrev.has(b.uid))
        .map((b) => b.uid);
      return abiertos.length ? [...prev, ...abiertos] : prev;
    });
    setZonasBAbiertas((prev) => {
      const next = { ...prev };
      for (const b of bloques) {
        if (!(b.uid in next)) {
          next[b.uid] = atencionDe(b).length === 0;
        }
      }
      return next;
    });
  }, [bloques]);

  const opciones = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const list = clientes ?? [];
    if (!term) return list.slice(0, 30);
    return list
      .filter((c) => c.cliente.toLowerCase().includes(term) || String(c.cod_cliente).includes(term))
      .slice(0, 30);
  }, [clientes, busqueda]);

  const actualizarBloque = (uid: string, patch: Partial<BloqueForm>) =>
    setBloques((bs) => bs.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));

  /** Solo las visitas efectivas llevan bloques; el resto son intentos fallidos. */
  const esEfectiva = resultado === "efectiva";
  const requiereGeo = tipo !== "llamada";

  const fechaLabel = fecha === hoyISO() ? "hoy" : fecha.split("-").reverse().join("/");

  // ---------------------------------------------------------------- referencias

  /**
   * Las referencias que propone la IA se contrastan contra el maestro de productos.
   * Sin coincidencia exacta el campo se deja vacío: nunca se aproxima una referencia.
   */
  const resolverReferencias = async (lista: BloqueForm[]) => {
    const avisos: string[] = [];
    for (const b of lista) {
      const motivo = motivoDe(b.motivoKey);
      if (!motivo) continue;
      for (const c of camposVisibles(motivo.campos).filter((x) => x.tipo === "referencia")) {
        const bruto = b.valores[c.campo_key]?.trim();
        if (!bruto) continue;
        const { data } = await supabase.rpc("buscar_productos" as never, { _q: bruto, _limite: 10 } as never);
        const filas = (data ?? []) as unknown as { referencia: string; descripcion: string | null; marca: string | null }[];
        const exacta = filas.find((p) => p.referencia.toLowerCase() === bruto.toLowerCase());
        if (exacta) {
          b.valores[c.campo_key] = exacta.referencia;
          b.valores[`${c.campo_key}_descripcion`] = exacta.descripcion ?? "";
          b.valores[`${c.campo_key}_marca`] = exacta.marca ?? "";
        } else {
          delete b.valores[c.campo_key];
          delete b.meta[c.campo_key];
          avisos.push(`${motivo.nombre} · ${c.label}: no existe la referencia «${bruto}», búscala a mano.`);
        }
      }
    }
    return avisos;
  };

  // ---------------------------------------------------------------- voz

  const transcribirAudio = async (blob: Blob): Promise<string | null> => {
    const form = new FormData();
    form.append("audio", blob, "nota.wav");
    const { data, error } = await supabase.functions.invoke("visita-voz", { body: form });
    if (error) throw new Error((await (error as { context?: Response }).context?.text?.()) || error.message);
    const res = data as { transcripcion?: string; error?: string };
    if (res.error) throw new Error(res.error);
    return res.transcripcion ?? null;
  };

  /**
   * Extracción a partir de una transcripción ya existente: no vuelve a transcribir,
   * así que sirve tanto para el primer análisis como para reanalizar tras cambiar de cliente.
   */
  const analizarTranscripcion = async (texto: string, cod: string, nombreCliente: string) => {
    setExtrayendo(true);
    setErrorExtraccion(null);
    setAvisosRef([]);
    try {
      const { data, error } = await supabase.functions.invoke("visita-voz", {
        body: { transcripcion: texto, cliente_nombre: nombreCliente },
      });
      if (error) throw new Error((await (error as { context?: Response }).context?.text?.()) || error.message);
      const res = data as {
        resultado_visita?: string;
        bloques?: { motivo_key: string; campos: Record<string, string>; campos_meta: Meta }[];
        analisis_modelo?: string;
        analisis_prompt_version?: string;
        error?: string;
      };
      if (res.error) throw new Error(res.error);
      setAnalisis({ modelo: res.analisis_modelo ?? null, version: res.analisis_prompt_version ?? null });

      if (res.resultado_visita && RESULTADOS.includes(res.resultado_visita)) setResultado(res.resultado_visita);

      const propuestos: BloqueForm[] = (res.bloques ?? [])
        .filter((b) => motivoDe(b.motivo_key))
        .map((b) => ({
          uid: crypto.randomUUID(),
          motivoKey: b.motivo_key,
          valores: { ...b.campos },
          meta: { ...(b.campos_meta ?? {}) },
        }));

      const avisos = await resolverReferencias(propuestos);
      setAvisosRef(avisos);
      setRepreguntaHecha(false);
      setBloques(propuestos.length ? propuestos : [nuevoBloque(motivosActivos[0]?.key ?? "")]);
      setClienteAnalizado(cod);
      setAvisoCliente(false);
      toast({
        title: propuestos.length ? `${propuestos.length} bloque(s) propuestos` : "Sin datos suficientes",
        description: propuestos.length
          ? "Revísalos y corrige lo que haga falta antes de guardar."
          : "No he identificado datos concretos: rellénalo a mano.",
      });
    } catch (e) {
      setErrorExtraccion((e as Error).message);
      if (!bloques.length) setBloques([nuevoBloque(motivosActivos[0]?.key ?? "")]);
      toast({
        title: "No se ha podido analizar la nota",
        description: "Tienes la transcripción completa; puedes rellenar la visita a mano.",
        variant: "destructive",
      });
    } finally {
      setExtrayendo(false);
    }
  };

  /** Graba una vez toda la visita: se pinta la transcripción y la extracción va por detrás. */
  const procesarVisita = async (blob: Blob) => {
    setTranscribiendo(true);
    setErrorExtraccion(null);
    setAvisosRef([]);
    let texto: string | null = null;
    try {
      texto = await transcribirAudio(blob);
    } catch (e) {
      setTranscribiendo(false);
      toast({ title: "No se ha podido transcribir", description: (e as Error).message, variant: "destructive" });
      return;
    }
    setTranscribiendo(false);
    if (!texto) return;

    // La narración ya está en pantalla; la extracción corre en paralelo.
    setTranscripcion(texto);
    await analizarTranscripcion(texto, codCliente, cliente?.cliente ?? "");
  };

  /** Segunda tanda: el comercial contesta por voz a los campos que faltan de un bloque. */
  const responderRepregunta = async (uid: string, blob: Blob) => {
    const bloque = bloques.find((b) => b.uid === uid);
    const motivo = bloque && motivoDe(bloque.motivoKey);
    if (!bloque || !motivo) return;
    setRespondiendo(uid);
    try {
      const texto = await transcribirAudio(blob);
      if (!texto) return;
      const faltan = pendientesDe(bloque).map((c) => c.campo_key);
      const { data, error } = await supabase.functions.invoke("visita-voz", {
        body: { accion: "repreguntar", transcripcion: texto, motivo_key: bloque.motivoKey, campos: faltan },
      });
      if (error) throw new Error((await (error as { context?: Response }).context?.text?.()) || error.message);
      const res = data as { campos?: Record<string, string>; campos_meta?: Meta; error?: string };
      if (res.error) throw new Error(res.error);

      const siguiente: BloqueForm = {
        ...bloque,
        valores: { ...bloque.valores, ...(res.campos ?? {}) },
        meta: { ...bloque.meta, ...(res.campos_meta ?? {}) },
      };
      const avisos = await resolverReferencias([siguiente]);
      setAvisosRef((a) => [...a, ...avisos]);
      actualizarBloque(uid, { valores: siguiente.valores, meta: siguiente.meta });
      setTranscripcion((t) => `${t}\n\n[Respuesta a los datos que faltaban]\n${texto}`);
    } catch (e) {
      toast({ title: "No se ha podido usar la respuesta", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRespondiendo(null);
      setRepreguntaHecha(true);
    }
  };

  // ---------------------------------------------------------------- validación

  /** Campos que el director exige para dar el bloque por válido y siguen vacíos. */
  const pendientesDe = (b: BloqueForm): MotivoCampo[] => {
    const motivo = motivoDe(b.motivoKey);
    if (!motivo) return [];
    return camposVisibles(motivo.campos).filter((c) => c.requerido_validacion && !b.valores[c.campo_key]?.trim());
  };

  /** Campos obligatorios del bloque que siguen vacíos (guardar los bloquea). */
  const bloqueantesDe = (b: BloqueForm): MotivoCampo[] => {
    const motivo = motivoDe(b.motivoKey);
    if (!motivo) return [];
    return camposVisibles(motivo.campos).filter((c) => c.is_required && !b.valores[c.campo_key]?.trim());
  };

  const hayConfianzaBaja = (b: BloqueForm): boolean => {
    const motivo = motivoDe(b.motivoKey);
    if (!motivo) return false;
    return camposVisibles(motivo.campos).some((c) => b.meta[c.campo_key]?.confianza === "baja");
  };

  const atencionDe = (b: BloqueForm): MotivoCampo[] => {
    const motivo = motivoDe(b.motivoKey);
    if (!motivo) return [];
    const bloqueantes = new Set(bloqueantesDe(b).map((c) => c.campo_key));
    const pendientes = new Set(pendientesDe(b).map((c) => c.campo_key));
    return camposVisibles(motivo.campos).filter(
      (c) => bloqueantes.has(c.campo_key) || pendientes.has(c.campo_key) || b.meta[c.campo_key]?.confianza === "baja",
    );
  };

  const otrosCamposDe = (b: BloqueForm): MotivoCampo[] => {
    const motivo = motivoDe(b.motivoKey);
    if (!motivo) return [];
    const atencion = new Set(atencionDe(b).map((c) => c.campo_key));
    return camposVisibles(motivo.campos).filter((c) => !atencion.has(c.campo_key));
  };

  const estadoDe = (b: BloqueForm): "listo" | "faltan" | "revisar" => {
    if (bloqueantesDe(b).length > 0 || pendientesDe(b).length > 0) return "faltan";
    if (hayConfianzaBaja(b)) return "revisar";
    return "listo";
  };

  const hayPendientes = esEfectiva && bloques.some((b) => pendientesDe(b).length > 0);
  const mostrarRepregunta = hayPendientes && !repreguntaHecha && (transcripcion !== "" || bloques.some((b) => Object.keys(b.valores).length));

  // ---------------------------------------------------------------- guardado

  const obtenerPosicion = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      const timer = setTimeout(() => resolve(null), 6000);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 6000 },
      );
    });

  const guardar = async () => {
    if (!codCliente) {
      toast({ title: "Faltan datos", description: "Selecciona un cliente.", variant: "destructive" });
      return;
    }
    if (esEfectiva && !bloques.length) {
      toast({ title: "Faltan datos", description: "Añade al menos un bloque a la visita.", variant: "destructive" });
      return;
    }
    if (esEfectiva) {
      const faltan: string[] = [];
      for (const b of bloques) {
        const m = motivoDe(b.motivoKey);
        if (!m) {
          toast({ title: "Faltan datos", description: "Selecciona el motivo de cada bloque.", variant: "destructive" });
          return;
        }
        for (const c of camposVisibles(m.campos))
          if (c.is_required && !b.valores[c.campo_key]?.trim()) faltan.push(`${m.nombre}: ${c.label}`);
      }
      if (faltan.length) {
        toast({ title: "Campos obligatorios sin rellenar", description: faltan.join(", "), variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    const pos = await obtenerPosicion();
    if (!pos && requiereGeo) {
      toast({
        title: "Sin ubicación",
        description: "No se ha podido obtener el GPS. La visita se guarda marcada como sin geolocalización.",
      });
    }

    const { data: creada, error } = await supabase
      .from("visitas")
      .insert({
        cod_cliente: Number(codCliente),
        // legacy: se conserva el primer motivo para las vistas antiguas
        motivo_key: esEfectiva ? bloques[0]?.motivoKey ?? null : null,
        fecha,
        tipo,
        resultado_visita: resultado,
        user_id: user?.id ?? null,
        vendedor: employeeCode ?? null,
        transcripcion: transcripcion || null,
        observaciones: observaciones || null,
        campos: {},
        estado: "registrada",
        origen: "app",
        latitud: pos?.lat ?? null,
        longitud: pos?.lng ?? null,
        analisis_modelo: analisis.modelo,
        analisis_prompt_version: analisis.version,
      } as never)
      .select("id")
      .single();

    if (error || !creada) {
      setSaving(false);
      toast({ title: "No se ha podido guardar", description: error?.message ?? "Error desconocido", variant: "destructive" });
      return;
    }

    try {
      if (esEfectiva) {
        await crearBloques(
          (creada as { id: string }).id,
          bloques.map((b) => ({
            motivo_key: b.motivoKey,
            // Los números se guardan como número: "0000", "00" o "0,00" quedan en 0.
            campos: normalizarValoresNumericos(motivoDe(b.motivoKey)?.campos ?? [], b.valores),
            campos_meta: b.meta,
            completo: pendientesDe(b).length === 0,
          })),
        );
      }
    } catch (e) {
      setSaving(false);
      toast({ title: "Visita guardada sin bloques", description: (e as Error).message, variant: "destructive" });
      return;
    }

    setSaving(false);

    if (pos) {
      await supabase.rpc("registrar_geo_cliente" as never, {
        _cod: Number(codCliente),
        _lat: pos.lat,
        _lng: pos.lng,
      } as never);
    }

    // Si el cliente estaba planificado hoy en la agenda, marcamos la parada como realizada.
    // Es un extra: cualquier fallo aquí nunca debe afectar al guardado de la visita.
    let agendaMarcada = false;
    try {
      if (user?.id) {
        agendaMarcada = await marcarPlanificadaRealizada(user.id, Number(codCliente), fecha, (creada as { id: string }).id);
      }
    } catch (e) {
      console.error("No se ha podido actualizar la agenda:", e);
    }

    toast({
      title: "Visita guardada",
      description: agendaMarcada ? "Marcada como realizada en tu agenda." : undefined,
    });
    const volverRaw = params.get("volver");
    const volver = volverRaw && volverRaw.startsWith("/") && !volverRaw.startsWith("//") ? volverRaw : `/clientes/${codCliente}`;
    navigate(volver);
  };

  return (
    <div className="space-y-3 pb-24">
      <Link to="/visitas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Visitas
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registrar visita</h1>
        <p className="text-sm text-muted-foreground">Cuéntala y la IA la reparte en bloques</p>
      </div>

      {/* Selector de cliente directamente en la cabecera */}
      {cliente ? (
        <div className="flex items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{cliente.cliente}</p>
            <p className="text-xs text-muted-foreground">#{cliente.cod_cliente} · {cliente.localidad ?? "—"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setCodCliente(""); setBusqueda(""); }}>
            Cambiar
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente por nombre o código…"
          />
          <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-1">
            {opciones.map((c) => (
              <button
                key={c.cod_cliente}
                type="button"
                onClick={() => setCodCliente(String(c.cod_cliente))}
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{c.cliente}</span>
                <span className="ml-2 text-xs text-muted-foreground">#{c.cod_cliente}</span>
              </button>
            ))}
            {opciones.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>
            )}
          </div>
        </div>
      )}

      {/* Resumen plegado de tipo, resultado y fecha */}
      <Collapsible open={detallesAbiertos} onOpenChange={setDetallesAbiertos}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm text-muted-foreground"
          >
            <span>
              {ETIQUETA_TIPO[tipo] ?? tipo} · {ETIQUETA_RESULTADO[resultado] ?? resultado} · {fechaLabel}
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", detallesAbiertos && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="ruta">Ruta</SelectItem>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="agenda">Agenda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Resultado</Label>
              <Select value={resultado} onValueChange={setResultado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectiva">Efectiva</SelectItem>
                  <SelectItem value="cliente_ausente">Cliente ausente</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                  <SelectItem value="sin_acceso">Sin acceso</SelectItem>
                </SelectContent>
              </Select>
              {!esEfectiva && (
                <p className="text-xs text-muted-foreground">
                  La visita se registra sin bloques; solo con tus observaciones.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {avisoCliente && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/70 bg-amber-50/60 p-3 text-sm dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-2">
            <p>
              Has cambiado de cliente después de analizar la nota. Los bloques actuales se generaron con el cliente
              anterior en el contexto del análisis.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={extrayendo || !transcripcion.trim()}
                onClick={() => analizarTranscripcion(transcripcion, codCliente, cliente?.cliente ?? "")}
              >
                {extrayendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                Volver a analizar con este cliente
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClienteAnalizado(codCliente);
                  setAvisoCliente(false);
                }}
              >
                Mantener los bloques
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              No hace falta regrabar: se reutiliza la transcripción que ya tienes.
            </p>
          </div>
        </div>
      )}

      {/* Micrófono: elemento principal, sin Card */}
      {esEfectiva && (
        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <VoiceRecorder
              onAudio={(blob) => procesarVisita(blob)}
              disabled={!codCliente || transcribiendo || extrayendo}
              processing={transcribiendo}
              hasResult={transcripcion !== ""}
            />
          </div>

          {transcripcion && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" /> Lo que he entendido
                {extrayendo && (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> rellenando campos…
                  </Badge>
                )}
              </div>
              <Textarea
                rows={6}
                value={transcripcion}
                onChange={(e) => setTranscripcion(e.target.value)}
                className="bg-background text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Léela mientras se preparan los bloques. Puedes corregirla: se guarda con la visita.
              </p>
            </div>
          )}

          {errorExtraccion && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="space-y-2">
                <p>No se han podido preparar los bloques ({errorExtraccion}). La transcripción está guardada; rellena la visita a mano.</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={extrayendo}
                  onClick={async () => {
                    setExtrayendo(true);
                    setErrorExtraccion(null);
                    try {
                      const { data, error } = await supabase.functions.invoke("visita-voz", {
                        body: { transcripcion, cliente_nombre: cliente?.cliente ?? "" },
                      });
                      if (error) throw new Error(error.message);
                      const res = data as { bloques?: { motivo_key: string; campos: Record<string, string>; campos_meta: Meta }[]; error?: string };
                      if (res.error) throw new Error(res.error);
                      const propuestos: BloqueForm[] = (res.bloques ?? [])
                        .filter((b) => motivoDe(b.motivo_key))
                        .map((b) => ({ uid: crypto.randomUUID(), motivoKey: b.motivo_key, valores: { ...b.campos }, meta: { ...(b.campos_meta ?? {}) } }));
                      setAvisosRef(await resolverReferencias(propuestos));
                      if (propuestos.length) setBloques(propuestos);
                    } catch (e) {
                      setErrorExtraccion((e as Error).message);
                    } finally {
                      setExtrayendo(false);
                    }
                  }}
                >
                  Reintentar el análisis
                </Button>
              </div>
            </div>
          )}

          {avisosRef.length > 0 && (
            <div className="rounded-md border border-amber-400/70 bg-amber-50/60 p-3 text-sm dark:bg-amber-500/10">
              <p className="mb-1 font-medium">Referencias sin confirmar</p>
              <ul className="list-disc pl-5 text-xs">
                {avisosRef.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {/* Chuleta: botón que abre Sheet inferior */}
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setChuletaAbierta(true)}>
              <Lightbulb className="mr-1 h-4 w-4 text-primary" /> Qué pide el director
            </Button>
          </div>

          <Sheet open={chuletaAbierta} onOpenChange={setChuletaAbierta}>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>Qué pide el director</SheetTitle>
              </SheetHeader>
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pt-2">
                <p className="text-xs text-muted-foreground">
                  No hace falta elegir motivo: cuenta la visita y la IA lo reparte. Esto es solo un recordatorio de lo que
                  el director exige en cada tipo de asunto.
                </p>
                <Accordion type="single" collapsible className="w-full">
                  {motivosActivos.map((m) => {
                    const clave = camposVisibles(m.campos).filter((c) => c.requerido_validacion).map((c) => c.label);
                    return (
                      <AccordionItem key={m.key} value={m.key}>
                        <AccordionTrigger>{m.nombre}</AccordionTrigger>
                        <AccordionContent>
                          {m.descripcion && <p className="text-sm text-muted-foreground">{m.descripcion}</p>}
                          {clave.length > 0 && (
                            <p className="mt-2 text-xs">
                              <span className="text-muted-foreground">Imprescindible: </span>
                              {clave.join(" · ")}
                            </p>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {esEfectiva && bloques.map((b, i) => {
        const motivo = motivoDe(b.motivoKey);
        const hayResultado = Object.keys(b.valores).length > 0;
        const faltan = pendientesDe(b);
        return (
          <Card key={b.uid}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                Bloque {i + 1}
                {hayResultado && <Badge variant="secondary" className="gap-1"><Wand2 className="h-3 w-3" />Propuesta IA</Badge>}
              </CardTitle>
              {bloques.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar bloque ${i + 1}`}
                  onClick={() => setBloques((bs) => bs.filter((x) => x.uid !== b.uid))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select
                  value={b.motivoKey}
                  onValueChange={(val) => actualizarBloque(b.uid, { motivoKey: val, valores: {}, meta: {} })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona motivo" /></SelectTrigger>
                  <SelectContent>
                    {motivosActivos.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {motivo?.descripcion && <p className="text-xs text-muted-foreground">{motivo.descripcion}</p>}
              </div>

              {camposVisibles(motivo?.campos ?? []).map((c) => (
                <CampoVisita
                  key={c.campo_key}
                  campo={c}
                  valores={b.valores}
                  meta={b.meta[c.campo_key]}
                  catalogos={catalogos}
                  onChange={(patch) => actualizarBloque(b.uid, { valores: { ...b.valores, ...patch } })}
                />
              ))}

              {faltan.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Se puede guardar, pero para que el director la dé por válida faltan: {faltan.map((c) => c.label).join(", ")}.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Repregunta: una sola tanda por los campos que el director exige */}
      {mostrarRepregunta && (
        <Card className="border-amber-400/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Falta un par de datos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Contéstalos ahora — por voz o escribiéndolos arriba — y el director no tendrá que reclamártelos.
              Si lo dejas, la visita se guarda igual marcada como incompleta.
            </p>
            {bloques.map((b, i) => {
              const faltan = pendientesDe(b);
              if (!faltan.length) return null;
              const motivo = motivoDe(b.motivoKey);
              return (
                <div key={b.uid} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Bloque {i + 1} · {motivo?.nombre}</p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {faltan.map((c) => <li key={c.campo_key}>{c.label}{c.ayuda ? ` — ${c.ayuda}` : ""}</li>)}
                  </ul>
                  {respondiendo === b.uid ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Procesando tu respuesta…
                    </div>
                  ) : (
                    <VoiceRecorder
                      onAudio={(blob) => responderRepregunta(b.uid, blob)}
                      disabled={respondiendo !== null}
                    />
                  )}
                </div>
              );
            })}
            <Button variant="outline" className="w-full" onClick={() => setRepreguntaHecha(true)}>
              <Mic className="mr-2 h-4 w-4" /> Ahora no, guardar así
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cuando no hay bloques efectivos, dar salida manual visible siempre */}
      {esEfectiva && bloques.length === 0 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setBloques((bs) => [...bs, nuevoBloque(motivosActivos[0]?.key ?? "")])}
          disabled={!motivosActivos.length}
        >
          <Plus className="mr-2 h-4 w-4" /> Añadir bloque a mano
        </Button>
      )}

      {/* Con bloques efectivos, extras ocultos tras el toggle */}
      {esEfectiva && bloques.length >= 1 && (
        extrasAbiertos ? (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setBloques((bs) => [...bs, nuevoBloque(motivosActivos[0]?.key ?? "")])}
              disabled={!motivosActivos.length}
            >
              <Plus className="mr-2 h-4 w-4" /> Añadir otro bloque
            </Button>
            <div className="space-y-2">
              <Label className="text-sm">Observaciones</Label>
              <Textarea
                rows={3}
                placeholder="Observaciones adicionales de la visita…"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => setExtrasAbiertos(true)}>
            <Plus className="mr-2 h-4 w-4" /> Añadir detalle
          </Button>
        )
      )}

      {/* Visitas no efectivas: textarea siempre visible */}
      {!esEfectiva && (
        <div className="space-y-2">
          <Label className="text-sm">Observaciones</Label>
          <Textarea
            rows={3}
            placeholder="¿Qué ha pasado? (cliente ausente, taller cerrado…)"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button className="flex-1" onClick={guardar} disabled={saving || !codCliente || (esEfectiva && !bloques.length)}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar visita
          </Button>
        </div>
      </div>
    </div>
  );
}
