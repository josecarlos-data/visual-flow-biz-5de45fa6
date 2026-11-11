import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import { MODELO_INSIGHTS_POR_DEFECTO, MODELOS_INSIGHTS } from "../_shared/modelosInsights.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Lista única compartida con la ficha de cliente (comparador). */
const MODELOS_PERMITIDOS: readonly string[] = MODELOS_INSIGHTS;
const MODELO_POR_DEFECTO = MODELO_INSIGHTS_POR_DEFECTO;

/** Marcadores de basura que a veces cuelan los modelos al final del texto. */
const MARCADORES = ["<|endoftext|>", "#+#+", "billing:", "COST:", "[PLUGIN]", "TOKEN ", "END asr"];

/** Corta la cola de basura, quita controles no imprimibles y normaliza espacios. */
function limpiar(texto: string): string {
  let s = String(texto ?? "");
  for (const m of MARCADORES) {
    const i = s.indexOf(m);
    if (i >= 0) s = s.slice(0, i);
  }
  // deno-lint-ignore no-control-regex
  s = s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "");
  s = s.replace(/[^\S\n]{2,}/g, " ").trim();
  return s.length < 3 ? "" : s;
}

const SCHEMA = {
  type: "object",
  properties: {
    resumen: {
      type: "string",
      description: "Resumen ejecutivo del cliente en 3-4 frases: situación comercial, tendencia y punto clave a vigilar.",
    },
    alertas: {
      type: "array",
      description: "Máximo 3 riesgos o señales negativas detectadas, cada una en una frase.",
      items: { type: "string" },
    },
    oportunidades: {
      type: "array",
      description: "Máximo 3 oportunidades concretas de venta, con producto o familia si es posible.",
      items: { type: "string" },
    },
    argumentario: {
      type: "array",
      description: "Máximo 3 argumentos concretos que el comercial puede usar en la próxima visita.",
      items: { type: "string" },
    },
  },
  required: ["resumen", "alertas", "oportunidades", "argumentario"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "Falta la configuración de IA" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { cod_cliente, modelo } = await req.json();
    if (!cod_cliente) {
      return new Response(JSON.stringify({ error: "Falta el código de cliente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo prueba: si viene "modelo", se usa ese y NO se guarda el informe.
    if (modelo !== undefined && !MODELOS_PERMITIDOS.includes(modelo)) {
      return new Response(
        JSON.stringify({ error: `Modelo no permitido. Opciones: ${MODELOS_PERMITIDOS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const esPrueba = modelo !== undefined;
    const modeloUsado = esPrueba ? (modelo as string) : MODELO_POR_DEFECTO;


    // Cliente con el JWT del usuario: las RLS garantizan que solo ve los suyos
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

// Fechas locales (no UTC) para los rangos de producto
    const isoLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hoyLocal = new Date();
    const hoyIso = isoLocal(hoyLocal);
    const mesesAtras = (n: number) => {
      const d = new Date(hoyLocal.getFullYear(), hoyLocal.getMonth() - n, hoyLocal.getDate());
      return d;
    };
    const desde12 = mesesAtras(12);
    const desde24 = mesesAtras(24);
    const hastaPrev = new Date(desde12.getFullYear(), desde12.getMonth(), desde12.getDate() - 1);

    const [clienteRes, ventasRes, productosRes, visitasRes, kpisRes, perfilRes, atributosRes, camposRes, motivosRes, situacionesRes] =
      await Promise.all([
      userClient.from("clientes").select("*").eq("cod_cliente", cod_cliente).maybeSingle(),
      userClient.from("resumen_cliente_mes").select("anio, mes, importe").eq("cod_cliente", cod_cliente),
      userClient.rpc("cliente_top_productos", {
        _cod: cod_cliente,
        _desde: isoLocal(desde12),
        _hasta: hoyIso,
        _desde_prev: isoLocal(desde24),
        _hasta_prev: isoLocal(hastaPrev),
      }),
      userClient.from("visitas").select("id, fecha, tipo, origen, user_id, resultado_visita, comercial_nombre, motivo_key, campos, observaciones, observaciones_original").eq("cod_cliente", cod_cliente).order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(LIMITE_FILAS_VISITAS),
      userClient.from("cliente_kpis").select("*").eq("cod_cliente", cod_cliente).maybeSingle(),
      userClient.from("v_cliente_perfil_vigente")
        .select("atributo_key, valor_texto, valor_num, observado_en, bloque_id, estado")
        .eq("cod_cliente", cod_cliente),
      userClient.from("perfil_atributos").select("key, nombre, unidad"),
      userClient.from("motivo_campos").select("motivo_key, campo_key, label, perfil_atributo_key"),
      userClient.from("motivos_visita").select("key, nombre"),
      userClient.from("situaciones_cliente")
        .select("etiqueta, activo, desde, hasta")
        .eq("cod_cliente", cod_cliente)
        .order("updated_at", { ascending: false }),
    ]);

    if (!clienteRes.data) {
      return new Response(JSON.stringify({ error: "Cliente no encontrado o sin acceso" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const porAnio: Record<number, number> = {};
    for (const v of ventasRes.data ?? []) {
      porAnio[v.anio] = (porAnio[v.anio] ?? 0) + Number(v.importe ?? 0);
    }
    const kpis = kpisRes.data;

    // Etiquetas legibles de los catálogos
    const etiquetaAtributo = new Map<string, string>();
    const unidadAtributo = new Map<string, string>();
    for (const a of atributosRes.data ?? []) {
      etiquetaAtributo.set(a.key as string, (a.nombre as string) ?? (a.key as string));
      if (a.unidad) unidadAtributo.set(a.key as string, a.unidad as string);
    }
    // Etiqueta por motivo + campo: el mismo campo puede llamarse distinto en cada plantilla.
    const etiquetaCampo = new Map<string, string>();
    const atributoDeCampo = new Map<string, string>();
    for (const c of camposRes.data ?? []) {
      etiquetaCampo.set(`${c.motivo_key}|${c.campo_key}`, (c.label as string) ?? (c.campo_key as string));
      if (c.perfil_atributo_key) atributoDeCampo.set(`${c.motivo_key}|${c.campo_key}`, c.perfil_atributo_key as string);
    }
    // Atributos del perfil cuyo valor vigente sale de cada bloque: no se repiten en ÚLTIMAS VISITAS.
    const vigentePorBloque = new Set<string>();
    for (const p of perfilRes.data ?? []) {
      if (p.bloque_id) vigentePorBloque.add(`${p.bloque_id}|${p.atributo_key}`);
    }
    const nombreMotivo = new Map<string, string>();
    for (const m of motivosRes.data ?? []) nombreMotivo.set(m.key as string, (m.nombre as string) ?? (m.key as string));

    // Bloques de esas visitas, con la sesión del usuario: solo los que puede ver.
    const visitas = visitasRes.data ?? [];
    const idsVisitas = visitas.map((v) => v.id as string);
    const bloquesRes = idsVisitas.length
      ? await userClient.from("visita_bloques")
        .select("id, visita_id, motivo_key, campos, validacion, orden")
        .in("visita_id", idsVisitas)
        .order("orden", { ascending: true })
      : { data: [] as Record<string, unknown>[] };
    const bloquesPorVisita = new Map<string, Record<string, unknown>[]>();
    for (const b of (bloquesRes.data ?? []) as Record<string, unknown>[]) {
      if (b.validacion === "NO CORRECTO") continue;
      const lista = bloquesPorVisita.get(b.visita_id as string) ?? [];
      lista.push(b);
      bloquesPorVisita.set(b.visita_id as string, lista);
    }
    const seccionVisitas = formatearVisitas(visitas, bloquesPorVisita, etiquetaCampo, nombreMotivo, {
      atributoDeCampo,
      vigentePorBloque,
      limiteFilas: LIMITE_FILAS_VISITAS,
    });

    // Situación vigente: mismo criterio que la cabecera de la ficha
    const situacion = (situacionesRes.data ?? []).find(
      (s) => s.activo && (s.desde as string) <= hoyIso && (!s.hasta || (s.hasta as string) >= hoyIso),
    );

    const ddmm = (f: string | null | undefined) => {
      if (!f) return "";
      const [, m, d] = String(f).split("-");
      return m && d ? `${d}/${m}` : String(f);
    };

    const perfilLineas = (perfilRes.data ?? []).map((p) => {
      const label = etiquetaAtributo.get(p.atributo_key as string) ?? (p.atributo_key as string);
      const unidad = unidadAtributo.get(p.atributo_key as string);
      const valor = p.valor_num !== null && p.valor_num !== undefined
        ? `${Number(p.valor_num).toLocaleString("es-ES")}${unidad ? ` ${unidad}` : ""}`
        : (p.valor_texto as string) ?? "";
      const obs = ddmm(p.observado_en as string);
      const sinConfirmar = p.estado !== "confirmado" ? " (sin confirmar)" : "";
      return `  ${label}: ${valor}${obs ? ` (observado ${obs})` : ""}${sinConfirmar}`;
    });

    const eur0 = (n: number) => Math.round(n).toLocaleString("es-ES");

    // Ventas por año con etiqueta completo/parcial, y comparación homogénea
    // del año en curso contra el mismo periodo del año anterior.
    const anioActual = hoyLocal.getFullYear();
    const hastaDM = ddmm(hoyIso);
    const ventasLineas = Object.entries(porAnio).sort().map(([a, t]) => {
      const esParcial = Number(a) === anioActual;
      const marca = esParcial ? `parcial, hasta ${hastaDM}` : "año completo";
      return `  ${a} (${marca}): ${eur0(t)} EUR`;
    }).join("\n");

    let comparativaYtd = "";
    {
      const ytdAnterior = kpis?.importe_anio_anterior_ytd != null ? Number(kpis.importe_anio_anterior_ytd) : 0;
      const actual = porAnio[anioActual];
      if (ytdAnterior !== 0 && actual !== undefined) {
        const pct = ((actual - ytdAnterior) / Math.abs(ytdAnterior)) * 100;
        const pctTxt = `${pct >= 0 ? "+" : ""}${pct.toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
        comparativaYtd = [
          "",
          "COMPARACIÓN VÁLIDA (mismo periodo del año anterior):",
          `  ${anioActual - 1} hasta ${hastaDM}: ${eur0(ytdAnterior)} EUR  ·  ${anioActual} hasta ${hastaDM}: ${eur0(actual)} EUR  ·  ${pctTxt}`,
        ].join("\n");
      }
    }

    const cliente = clienteRes.data;
    const contexto = [
      `CLIENTE: ${cliente.cliente} (código ${cliente.cod_cliente})`,
      `Delegación: ${cliente.delegacion ?? "—"} · Localidad: ${cliente.localidad ?? "—"} · Comercial: ${cliente.vendedor ?? "—"}`,
      cliente.tipo_cliente ? `Tipo: ${cliente.tipo_cliente}` : "",
      situacion ? `SITUACIÓN: ${situacion.etiqueta}` : "",
      cliente.observaciones ? `Observaciones de ficha: ${cliente.observaciones}` : "",
      "",
      "VENTAS POR AÑO (EUR):",
      ventasLineas || "  Sin datos",
      comparativaYtd,
      "",
      kpis
        ? `INDICADORES: última compra ${kpis.ultima_compra ?? "—"} · ${kpis.dias_sin_comprar ?? "—"} días sin comprar · ` +
          `ticket medio ${Math.round(Number(kpis.ticket_medio_actual ?? 0)).toLocaleString("es-ES")} EUR · ` +
          `${kpis.num_documentos_actual ?? 0} documentos este año · ` +
          `frecuencia de compra cada ${kpis.frecuencia_compra_dias ?? "—"} días · canal principal ${kpis.canal_principal ?? "—"}`
        : "",
      "",
      "PERFIL DEL TALLER:",
      perfilLineas.join("\n") || "  Sin datos de perfil",
      "",
      "PRODUCTOS (últimos 12 meses vs. 12 anteriores):",
      (productosRes.data ?? []).slice(0, 20).map((p: Record<string, unknown>) => {
        const act = Number(p.importe ?? 0);
        const ant = Number(p.importe_anterior ?? 0);
        let comparativa: string;
        if (ant === 0) comparativa = "(nueva)";
        else if (act === 0) comparativa = `(antes ${eur0(ant)} EUR, perdida)`;
        else {
          const pct = Math.round(((act - ant) / ant) * 100);
          comparativa = `(antes ${eur0(ant)} EUR, ${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %)`;
        }
        return `  ${p.referencia}${p.descripcion ? ` (${p.descripcion})` : ""}${p.familia ? ` [${p.familia}]` : ""} — ${eur0(act)} EUR ${comparativa}${p.ultima_compra ? `, última compra ${p.ultima_compra}` : ""}`;
      }).join("\n") || "  Sin datos",
      "",
      "ÚLTIMAS VISITAS:",
      seccionVisitas,
    ].filter(Boolean).join("\n");

    const t0 = performance.now();
    const chat = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modeloUsado,
        // Esfuerzo explícito: sin él cada modelo usa su valor por defecto (más tokens y latencia).
        // Sin temperature: gpt-6.1-sol y gpt-5.5 la rechazan.
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content:
              "Eres un analista comercial de una distribuidora de recambios de automoción. Analizas la ficha de un cliente y preparas al comercial para su próxima visita. " +
              "Sé concreto y accionable: cifras, familias de producto y acciones. Nada de generalidades. Responde siempre en español. " +
              "Si una referencia relevante ha caído respecto al periodo anterior (últimos 12 meses vs. 12 anteriores), menciónala explícitamente en alertas u oportunidades, con su nombre y su porcentaje de variación. " +
              "El año en curso está incompleto. NUNCA compares su importe con el total de un año cerrado ni presentes esa diferencia como una caída o una subida. " +
              "Para cualquier afirmación sobre la evolución anual usa exclusivamente el bloque COMPARACIÓN VÁLIDA. Si ese bloque no aparece, no afirmes nada sobre la tendencia anual. " +
              "Usa los acuerdos, las próximas acciones y las ofertas pendientes de ÚLTIMAS VISITAS para proponer qué retomar en la siguiente visita, y no vuelvas a proponer lo que el cliente ya rechazó.",
          },
          { role: "user", content: contexto },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "insights_cliente", strict: true, schema: SCHEMA },
        },
      }),
    });

    if (!chat.ok) {
      const body = await chat.text();
      console.error(`Insights falló [${chat.status}]: ${body}`);
      const msg =
        chat.status === 429
          ? "Demasiadas peticiones a la IA. Espera unos segundos."
          : chat.status === 402
          ? "Se han agotado los créditos de IA del espacio de trabajo."
          : "No se ha podido generar el análisis.";
      return new Response(JSON.stringify({ error: msg, status: chat.status, details: body }), {
        status: chat.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const duracion_ms = Math.round(performance.now() - t0);
    const chatJson = await chat.json();
    const usage = chatJson.usage ?? {};
    const numOnull = (v: unknown) => (typeof v === "number" ? v : null);
    const _meta = {
      modelo: modeloUsado,
      prompt_tokens: numOnull(usage.prompt_tokens),
      completion_tokens: numOnull(usage.completion_tokens),
      total_tokens: numOnull(usage.total_tokens),
      duracion_ms,
    };
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(chatJson.choices?.[0]?.message?.content ?? "{}");
    } catch (e) {
      console.error("cliente-insights: JSON inválido del modelo", e);
      return new Response(
        JSON.stringify({ error: "La IA ha devuelto una respuesta no válida. Inténtalo de nuevo." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Saneado: recorta colas de basura antes de guardar y de responder
    const avisar = (original: string, limpio: string) => {
      if (original !== limpio) {
        console.warn(`cliente-insights: texto recortado (cliente ${cod_cliente}): ${original.slice(0, 200)}`);
      }
    };
    const limpiarLista = (v: unknown): string[] =>
      (Array.isArray(v) ? v : []).map((x) => {
        const orig = String(x ?? "");
        const out = limpiar(orig);
        avisar(orig, out);
        return out;
      }).filter(Boolean);

    const resumenOriginal = String(parsed.resumen ?? "");
    const resumen = limpiar(resumenOriginal);
    avisar(resumenOriginal, resumen);

    const saneado = {
      resumen,
      alertas: limpiarLista(parsed.alertas),
      oportunidades: limpiarLista(parsed.oportunidades),
      argumentario: limpiarLista(parsed.argumentario),
    };

    // Guardar en caché con service role (la tabla solo permite escritura a admin).
    // En modo prueba NO se guarda: no debe sobrescribir el informe bueno del cliente.
    if (!esPrueba) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("cliente_insights").upsert(
        {
          cod_cliente,
          ...saneado,
          generado_en: new Date().toISOString(),
        },
        { onConflict: "cod_cliente" },
      );
    }

    return new Response(JSON.stringify({ ...saneado, generado_en: new Date().toISOString(), _meta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cliente-insights error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---------------------------------------------------------------- últimas visitas

const ETIQUETA_TIPO: Record<string, string> = { cliente: "Cliente", ruta: "Ruta", llamada: "Llamada", agenda: "Agenda" };
const ETIQUETA_RESULTADO: Record<string, string> = {
  cliente_ausente: "Cliente ausente",
  cerrado: "Cerrado",
  sin_acceso: "Sin acceso",
};

const esRutaAdjunto = (v: string) => /^[0-9a-f-]{36}\/.+\.[a-z0-9]{2,5}$/i.test(v.trim());

function textoValor(val: unknown): string {
  if (val == null) return "";
  if (Array.isArray(val)) return val.map(textoValor).filter(Boolean).join(", ");
  if (typeof val === "object") return "";
  if (typeof val === "boolean") return val ? "Sí" : "No";
  const t = String(val).replace(/\s+/g, " ").trim();
  return esRutaAdjunto(t) ? "" : t;
}

export const LIMITE_FILAS_VISITAS = 40;
export const MAX_VISITAS = 10;

type OpcionesVisitas = {
  atributoDeCampo?: Map<string, string>;
  vigentePorBloque?: Set<string>;
  limiteFilas?: number;
};

/**
 * Gespromo guarda una fila por motivo: se juntan las del mismo día y comercial.
 * Las visitas de la app ya son una fila con todos sus bloques y no se juntan.
 * Si se llegó al límite de filas, el último grupo puede estar incompleto y se quita.
 */
export function agruparVisitas(visitas: Record<string, unknown>[], limiteFilas?: number): Record<string, unknown>[][] {
  const grupos: Record<string, unknown>[][] = [];
  const indice = new Map<string, number>();
  for (const v of visitas) {
    if (v.origen === "gespromo") {
      const clave = `${v.fecha}|${(v.user_id as string) ?? ""}|${(v.comercial_nombre as string) ?? ""}`;
      const pos = indice.get(clave);
      if (pos !== undefined) { grupos[pos].push(v); continue; }
      indice.set(clave, grupos.length);
    }
    grupos.push([v]);
  }
  if (limiteFilas && visitas.length >= limiteFilas && grupos.length > 1) {
    const ultima = visitas[visitas.length - 1];
    const k = grupos.findIndex((g) => g.includes(ultima));
    if (k >= 0 && grupos[k][0].origen === "gespromo") grupos.splice(k, 1);
  }
  return grupos.slice(0, MAX_VISITAS);
}

export function formatearVisitas(
  visitas: Record<string, unknown>[],
  bloquesPorVisita: Map<string, Record<string, unknown>[]>,
  etiquetaCampo: Map<string, string>,
  nombreMotivo: Map<string, string>,
  opciones: OpcionesVisitas = {},
): string {
  if (!visitas.length) return "  Sin visitas registradas";
  const { atributoDeCampo, vigentePorBloque, limiteFilas } = opciones;
  return agruparVisitas(visitas, limiteFilas).map((grupo) => {
    const v = grupo[0];
    const cab = [v.fecha as string, ETIQUETA_TIPO[v.tipo as string] ?? (v.tipo as string)];
    if (v.comercial_nombre) cab.push(v.comercial_nombre as string);
    const res = grupo.map((g) => ETIQUETA_RESULTADO[g.resultado_visita as string]).find(Boolean);
    if (res) cab.push(`resultado: ${res}`);
    const lineas = [`  ${cab.filter(Boolean).join(" · ")}`];

    const obsDe = (f: Record<string, unknown>) =>
      ((f.observaciones as string) || (f.observaciones_original as string) || "").replace(/\s+/g, " ").trim();

    for (const fila of grupo) {
      const bloques = bloquesPorVisita.get(fila.id as string) ?? [];
      
      for (const b of bloques) {
        const motivo = b.motivo_key as string;
        const campos = b.campos && typeof b.campos === "object" ? (b.campos as Record<string, unknown>) : {};
        const todos = Object.entries(campos).filter(([k]) => k !== "documentos" && !k.endsWith("_nombre"));
        const partes = todos
          .filter(([k]) => {
            const attr = atributoDeCampo?.get(`${motivo}|${k}`);
            return !(attr && vigentePorBloque?.has(`${b.id}|${attr}`));
          })
          .map(([k, val]) => [k, textoValor(val)] as const)
          .filter(([, t]) => t !== "")
          .map(([k, t]) => `${etiquetaCampo.get(`${motivo}|${k}`) ?? k}: ${t}`);
        const huboOcultos = todos.length > 0 && partes.length === 0 &&
          todos.some(([k]) => atributoDeCampo?.has(`${motivo}|${k}`));
        if (huboOcultos) continue; // todo lo del bloque ya está en PERFIL DEL TALLER
        lineas.push(`    - ${nombreMotivo.get(motivo) ?? motivo ?? "Sin motivo"}${partes.length ? `: ${partes.join(" | ")}` : ""}`);
      }
      // App: las observaciones del comercial siempre. Gespromo: solo si no hay bloques.
      if (fila.origen === "app" || bloques.length === 0) {
        const obs = obsDe(fila);
        if (obs) lineas.push(`    Observaciones: ${obs}`);
      }
    }
    return lineas.join("\n");
  }).join("\n");
}
