/**
 * Banco de dictados cortos (fase4.6). Mide si la extracción crea los bloques esperados.
 *
 *   bun scripts/bench-visita-voz/casos-cortos.ts                       # gpt-6-luna, esfuerzo none, 5 ejecuciones
 *   CONF=gpt-6-luna/low REPS=3 bun scripts/bench-visita-voz/casos-cortos.ts
 *   VAR=promocion bun scripts/bench-visita-voz/casos-cortos.ts         # + frase fija de Promoción (no publicada)
 *
 * Criterio de «bloques esperados» por caso:
 *   - todos: deben aparecer todos esos motivos (y al menos `comp` bloques de competencia).
 *   - alguno: basta con uno de esos motivos.
 *   - cero: ningún bloque y resultado no efectivo.
 * Un bloque cuenta si tiene al menos un campo válido con el mismo filtro que visita-voz (valorValido).
 * Necesita LOVABLE_API_KEY y SUPABASE_DB_URL. Escribe RESULTADOS-cortos.md junto a este fichero.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  admiteIA,
  esquemaExtraccion,
  sistemaExtraccion,
  usuarioExtraccion,
  VERSION_PROMPT,
  type CampoDef,
  type MotivoDef,
} from "../../supabase/functions/_shared/visita-voz-prompt.ts";

const DIR = import.meta.dir;
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

// ------------------------------------------------------------------ casos

interface Caso { id: string; narracion: string; fecha?: string; todos?: string[]; alguno?: string[]; cero?: boolean; comp?: number }

const narraciones = JSON.parse(readFileSync(join(DIR, "narraciones.json"), "utf8")) as {
  etiqueta: string; narracion: string; esperado: { motivos: string[]; competencia_bloques: number };
}[];

export const CASOS: Caso[] = [
  ...narraciones.map((n) => ({ id: `bench:${n.etiqueta}`, narracion: n.narracion, todos: n.esperado.motivos, comp: n.esperado.competencia_bloques })),
  { id: "f45:sin_contenido", fecha: "2026-11-12", narracion: "No estaba, vuelvo mañana.", cero: true },
  { id: "f45:fecha_relativa", fecha: "2026-11-12", narracion: "He estado con Manolo en el taller. Le he presentado la oferta de baterías Varta y le interesa, pero quiere pensarlo. Le llamo el martes para cerrar el pedido.", alguno: ["promocion", "seguimiento", "revision_seguimiento"] },
  { id: "f45:fecha_explicita", fecha: "2026-11-12", narracion: "Seguimiento con Manolo: le he presentado la oferta de baterías Varta, le interesa pero quiere pensarlo. Próxima acción: le llamo el martes para cerrar el pedido.", alguno: ["promocion", "seguimiento", "revision_seguimiento"] },
  { id: "corto:oferta", fecha: "2026-11-12", narracion: "Le dejo la oferta de filtros Mann de noviembre, un 35% en aire y gasoil. Le interesa, dice que hará pedido la semana que viene.", todos: ["promocion"] },
  { id: "corto:competencia", fecha: "2026-11-12", narracion: "Venta fallada de un compresor Wabco, referencia 4123520200. Nosotros lo tenemos a 511 y Luis Moleón se lo da a 480.", todos: ["competencia"], comp: 1 },
  { id: "corto:incidencia", fecha: "2026-11-12", narracion: "Se queja de que el último pedido de pastillas llegó con dos días de retraso y una caja rota. Hay que abrir reclamación con almacén.", todos: ["incidencia"] },
  { id: "corto:seguimiento", fecha: "2026-11-12", narracion: "Hablo con Pepe, el encargado. Está contento con el servicio y no necesita nada ahora. Le llamo el martes para ver si le hace falta aceite.", alguno: ["seguimiento", "revision_seguimiento"] },
  { id: "corto:dos_motivos", fecha: "2026-11-12", narracion: "Le enseño la promoción de baterías Varta y le interesa. Además me dice que las escobillas Bosch se las da Grupo Peña a 9 euros y nosotros a 12.", todos: ["promocion", "competencia"], comp: 1 },
];

// ------------------------------------------------------------------ configuraciones

const CONFS: Record<string, { model: string; effort: string; temp: number | null; pin: number; pout: number }> = {
  "gpt-6-luna/none": { model: "openai/gpt-6-luna", effort: "none", temp: 0, pin: 0.0000004, pout: 0.000002 },
  "gpt-6-luna/low": { model: "openai/gpt-6-luna", effort: "low", temp: null, pin: 0.0000004, pout: 0.000002 },
  "gpt-5.6-luna/none": { model: "openai/gpt-5.6-luna", effort: "none", temp: 0, pin: 0.0000008, pout: 0.0000048 },
  "gemini-3.8-flash/low": { model: "google/gemini-3.8-flash", effort: "low", temp: null, pin: 0.000003, pout: 0.000015 },
};
const CONF_ID = process.env.CONF ?? "gpt-6-luna/none";
const CONF = CONFS[CONF_ID];
if (!CONF) throw new Error(`CONF desconocida: ${CONF_ID}`);
const REPS = Number(process.env.REPS ?? 5);
const VAR = process.env.VAR ?? "";

let motivos = cargarMotivos();
if (VAR === "promocion") {
  motivos = motivos.map((m) => m.key === "promocion"
    ? { ...m, descripcion: "Una oferta o promoción que el comercial presenta, deja o envía al cliente, aunque falten referencia, cantidad o precio." }
    : m);
}
const SIS = sistemaExtraccion(motivos);
const ESQ = esquemaExtraccion(motivos);

function valido(c: CampoDef, v: unknown) {
  if (v === null || v === undefined || String(v).trim() === "") return false;
  const s = String(v).trim();
  if (c.opciones.length && c.tipo === "select" && !c.opciones.includes(s)) return false;
  if (c.tipo === "referencia" && !(s.length >= 3 && /\d/.test(s))) return false;
  return true;
}

async function llamar(usuario: string) {
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    model: CONF.model, reasoning_effort: CONF.effort,
    messages: [{ role: "system", content: SIS }, { role: "user", content: usuario }],
    response_format: { type: "json_schema", json_schema: { name: "informe_visita", strict: true, schema: ESQ } },
  };
  if (CONF.temp !== null) body.temperature = CONF.temp;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(GATEWAY, { method: "POST", headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) {
      const j = await r.json();
      return { ms: Date.now() - t0, uso: j.usage ?? {}, salida: JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown> };
    }
    if (r.status === 429 || r.status >= 500) { await new Promise((z) => setTimeout(z, 3000)); continue; }
    throw new Error(`[${r.status}] ${(await r.text()).slice(0, 300)}`);
  }
  throw new Error("reintentos agotados");
}

interface Fila { caso: string; ms: number; exito: boolean; cero: boolean; crudos: number; motivos: string[]; coste: number; salida: Record<string, unknown> }
const filas: Fila[] = [];
const trabajo: (() => Promise<void>)[] = [];
for (const k of CASOS) for (let rep = 0; rep < REPS; rep++) trabajo.push(async () => {
  const r = await llamar(usuarioExtraccion(k.narracion, "Cliente de prueba", k.fecha ?? null));
  let crudos = 0;
  const kept: string[] = [];
  for (const m of motivos) for (const it of (r.salida[`bloques_${m.key}`] ?? []) as { campos?: Record<string, unknown> }[]) {
    crudos++;
    if (m.campos.some((c) => valido(c, it?.campos?.[c.campo_key]))) kept.push(m.key);
  }
  const set = new Set(kept);
  const exito = k.cero
    ? kept.length === 0 && r.salida.resultado_visita !== "efectiva"
    : k.todos
      ? k.todos.every((x) => set.has(x)) && (!k.comp || kept.filter((x) => x === "competencia").length >= k.comp)
      : (k.alguno ?? []).some((x) => set.has(x));
  filas.push({ caso: k.id, ms: r.ms, exito, cero: kept.length === 0, crudos, motivos: kept, salida: r.salida,
    coste: (r.uso.prompt_tokens ?? 0) * CONF.pin + (r.uso.completion_tokens ?? 0) * CONF.pout });
});
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (i < trabajo.length) await trabajo[i++](); }));

const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))} %`;
const conContenido = filas.filter((f) => f.caso !== "f45:sin_contenido");
const tiempos = filas.map((f) => f.ms).sort((a, b) => a - b);
const lineas = [
  `# Dictados cortos · ${VERSION_PROMPT}${VAR ? ` + ${VAR}` : ""} · ${CONF_ID} · ${REPS} ejecuciones · ${new Date().toISOString()}`,
  "",
  `- Bloques esperados: ${pct(filas.filter((f) => f.exito).length, filas.length)}`,
  `- Cero bloques (sin contar «no estaba»): ${pct(conContenido.filter((f) => f.cero).length, conContenido.length)}`,
  `- Cero bloques por bloques descartados (no por listas vacías): ${conContenido.filter((f) => f.cero && f.crudos > 0).length}`,
  `- Latencia media ${(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 1000).toFixed(1)} s · p90 ${(tiempos[Math.floor(0.9 * tiempos.length)] / 1000).toFixed(1)} s`,
  `- Coste medio por extracción: ${(filas.reduce((a, f) => a + f.coste, 0) / filas.length).toFixed(5)} créditos`,
  "",
  "| Caso | Esperados | Cero | Motivos (1ª ejecución) |",
  "|---|---|---|---|",
  ...CASOS.map((k) => {
    const g = filas.filter((f) => f.caso === k.id);
    return `| ${k.id} | ${g.filter((f) => f.exito).length}/${g.length} | ${g.filter((f) => f.cero).length}/${g.length} | ${[...new Set(g[0]?.motivos ?? [])].join(", ")} |`;
  }),
];
const cero = conContenido.find((f) => f.cero);
if (cero) lineas.push("", `Salida cruda de un cero (${cero.caso}):`, "```json", JSON.stringify(cero.salida), "```");
writeFileSync(join(DIR, "RESULTADOS-cortos.md"), lineas.join("\n") + "\n");
console.log(lineas.join("\n"));
