import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  admiteIA,
  esquemaBloque,
  esquemaCampos,
  esquemaExtraccion,
  MODELO_EXTRACCION,
  sistemaExtraccion,
  usuarioExtraccion,
  VERSION_PROMPT,
  type CampoDef,
  type MotivoDef,
} from "../_shared/visita-voz-prompt.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/**
 * El prompt, el esquema y la versión viven en `./prompt.ts`, que es lo que reejecuta
 * el banco de pruebas de `scripts/bench-visita-voz/` cada vez que se toca el prompt.
 * Nota: de momento se llama por la pasarela de Lovable. La llamada directa al
 * proveedor (misma API OpenAI-compatible, cambiando base URL y clave) queda
 * documentada aquí pero NO implementada.
 */
const MODELO_TRANSCRIPCION = "openai/gpt-4o-transcribe";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });


const mensajeError = (status: number, generico: string) =>
  status === 429
    ? "Demasiadas peticiones a la IA. Espera unos segundos e inténtalo de nuevo."
    : status === 402
    ? "Se han agotado los créditos de IA del espacio de trabajo."
    : generico;

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// ---------------------------------------------------------------- catálogo



interface Catalogo {
  motivos: MotivoDef[];
  competidores: string[];
  marcasRecambio: string[];
  marcasRemolque: string[];
}

/**
 * El catálogo se cachea en memoria de la instancia: así el system prompt sale
 * idéntico carácter por carácter entre llamadas y el proveedor puede cachearlo.
 */
let cache: { valor: Catalogo; hasta: number } | null = null;
const TTL_CACHE_MS = 5 * 60 * 1000;

async function cargarCatalogo(): Promise<Catalogo> {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  const db = admin();

  const [mRes, cRes, catRes] = await Promise.all([
    db.from("motivos_visita").select("key, nombre, descripcion, sort_order, is_active").eq("is_active", true).order("sort_order"),
    db.from("motivo_campos").select("*").order("sort_order"),
    db.from("catalogos_opciones").select("clave, valor, orden").eq("is_active", true).order("orden"),
  ]);
  if (mRes.error) throw mRes.error;
  if (cRes.error) throw cRes.error;

  const catalogos: Record<string, string[]> = {};
  for (const row of (catRes.data ?? []) as { clave: string; valor: string }[]) {
    (catalogos[row.clave] ??= []).push(row.valor);
  }

  const resolver = (opciones: unknown): string[] => {
    if (Array.isArray(opciones)) return opciones.map(String).filter(Boolean);
    if (opciones && typeof opciones === "object") {
      const clave = (opciones as { catalogo?: string }).catalogo;
      if (clave) return catalogos[clave] ?? [];
    }
    return [];
  };

  const campos = ((cRes.data ?? []) as Record<string, unknown>[])
    .filter((c) => admiteIA(c as never))
    .map((c) => ({
      motivo_key: String(c.motivo_key),
      campo_key: String(c.campo_key),
      label: String(c.label),
      ayuda: (c.ayuda as string) ?? null,
      tipo: String(c.tipo),
      is_required: Boolean(c.is_required),
      requerido_validacion: Boolean(c.requerido_validacion),
      sort_order: Number(c.sort_order ?? 0),
      opciones: resolver(c.opciones),
    })) as CampoDef[];

  const motivos = ((mRes.data ?? []) as { key: string; nombre: string; descripcion: string | null }[])
    .map((m) => ({ ...m, campos: campos.filter((c) => c.motivo_key === m.key) }))
    .filter((m) => m.campos.length > 0);

  const valor: Catalogo = {
    motivos,
    competidores: catalogos["competidores"] ?? [],
    marcasRecambio: catalogos["marcas_recambio"] ?? [],
    marcasRemolque: catalogos["marcas_remolque"] ?? [],
  };
  cache = { valor, hasta: Date.now() + TTL_CACHE_MS };
  return valor;
}

// ------------------------------------------------------------------ saneado

/**
 * El modelo emite de forma intermitente escapes unicode malformados: la secuencia
 * UTF-8 de una vocal acentuada llega corrompida como carácter de control
 * (Cami\u0003n, Reparaci\u001f3n). Borrar el control sin más destruye la palabra
 * ("Camin", "Reparaci3n") y deja huérfanos los campos que validan contra catálogo,
 * así que primero se restauran las secuencias conocidas y solo lo irreconocible
 * se elimina. Cada caso se registra en el log para medir si sigue ocurriendo.
 */
