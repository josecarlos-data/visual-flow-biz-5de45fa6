/**
 * Casos de fase4.5 (12/11/2026): visita sin contenido y fecha relativa con fecha de visita conocida.
 *   bun scripts/bench-visita-voz/casos-fase45.ts
 * Necesita LOVABLE_API_KEY y SUPABASE_DB_URL. No usa cuentas ni escribe en la base de datos.
 */
import { execFileSync } from "node:child_process";
import {
  admiteIA,
  esquemaExtraccion,
  MODELO_EXTRACCION,
  sistemaExtraccion,
  usuarioExtraccion,
  VERSION_PROMPT,
  type CampoDef,
  type MotivoDef,
} from "../../supabase/functions/_shared/visita-voz-prompt.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ------------------------------------------------------------------ catálogo

function sql<T>(query: string): T {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Falta SUPABASE_DB_URL");
  const out = execFileSync("psql", [url, "-Atqc", query], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.trim() || "[]") as T;
}

function cargarMotivos(): MotivoDef[] {
  const motivos = sql<{ key: string; nombre: string; descripcion: string | null }[]>(
    `select coalesce(json_agg(json_build_object('key',key,'nombre',nombre,'descripcion',descripcion) order by sort_order),'[]')
     from motivos_visita where is_active`,
  );
  const campos = sql<(CampoDef & { is_active: boolean; visibilidad: string; opciones_raw: unknown })[]>(
    `select coalesce(json_agg(json_build_object(
        'motivo_key',c.motivo_key,'campo_key',c.campo_key,'label',c.label,'ayuda',c.ayuda,'tipo',c.tipo,
        'is_required',c.is_required,'requerido_validacion',c.requerido_validacion,'sort_order',c.sort_order,
        'is_active',c.is_active,'visibilidad',c.visibilidad,'opciones_raw',c.opciones) order by c.sort_order),'[]')
     from motivo_campos c`,
  );
  const catalogos = sql<{ clave: string; valor: string }[]>(
    `select coalesce(json_agg(json_build_object('clave',clave,'valor',valor) order by orden),'[]')
     from catalogos_opciones where is_active`,
  );
  const porClave: Record<string, string[]> = {};
  for (const c of catalogos) (porClave[c.clave] ??= []).push(c.valor);

  const resolver = (o: unknown): string[] => {
    if (Array.isArray(o)) return o.map(String).filter(Boolean);
    if (o && typeof o === "object") {
      const clave = (o as { catalogo?: string }).catalogo;
      if (clave) return porClave[clave] ?? [];
    }
    return [];
  };

  const activos: CampoDef[] = campos
    .filter((c) => admiteIA(c))
    .map((c) => ({ ...c, opciones: resolver(c.opciones_raw) }));

  return motivos
    .map((m) => ({ ...m, campos: activos.filter((c) => c.motivo_key === m.key) }))
    .filter((m) => m.campos.length > 0);
}

async function llamar(sistema: string, usuario: string, schema: unknown, modelo = MODELO_EXTRACCION) {
  const t0 = Date.now();
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      reasoning_effort: "none",
      temperature: 0,
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
      response_format: { type: "json_schema", json_schema: { name: "informe_visita", strict: true, schema } },
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`[${res.status}] ${(await res.text()).slice(0, 400)}`);
  const body = await res.json();
  return {
    ms,
    uso: body.usage ?? {},
    salida: JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>,
  };
}


const CASOS = [
  { id: "sin_contenido", fecha: "2026-11-12", narracion: "No estaba, vuelvo mañana." },
  {
    id: "fecha_relativa",
    fecha: "2026-11-12",
    narracion:
      "He estado con Manolo en el taller. Le he presentado la oferta de baterías Varta y le interesa, pero quiere pensarlo. " +
      "Le llamo el martes para cerrar el pedido.",
  },
];

const motivos = cargarMotivos();
console.log(`Prompt ${VERSION_PROMPT} · modelo ${MODELO_EXTRACCION}`);
for (const c of CASOS) {
  const r = await llamar(sistemaExtraccion(motivos), usuarioExtraccion(c.narracion, "Cliente de prueba", c.fecha), esquemaExtraccion(motivos));
  const bloques = Object.entries(r.salida).filter(([k, v]) => k.startsWith("bloques_") && Array.isArray(v) && v.length);
  console.log(`\n=== ${c.id} (fecha visita ${c.fecha}) ===`);
  console.log(`Narración: ${c.narracion}`);
  console.log(`resultado_visita: ${r.salida.resultado_visita} · listas con bloques: ${bloques.length}`);
  console.log(JSON.stringify(Object.fromEntries(bloques), null, 2));
}
