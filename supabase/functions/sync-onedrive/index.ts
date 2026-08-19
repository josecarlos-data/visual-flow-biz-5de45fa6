import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import * as XLSX from "npm:@e965/xlsx";
import { corsHeaders } from "../_shared/cors.ts";

type Row = Record<string, unknown>;

/** Convierte un enlace compartido de OneDrive/SharePoint en una URL de descarga directa. */
function toDirectDownload(url: string): string {
  if (url.includes("api.onedrive.com") || url.includes("download=1")) return url;
  if (url.includes("1drv.ms") || url.includes("onedrive.live.com") || url.includes("sharepoint.com")) {
    const b64 = btoa(url).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
    return `https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`;
  }
  return url;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const pick = (row: Row, ...keys: string[]): unknown => {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  return null;
};
const toDate = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

interface Handler {
  table: string;
  onConflict: string;
  wipe?: string;
  map: (rows: Row[]) => Row[];
}

const HANDLERS: Record<string, Handler> = {
  clientes: {
    table: "clientes",
    onConflict: "cod_cliente",
    map: (rows) =>
      rows
        .map((r) => ({
          cod_cliente: num(pick(r, "Cod.", "Cod", "Codigo", "Código", "cod_cliente")),
          cliente: str(pick(r, "Cliente", "Nombre", "cliente")),
          delegacion: str(pick(r, "Delegación", "Delegacion")),
          localidad: str(pick(r, "Localidad", "Población", "Poblacion")),
          provincia: str(pick(r, "Provincia")),
          direccion: str(pick(r, "Dirección", "Direccion")),
          telefono: str(pick(r, "Teléfono", "Telefono", "Tel")),
          email: str(pick(r, "Email", "Correo", "E-mail")),
          vendedor: str(pick(r, "Vendedor", "Comercial")),
          ruta: str(pick(r, "Ruta")),
          tipo_cliente: str(pick(r, "Tip cli", "Tipo", "Tipo Cliente")),
          observaciones: str(pick(r, "Observaciones")),
        }))
        .filter((r) => r.cod_cliente && r.cliente),
  },
  // "ventas" (ventas_mensuales) retirado: el pipeline vivo es ventas_diarias.

  productos: {
    table: "productos",
    onConflict: "referencia",
    map: (rows) =>
      rows
        .map((r) => ({
          referencia: str(pick(r, "Referencia", "Ref", "Código", "Codigo")),
          descripcion: str(pick(r, "Descripción", "Descripcion", "Nombre")),
          familia: str(pick(r, "Familia", "Categoría", "Categoria")),
          marca: str(pick(r, "Marca", "Fabricante")),
          precio: num(pick(r, "Precio", "PVP")),
        }))
        .filter((r) => r.referencia),
  },
  // "cliente_productos" retirado: se calcula desde ventas_diarias.

  visitas: {
    table: "visitas",
    onConflict: "id",
    map: (rows) =>
      rows
        .map((r) => ({
          cod_cliente: num(pick(r, "Cod.", "Cod", "cod_cliente", "Cliente Cod")),
          motivo_key: (str(pick(r, "Motivo", "MotivoVisita")) ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z]/g, "")
            .slice(0, 20) || null,
          fecha: toDate(pick(r, "Fecha", "FechaVisita")) ?? new Date().toISOString().slice(0, 10),
          vendedor: str(pick(r, "Vendedor", "Comercial")),
          observaciones: str(pick(r, "Observación", "Observacion", "Observaciones", "Comentario")),
          origen: "gespromo",
        }))
        .filter((r) => r.cod_cliente),
  },
  rutas: {
    table: "rutas",
    onConflict: "codigo",
    map: (rows) =>
      rows
        .map((r) => ({
          codigo: str(pick(r, "Código", "Codigo", "Ruta", "Cod")),
          nombre: str(pick(r, "Nombre", "Descripción", "Descripcion", "Ruta")) ?? "",
          vendedor: str(pick(r, "Vendedor", "Comercial")),
          delegacion: str(pick(r, "Delegación", "Delegacion")),
        }))
        .filter((r) => r.codigo && r.nombre),
  },
};

async function syncDataset(admin: ReturnType<typeof createClient>, cfg: Row) {
  const key = String(cfg.dataset_key);
  const handler = HANDLERS[key];
  if (!handler) throw new Error(`Dataset desconocido: ${key}`);
  if (!cfg.file_url) throw new Error("Sin enlace de archivo configurado");

  const res = await fetch(toDirectDownload(String(cfg.file_url)), { redirect: "follow" });
  if (!res.ok) throw new Error(`No se pudo descargar el Excel [${res.status}]`);

  const buf = new Uint8Array(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = (cfg.sheet_name as string) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`La hoja "${sheetName}" no existe en el archivo`);

  const raw: Row[] = XLSX.utils.sheet_to_json(ws, { defval: null });
  const mapped = handler.map(raw);
  if (mapped.length === 0) throw new Error("La hoja no contiene filas válidas. Revisa las cabeceras.");

  if (handler.wipe) {
    await admin.from(handler.wipe).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }
  if (key === "visitas") {
    await admin.from("visitas").delete().eq("origen", "gespromo");
  }

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH);
    const q = key === "visitas"
      ? await admin.from(handler.table).insert(batch)
      : await admin.from(handler.table).upsert(batch, { onConflict: handler.onConflict });
    if (q.error) throw new Error(q.error.message);
    inserted += batch.length;
  }
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- Autenticación: solo administradores autenticados pueden lanzar la sincronización ---
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "No autenticado" }, 401);

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roles) return json({ error: "Acceso restringido a administradores" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const only: string | undefined = body?.dataset_key;

    let q = admin.from("sync_config").select("*").eq("is_active", true);
    if (only) q = q.eq("dataset_key", only);
    const { data: configs, error } = await q;
    if (error) throw new Error(error.message);
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ results: [], message: "No hay fuentes configuradas" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Row[] = [];
    for (const cfg of configs) {
      try {
        const rows = await syncDataset(admin, cfg);
        await admin.from("sync_config").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "ok",
          last_sync_message: `${rows} filas`,
        }).eq("id", cfg.id);
        await admin.from("sync_log").insert({ dataset_key: cfg.dataset_key, status: "ok", rows_processed: rows });
        results.push({ dataset_key: cfg.dataset_key, status: "ok", rows });
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`sync ${cfg.dataset_key}:`, msg);
        await admin.from("sync_config").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_message: msg,
        }).eq("id", cfg.id);
        await admin.from("sync_log").insert({ dataset_key: cfg.dataset_key, status: "error", message: msg });
        results.push({ dataset_key: cfg.dataset_key, status: "error", message: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-onedrive error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
