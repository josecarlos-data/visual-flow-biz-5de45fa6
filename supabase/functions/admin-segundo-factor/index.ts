import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "no_autorizado" }, 401);

  // Cliente que actúa como quien llama: is_admin y sesion_cumple_2fa usan su JWT (incluido 'aal').
  const comoUsuario = createClient(URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await comoUsuario.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "no_autorizado" }, 401);
  const callerId = u.user.id;

  const [{ data: esAdmin }, { data: cumple }] = await Promise.all([
    comoUsuario.rpc("is_admin", { _user_id: callerId }),
    comoUsuario.rpc("sesion_cumple_2fa"),
  ]);
  if (esAdmin !== true || cumple !== true) return json({ error: "prohibido" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "cuerpo" }, 400); }
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body?.accion === "estado") {
    const ids: unknown = body.user_ids;
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
      return json({ error: "user_ids" }, 400);
    }
    const estado: Record<string, boolean> = {};
    await Promise.all((ids as string[]).map(async (id) => {
      const { data } = await admin.auth.admin.mfa.listFactors({ userId: id });
      estado[id] = (data?.factors ?? []).some((f: any) => f.factor_type === "totp" && f.status === "verified");
    }));
    return json({ ok: true, estado });
  }

  if (body?.accion === "resetear") {
    const userId = body.user_id;
    if (typeof userId !== "string" || !UUID.test(userId)) return json({ error: "user_id" }, 400);
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) {
      console.error("[admin-segundo-factor] listFactors", error.message);
      return json({ error: "servicio" }, 500);
    }
    let borrados = 0;
    for (const f of data?.factors ?? []) {
      const { error: dErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
      if (dErr) {
        console.error("[admin-segundo-factor] deleteFactor", dErr.message);
        return json({ error: "servicio" }, 500);
      }
      borrados++;
    }
    const cfIp = req.headers.get("cf-connecting-ip");
    const xff = req.headers.get("x-forwarded-for");
    const partes = (xff ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    await admin.from("auditoria_eventos").insert({
      user_id: callerId,
      email: u.user.email ?? null,
      tipo: "2fa_reseteado",
      resultado: "ok",
      entidad: "usuario",
      entidad_id: userId,
      detalle: { factores_borrados: borrados },
      ip: cfIp?.trim() || partes[0] || null,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
    return json({ ok: true, borrados });
  }

  return json({ error: "accion" }, 400);
});
