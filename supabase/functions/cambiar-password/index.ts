import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN = 12;
const MODOS = ["voluntario", "forzado", "recuperacion"] as const;
type Modo = typeof MODOS[number];

const resp = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fallo = (codigo: string, status = 400) => resp(status, { ok: false, codigo });

/** Lee el claim amr del JWT (ya validado por getUser). */
function metodosAuth(token: string): string[] {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(p.amr) ? p.amr.map((a: any) => String(a?.method ?? a)) : [];
  } catch {
    return [];
  }
}

function traducir(status: number, body: any): string {
  const code = String(body?.code ?? body?.error_code ?? "");
  const msg = String(body?.msg ?? body?.message ?? "").toLowerCase();
  const reasons: string[] = body?.weak_password?.reasons ?? [];
  if (reasons.includes("pwned") || msg.includes("pwned") || msg.includes("leaked") || msg.includes("breach")) return "filtrada";
  if (code === "same_password") return "igual";
  if (code === "weak_password") return "debil";
  if (status === 401 || code === "session_not_found" || code === "bad_jwt") return "sesion";
  console.error("[cambiar-password] error inesperado", status, code || "(sin código)");
  return "error";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fallo("error", 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fallo("sesion", 401);

  let body: any;
  try { body = await req.json(); } catch { return fallo("error"); }
  const modo = body?.modo as Modo;
  const password = typeof body?.password === "string" ? body.password : "";
  const actual = typeof body?.actual === "string" ? body.actual : "";
  if (!MODOS.includes(modo)) return fallo("modo_invalido");
  if (password.length < MIN) return fallo("corta");

  // Cliente que actúa como el propio usuario.
  const comoUsuario = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await comoUsuario.auth.getUser(token);
  if (uErr || !u?.user) return fallo("sesion", 401);
  const user = u.user;

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  if (modo === "forzado") {
    const { data: p } = await admin.from("profiles").select("debe_cambiar_password").eq("user_id", user.id).maybeSingle();
    if (!p?.debe_cambiar_password) return fallo("modo_invalido", 403);
  } else if (modo === "recuperacion") {
    const m = metodosAuth(token);
    if (!m.includes("recovery") && !m.includes("otp")) return fallo("modo_invalido", 403);
  }
  if (modo === "voluntario" || modo === "forzado") {
    if (!actual || !user.email) return fallo("actual_incorrecta");
    const verif = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: sErr } = await verif.auth.signInWithPassword({ email: user.email, password: actual });
    if (sErr) return fallo("actual_incorrecta");
  }

  // Cambio por la vía de usuario: aplica las comprobaciones del servidor (incluida HIBP).
  const upRes = await fetch(`${URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!upRes.ok) {
    let cuerpo: any = null;
    try { cuerpo = await upRes.json(); } catch { /* sin cuerpo */ }
    return fallo(traducir(upRes.status, cuerpo));
  }

  const { error: pErr } = await admin
    .from("profiles")
    .update({ debe_cambiar_password: false, password_cambiada_en: new Date().toISOString() })
    .eq("user_id", user.id);
  if (pErr) {
    console.error("[cambiar-password] profiles", pErr.message);
    return fallo("error", 500);
  }

  await admin.from("auditoria_eventos").insert({
    user_id: user.id,
    email: user.email,
    tipo: "password_cambiada",
    resultado: "ok",
    entidad: "usuario",
    entidad_id: user.id,
    detalle: { modo },
    ip: (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) || null,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  return resp(200, { ok: true });
});
