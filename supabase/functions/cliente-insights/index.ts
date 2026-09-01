import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

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
    const { cod_cliente } = await req.json();
    if (!cod_cliente) {
      return new Response(JSON.stringify({ error: "Falta el código de cliente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

// Fecha local (no UTC) para "hasta hoy" en la consulta de productos
    const hoyLocal = new Date();
    const hoyIso = `${hoyLocal.getFullYear()}-${String(hoyLocal.getMonth() + 1).padStart(2, "0")}-${String(hoyLocal.getDate()).padStart(2, "0")}`;

    const [clienteRes, ventasRes, productosRes, visitasRes, kpisRes] = await Promise.all([
      userClient.from("clientes").select("*").eq("cod_cliente", cod_cliente).maybeSingle(),
      userClient.from("resumen_cliente_mes").select("anio, mes, importe").eq("cod_cliente", cod_cliente),
      userClient.rpc("cliente_top_productos", {
        _cod: cod_cliente,
        _desde: "2000-01-01",
        _hasta: hoyIso,
        _desde_prev: null,
        _hasta_prev: null,
      }),
      userClient.from("visitas").select("fecha, motivo_key, campos, observaciones").eq("cod_cliente", cod_cliente).order("fecha", { ascending: false }).limit(8),
      userClient.from("cliente_kpis").select("*").eq("cod_cliente", cod_cliente).maybeSingle(),
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

    const cliente = clienteRes.data;
    const contexto = [
      `CLIENTE: ${cliente.cliente} (código ${cliente.cod_cliente})`,
      `Delegación: ${cliente.delegacion ?? "—"} · Localidad: ${cliente.localidad ?? "—"} · Comercial: ${cliente.vendedor ?? "—"}`,
      cliente.tipo_cliente ? `Tipo: ${cliente.tipo_cliente}` : "",
      cliente.observaciones ? `Observaciones de ficha: ${cliente.observaciones}` : "",
      "",
      "VENTAS POR AÑO (EUR):",
      Object.entries(porAnio).sort().map(([a, t]) => `  ${a}: ${Math.round(t).toLocaleString("es-ES")}`).join("\n") || "  Sin datos",
      "",
      kpis
        ? `INDICADORES: última compra ${kpis.ultima_compra ?? "—"} · ${kpis.dias_sin_comprar ?? "—"} días sin comprar · ` +
          `ticket medio ${Math.round(Number(kpis.ticket_medio_actual ?? 0)).toLocaleString("es-ES")} EUR · ` +
          `${kpis.num_documentos_actual ?? 0} documentos este año · ` +
          `frecuencia de compra cada ${kpis.frecuencia_compra_dias ?? "—"} días · canal principal ${kpis.canal_principal ?? "—"}`
        : "",
      "",
      "PRODUCTOS MÁS COMPRADOS:",
      (productosRes.data ?? []).slice(0, 20).map((p: Record<string, unknown>) =>
        `  ${p.referencia}${p.descripcion ? ` (${p.descripcion})` : ""}${p.familia ? ` [${p.familia}]` : ""} — ${Math.round(Number(p.importe)).toLocaleString("es-ES")} EUR${p.ultima_compra ? `, última compra ${p.ultima_compra}` : ""}`
      ).join("\n") || "  Sin datos",
      "",
      "ÚLTIMAS VISITAS:",
      (visitasRes.data ?? []).map((v) => {
        const campos = v.campos && typeof v.campos === "object"
          ? Object.entries(v.campos as Record<string, unknown>).filter(([, val]) => val).map(([k, val]) => `${k}: ${val}`).join(" | ")
          : "";
        return `  ${v.fecha} [${v.motivo_key ?? "—"}] ${campos || v.observaciones || ""}`;
      }).join("\n") || "  Sin visitas registradas",
    ].filter(Boolean).join("\n");

    const chat = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          {
            role: "system",
            content:
              "Eres un analista comercial de una distribuidora de recambios de automoción. Analizas la ficha de un cliente y preparas al comercial para su próxima visita. " +
              "Sé concreto y accionable: cifras, familias de producto y acciones. Nada de generalidades. Responde siempre en español.",
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

    const chatJson = await chat.json();
    const parsed = JSON.parse(chatJson.choices?.[0]?.message?.content ?? "{}");

    // Guardar en caché con service role (la tabla solo permite escritura a admin)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("cliente_insights").upsert(
      {
        cod_cliente,
        resumen: parsed.resumen ?? "",
        alertas: parsed.alertas ?? [],
        oportunidades: parsed.oportunidades ?? [],
        argumentario: parsed.argumentario ?? [],
        generado_en: new Date().toISOString(),
      },
      { onConflict: "cod_cliente" },
    );

    return new Response(JSON.stringify({ ...parsed, generado_en: new Date().toISOString() }), {
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