const RESTAURACIONES: [RegExp, string][] = [
  // Patrón 1F <dígito>: el segundo byte de la secuencia UTF-8 sobrevive como dígito.
  [/\u001f1/g, "á"], [/\u001f9/g, "é"], [/\u001f-/g, "í"],
  [/\u001f3/g, "ó"], [/\u001f:/g, "ú"], [/\u001f1\u001f/g, "ñ"],
  // Patrón 03: el byte de continuación se pierde entero; se deduce por el contexto.
  [/([Cc])ami\u0003n/g, "$1amión"], [/([Ff])rigor\u0003fico/g, "$1rigorífico"],
  [/aci\u0003n\b/g, "ación"], [/si\u0003n\b/g, "sión"], [/ma\u0003ana/g, "mañana"],
  [/a\u0003o\b/g, "año"], [/([Cc])ami\u0003on/g, "$1amión"],
];

/** Solo lo que quede irreconocible tras las restauraciones. */
// eslint-disable-next-line no-control-regex
const CONTROL_RESIDUAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const sanear = (v: unknown, contexto = ""): string => {
  const original = String(v ?? "");
  // eslint-disable-next-line no-control-regex
  if (!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(original)) {
    return original.normalize("NFC");
  }
  let texto = original;
  for (const [patron, reemplazo] of RESTAURACIONES) texto = texto.replace(patron, reemplazo);
  const residual = texto.match(CONTROL_RESIDUAL)?.length ?? 0;
  texto = texto.replace(CONTROL_RESIDUAL, "").normalize("NFC");
  console.warn(
    `[saneado] control detectado${contexto ? ` en ${contexto}` : ""}: ` +
      `restaurado="${texto.slice(0, 120)}" residual_eliminado=${residual}`,
  );
  return texto;
};


// ------------------------------------------------------- vocabulario de audio

/** Términos del sector que el transcriptor confunde ("Icer" -> "Ize", "el polígono" -> "Alpoliva"). */
const VOCABULARIO_BASE = [
  "albarán", "referencia", "rappel", "GSMart", "Top Truck", "delegación", "polígono",
  "electromecánico", "ejes SAF", "ejes BPW", "pastillas", "discos",
  "Icer", "Febi", "Dometic", "Sachs", "TitanX", "Knorr",
  "Volvo", "Scania", "DAF", "Ford", "Eurorrecambios",
  "Schmitz", "Lecitrailer", "Leciñena", "Kögel", "Jaltest", "Texa", "Autocom", "Delphi",
  "JOST", "ROR", "Mann Filter", "Wabco", "Banner", "Axcar", "Meritor", "NRF", "IADA", "Ryme",
];

let vocabCache: { texto: string; hasta: number } | null = null;

async function vocabularioTranscripcion(): Promise<string> {
  if (vocabCache && vocabCache.hasta > Date.now()) return vocabCache.texto;
  const terminos = [...VOCABULARIO_BASE];
  try {
    const { competidores, marcasRecambio, marcasRemolque } = await cargarCatalogo();
    // Así el vocabulario se mantiene solo al dar de alta marcas nuevas en los catálogos.
    terminos.push(...competidores, ...marcasRecambio, ...marcasRemolque);
    const { data } = await admin().rpc("get_distinct_vendedores" as never);
    for (const v of (data ?? []) as { vendedor: string }[]) {
      if (v?.vendedor) terminos.push(String(v.vendedor));
    }
  } catch (e) {
    console.error("No se ha podido ampliar el vocabulario:", (e as Error).message);
  }
  const texto =
    "Nota de voz de un comercial de recambios de automoción en España. Vocabulario habitual: " +
    [...new Set(terminos)].join(", ") + ".";
  vocabCache = { texto, hasta: Date.now() + TTL_CACHE_MS };
  return texto;
}

// (El esquema y el system prompt viven en ./prompt.ts)



// ---------------------------------------------------------------- gateway

