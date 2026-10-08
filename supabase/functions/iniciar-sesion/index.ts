import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { LIMITE_IP, VENTANA_IP_MS } from "../_shared/limites-acceso.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VENTANA_MS = VENTANA_IP_MS;

const MSG_GENERICO = "Usuario o contraseña incorrectos";
const MSG_IP = "Demasiados intentos desde esta conexión. Espera unos minutos.";
const MSG_OCUPADO = "El servicio de acceso está ocupado. Inténtalo de nuevo en unos minutos.";
const MSG_ERROR = "No se ha podido iniciar sesión. Inténtalo de nuevo.";
const MSG_BLOQUEADO = "Tu usuario está bloqueado. Contacta con el administrador.";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const rechazo = (mensaje: string) => json({ ok: false, mensaje });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function permiteCorreo(): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "acceso_permite_correo").maybeSingle();
  return (data?.value ?? "true") === "true";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, mensaje: MSG_ERROR }, 405);

  let body: any;
  try { body = await req.json(); } catch { return rechazo(MSG_ERROR); }

  if (body?.accion === "config") {
    return json({ ok: true, permite_correo: await permiteCorreo() });
  }

  const identificador = typeof body?.identificador === "string" ? body.identificador.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!identificador || !password || identificador.length > 320 || password.length > 200) {
    return rechazo(MSG_GENERICO);
  }

  // 1. IP (misma lógica que registrar-evento)
  const cfIp = req.headers.get("cf-connecting-ip");
  const xff = req.headers.get("x-forwarded-for");
  const partes = (xff ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const ip = cfIp && cfIp.trim() ? cfIp.trim() : (partes.length ? partes[0] : null);
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const evento = (fila: { user_id?: string | null; email?: string | null; resultado: string; detalle: Record<string, unknown> }) =>
    admin.from("auditoria_eventos").insert({
      user_id: fila.user_id ?? null,
      email: fila.email ?? null,
      tipo: "login",
      resultado: fila.resultado,
      ruta: "/auth",
      detalle: { ...fila.detalle, via: "iniciar-sesion", x_forwarded_for: xff ?? null, cf_connecting_ip: cfIp ?? null },
      ip,
      user_agent: userAgent,
    });

  try {
    if (ip) {
      const desde = new Date(Date.now() - VENTANA_MS).toISOString();
      const { count, error } = await admin
        .from("auditoria_eventos")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "login")
        .eq("resultado", "fallo")
        .eq("ip", ip)
        .gte("ocurrido_en", desde)
        .or("detalle->>motivo.is.null,detalle->>motivo.neq.error_servicio");
      if (!error && (count ?? 0) >= LIMITE_IP) return rechazo(MSG_IP);
    }

    // 2. Resolver la cuenta
    let q = admin.from("profiles").select("user_id, email, estado, bloqueado_hasta, estado_cambiado_por");
    let valido = true;
    if (identificador.includes("@")) {
      if (await permiteCorreo()) {
        q = q.ilike("email", identificador.replace(/[\\%_]/g, (c) => `\\${c}`));
      } else valido = false;
    } else {
      const u = identificador.toLowerCase();
      if (/^[a-z0-9._-]{3,30}$/.test(u)) q = q.eq("username", u);
      else valido = false;
    }
    const { data: perfil } = valido ? await q.maybeSingle() : { data: null };

    if (!perfil?.user_id || !perfil.email) {
      await evento({ email: identificador.includes("@") ? identificador : null, resultado: "fallo", detalle: { motivo: "usuario_desconocido" } });
      return rechazo(MSG_GENERICO);
    }

    // 3. Suspensión temporal vigente: no se comprueba la contraseña ni se cuenta
    if (perfil.estado === "suspendido_temporal" && perfil.bloqueado_hasta && new Date(perfil.bloqueado_hasta) > new Date()) {
      const h = hora(perfil.bloqueado_hasta);
      return rechazo(
        perfil.estado_cambiado_por
          ? `Cuenta suspendida temporalmente hasta las ${h}.`
          : `Cuenta suspendida temporalmente hasta las ${h} por intentos fallidos.`,
      );
    }

    // 4. Comprobar la contraseña
    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sesion, error: sErr } = await anon.auth.signInWithPassword({ email: perfil.email, password });

    if (sErr || !sesion?.session) {
      const codigo = (sErr as any)?.code ?? null;
      const status = (sErr as any)?.status ?? null;
      if (codigo === "invalid_credentials") {
        const { data: r, error: rErr } = await admin.rpc("registrar_fallo_acceso", { _user_id: perfil.user_id, _origen: "login" });
        if (rErr) console.error("[iniciar-sesion] registrar_fallo_acceso", rErr.message);
        await evento({ user_id: perfil.user_id, email: perfil.email, resultado: "fallo", detalle: { motivo: "contrasena_incorrecta" } });
        const res = r as { suspendido?: boolean; hasta?: string } | null;
        if (res?.suspendido && res.hasta) {
          return rechazo(`Cuenta suspendida temporalmente hasta las ${hora(res.hasta)} por intentos fallidos.`);
        }
        return rechazo(MSG_GENERICO);
      }
      // Cualquier otro error: no cuenta como intento fallido
      console.error("[iniciar-sesion] error del servicio", status, codigo);
      await evento({
        user_id: perfil.user_id,
        email: perfil.email,
        resultado: "fallo",
        detalle: { motivo: "error_servicio", codigo: codigo ?? (status ? String(status) : "desconocido") },
      });
      return rechazo(status === 429 || codigo === "over_request_rate_limit" ? MSG_OCUPADO : MSG_ERROR);
    }

    // 5. Correcta pero bloqueada
    if (["bloqueado_admin", "bloqueado_intentos", "baja"].includes(perfil.estado)) {
      try { await admin.auth.admin.signOut(sesion.session.access_token); } catch { /* ya caducará */ }
      await evento({ user_id: perfil.user_id, email: perfil.email, resultado: "denegado", detalle: { motivo: "usuario_bloqueado", estado: perfil.estado } });
      return rechazo(MSG_BLOQUEADO);
    }

    // 6. Correcta y operativa
    const { error: eErr } = await admin.rpc("registrar_exito_acceso", { _user_id: perfil.user_id });
    if (eErr) console.error("[iniciar-sesion] registrar_exito_acceso", eErr.message);
    await evento({ user_id: perfil.user_id, email: perfil.email, resultado: "ok", detalle: {} });

    return json({
      ok: true,
      access_token: sesion.session.access_token,
      refresh_token: sesion.session.refresh_token,
    });
  } catch (err) {
    console.error("[iniciar-sesion] error:", err);
    return rechazo(MSG_ERROR);
  }
});
