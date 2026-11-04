import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLES = ["admin", "director_comercial", "jefe_de_zona", "comercial", "marketing"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "no_autorizado" }, 401);
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
  if (esAdmin !== true || cumple !== true) return json({ error: "Solo un administrador puede crear usuarios." }, 403);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Datos no válidos." }, 400); }
  const email = str(b?.email, 255).toLowerCase();
  const nombre = str(b?.full_name, 200);
  const username = str(b?.username, 60).toLowerCase();
  const password = typeof b?.password === "string" ? b.password : "";
  const role = str(b?.role, 40);
  const employee_code = str(b?.employee_code, 200) || null;
  const delegacion = str(b?.delegacion, 200) || null;
  const dashboards: string[] = Array.isArray(b?.dashboards)
    ? b.dashboards.filter((d: unknown) => typeof d === "string").slice(0, 50) : [];

  if (!EMAIL.test(email)) return json({ error: "El correo no es válido." }, 400);
  if (!nombre) return json({ error: "Indica el nombre completo." }, 400);
  if (password.length < 12 || password.length > 72) return json({ error: "La contraseña temporal debe tener al menos 12 caracteres." }, 400);
  if (!ROLES.includes(role)) return json({ error: "Elige un rol." }, 400);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  if (username) {
    const { data: ya } = await admin.from("profiles").select("user_id").eq("username", username).maybeSingle();
    if (ya) return json({ error: "Ese nombre de usuario ya existe." }, 409);
  }

  const { data: creado, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: nombre },
  });
  if (cErr || !creado?.user) {
    const m = (cErr?.message ?? "").toLowerCase();
    if (m.includes("already") || m.includes("registered") || m.includes("exists")) return json({ error: "Ya existe un usuario con ese correo." }, 409);
    if (m.includes("pwned") || m.includes("weak") || m.includes("password")) return json({ error: "Esa contraseña no es segura (aparece en filtraciones conocidas o es débil). Genera otra." }, 400);
    console.error("[admin-crear-usuario] createUser", cErr?.message);
    return json({ error: "No se ha podido crear el usuario." }, 500);
  }
  const nuevoId = creado.user.id;

  const deshacer = async (motivo: string) => {
    console.error("[admin-crear-usuario]", motivo);
    await admin.auth.admin.deleteUser(nuevoId);
    return json({ error: "No se ha podido completar el alta; no se ha creado el usuario." }, 500);
  };

  const { error: pErr } = await admin.from("profiles").update({
    full_name: nombre, employee_code, delegacion, is_approved: true, estado: "activo", debe_cambiar_password: true,
  }).eq("user_id", nuevoId);
  if (pErr) return deshacer("profiles " + pErr.message);

  if (username) {
    const { error: nErr } = await comoUsuario.rpc("admin_asignar_username", { _user_id: nuevoId, _username: username });
    if (nErr) {
      await admin.auth.admin.deleteUser(nuevoId);
      return json({ error: nErr.message || "Nombre de usuario no válido." }, 400);
    }
  }

  const { error: rErr } = await admin.from("user_roles").insert({ user_id: nuevoId, role });
  if (rErr) return deshacer("roles " + rErr.message);

  if (dashboards.length) {
    const { error: dErr } = await admin.from("user_dashboard_access")
      .insert(dashboards.map((k) => ({ user_id: nuevoId, dashboard_key: k })));
    if (dErr) return deshacer("dashboards " + dErr.message);
  }

  const cfIp = req.headers.get("cf-connecting-ip");
  const partes = (req.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  await admin.from("auditoria_eventos").insert({
    user_id: callerId, email: u.user.email ?? null, tipo: "usuario_creado", resultado: "ok",
    entidad: "usuario", entidad_id: nuevoId,
    detalle: { email, nombre, rol: role, username: username || null },
    ip: cfIp?.trim() || partes[0] || null, user_agent: req.headers.get("user-agent"),
  });

  return json({ ok: true, user_id: nuevoId });
});