async function chatJson(key: string, sistema: string, usuario: string, nombre: string, schema: unknown) {
  const cuerpo = (conTemperatura: boolean) =>
    JSON.stringify({
      model: MODELO_EXTRACCION,
      reasoning_effort: "none",
      ...(conTemperatura ? { temperature: 0 } : {}),
      messages: [
        // El system va SIEMPRE primero e idéntico: es lo que permite el prompt caching.
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
      response_format: { type: "json_schema", json_schema: { name: nombre, strict: true, schema } },
    });

  const llamar = (conTemperatura: boolean) =>
    fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: cuerpo(conTemperatura),
    });

  let res = await llamar(true);
  if (res.status === 400) {
    // Algunos modelos rechazan temperature: con el esquema estricto la salida ya está acotada.
    const detalle = await res.text();
    console.warn(`Reintento sin temperature: ${detalle.slice(0, 300)}`);
    res = await llamar(false);
  }
  if (!res.ok) {
    const details = await res.text();
    console.error(`Extracción falló [${res.status}]: ${details}`);
    return { ok: false as const, status: res.status, details };
  }
  const body = await res.json();
  try {
    return { ok: true as const, data: JSON.parse(body.choices?.[0]?.message?.content ?? "{}") };
  } catch (_e) {
    console.error("Respuesta del modelo no es JSON válido");
    return { ok: false as const, status: 502, details: "El modelo no ha devuelto un informe válido." };
  }
}

// ---------------------------------------------------------------- acciones

async function transcribir(key: string, audio: File) {
  if (audio.size < 2048) {
    return json({ error: "La grabación está vacía. Vuelve a grabar hablando más cerca del micrófono." }, 400);
  }
  const upstream = new FormData();
  upstream.append("model", MODELO_TRANSCRIPCION);
  upstream.append("file", audio, "nota.wav");
  upstream.append("language", "es");
  upstream.append("prompt", await vocabularioTranscripcion());

  const tr = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: upstream,
  });
  if (!tr.ok) {
    const details = await tr.text();
    console.error(`Transcripción falló [${tr.status}]: ${details}`);
    return json({ error: mensajeError(tr.status, "No se ha podido transcribir el audio"), details }, tr.status);
  }
  const { text } = await tr.json();
  if (!String(text ?? "").trim()) {
    return json({ error: "No se ha detectado voz en la grabación. Inténtalo de nuevo." }, 400);
  }
  return json({ transcripcion: sanear(text, "transcripcion") });
}

interface BloqueSalida {
  motivo_key: string;
  campos: Record<string, string>;
  campos_meta: Record<string, { cita: string; confianza: string }>;
}

/** Recorta la cita a 12 palabras por si el modelo devuelve la frase entera. */
const recortarCita = (cita: string) => {
  const palabras = sanear(cita, "cita").trim().split(/\s+/).filter(Boolean);
  return palabras.length <= 12 ? palabras.join(" ") : palabras.slice(0, 12).join(" ") + "…";
};

/** Una referencia de producto de verdad lleva dígitos y no es una palabra suelta. */
const referenciaPlausible = (v: string) => v.trim().length >= 3 && /\d/.test(v);

/** Normaliza y valida el valor devuelto para un campo. Devuelve null si no vale. */
function valorValido(c: CampoDef, v: unknown): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const s = sanear(v, `campo ${c.campo_key}`).trim();
  if (s === "") return null;
  if (c.opciones.length && c.tipo === "select" && !c.opciones.includes(s)) return null;
  if (c.tipo === "referencia" && !referenciaPlausible(s)) return null;
  return s;
}

async function extraer(key: string, transcripcion: string, clienteNombre: string) {
  const { motivos } = await cargarCatalogo();
  const schema = esquemaExtraccion(motivos);

  const res = await chatJson(
    key,
    sistemaExtraccion(motivos),
    // Lo variable va SIEMPRE después del system, nunca dentro de él.
    usuarioExtraccion(transcripcion, clienteNombre),

    "informe_visita",
    schema,
  );
  if (!res.ok) {
    return json(
      { transcripcion, bloques: [], error: mensajeError(res.status, "No se ha podido analizar la nota de voz."), details: res.details },
      res.status,
    );
  }

  const salida = res.data as Record<string, unknown>;
  const bloques: BloqueSalida[] = [];

  for (const m of motivos) {
    const lista = salida[`bloques_${m.key}`];
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      const crudos = (item?.campos ?? {}) as Record<string, unknown>;
      const campos: Record<string, string> = {};
      for (const c of m.campos) {
        const v = valorValido(c, crudos[c.campo_key]);
        if (v !== null) campos[c.campo_key] = v;
      }
      if (!Object.keys(campos).length) continue; // nada real: no se instancia el bloque

      const campos_meta: BloqueSalida["campos_meta"] = {};
      for (const e of (item?.evidencias ?? []) as { campo?: string; cita?: string; confianza?: string }[]) {
        if (!e?.campo || !(e.campo in campos)) continue;
        campos_meta[e.campo] = {
          cita: recortarCita(String(e.cita ?? "")),
          confianza: ["alta", "media", "baja"].includes(String(e.confianza)) ? String(e.confianza) : "media",
        };
      }
      bloques.push({ motivo_key: m.key, campos, campos_meta });
    }
  }

  const resultado = String(salida.resultado_visita ?? "efectiva");
  return json({
    transcripcion,
    resultado_visita: ["efectiva", "cliente_ausente", "cerrado", "sin_acceso"].includes(resultado) ? resultado : "efectiva",
    bloques,
    analisis_modelo: MODELO_EXTRACCION,
    analisis_prompt_version: VERSION_PROMPT,
  });
}

/** Segunda tanda: solo los campos que faltan para que el director dé la visita por válida. */
async function repreguntar(key: string, transcripcion: string, motivoKey: string, claves: string[]) {
  const { motivos } = await cargarCatalogo();
  const motivo = motivos.find((m) => m.key === motivoKey);
  if (!motivo) return json({ error: "Motivo desconocido" }, 400);

  const campos = motivo.campos.filter((c) => claves.includes(c.campo_key));
  if (!campos.length) return json({ campos: {}, campos_meta: {} });

  const schema = {
    type: "object",
    properties: {
      campos: esquemaCampos(campos),
      evidencias: (esquemaBloque({ ...motivo, campos }) as { properties: Record<string, unknown> }).properties.evidencias,
    },
    required: ["campos", "evidencias"],
    additionalProperties: false,
  };

  const res = await chatJson(
    key,
    "Eres el asistente de un comercial de recambios. Recibes su respuesta hablada a unas preguntas concretas sobre una visita " +
      "y rellenas solo esos campos. No inventes: lo que no diga, va a null. En los campos con lista, usa siempre un valor exacto " +
      "de la lista. Por cada campo relleno añade un fragmento literal de 5 a 10 palabras que lo justifique.",
    `Motivo: ${motivo.nombre}\n\nRespuesta del comercial:\n"""\n${transcripcion}\n"""`,
    "campos_pendientes",
    schema,
  );
  if (!res.ok) {
    return json({ transcripcion, error: mensajeError(res.status, "No se ha podido analizar la respuesta."), details: res.details }, res.status);
  }

  const salida = res.data as { campos?: Record<string, unknown>; evidencias?: { campo?: string; cita?: string; confianza?: string }[] };
  const valores: Record<string, string> = {};
  for (const c of campos) {
    const v = valorValido(c, salida.campos?.[c.campo_key]);
    if (v !== null) valores[c.campo_key] = v;
  }
  const meta: Record<string, { cita: string; confianza: string }> = {};
  for (const e of salida.evidencias ?? []) {
    if (!e?.campo || !(e.campo in valores)) continue;
    meta[e.campo] = {
      cita: recortarCita(String(e.cita ?? "")),
      confianza: ["alta", "media", "baja"].includes(String(e.confianza)) ? String(e.confianza) : "media",
    };
  }
  return json({ transcripcion, campos: valores, campos_meta: meta });
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "Falta la configuración de IA" }, 500);

  // Solo usuarios autenticados: evita consumo anónimo de créditos de IA.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "No autenticado" }, 401);

  try {
    const tipo = req.headers.get("content-type") ?? "";

    // 1) Audio -> transcripción y nada más: la pantalla la pinta enseguida.
    if (tipo.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File)) return json({ error: "No se ha recibido audio" }, 400);
      return await transcribir(key, audio);
    }

    // 2) Transcripción -> bloques (o respuesta a la repregunta). Reanalizar entra por aquí:
    //    llega la transcripción ya guardada y NO se vuelve a transcribir.
    const body = await req.json();
    const transcripcion = sanear(body?.transcripcion, "transcripcion").trim();
    if (!transcripcion) return json({ error: "No hay transcripción que analizar" }, 400);

    if (body?.accion === "repreguntar") {
      return await repreguntar(key, transcripcion, String(body?.motivo_key ?? ""), (body?.campos ?? []) as string[]);
    }
    return await extraer(key, transcripcion, String(body?.cliente_nombre ?? ""));
  } catch (err) {
    console.error("visita-voz error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
