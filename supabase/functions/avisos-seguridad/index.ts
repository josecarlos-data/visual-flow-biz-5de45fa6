import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailAPIError } from "npm:@lovable.dev/email-js@0.3.1";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";
import { LIMITE_IP, VENTANA_IP_MS } from "../_shared/limites-acceso.ts";

// Llamada solo por la tarea programada, con la cabecera x-avisos-token.
// No acepta datos de entrada: destinatario y plantilla salen del servidor.

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENLACE = "https://crmrimosa.josecarlossobrino.com/admin/auditoria";
const ESPERA_MS = 30 * 60 * 1000;
const MAX_LINEAS = 20;

const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const CLAVES_CONFIG = [
  "control_acceso_modo", "alta_dispositivo_modo", "control_sesiones_activo", "segundo_factor_modo",
  "sesion_duracion_horas", "acceso_permite_correo", "avisos_seguridad_activo", "avisos_seguridad_email",
  "registro_consultas_activo", "auditoria_retencion_dias", "consultas_retencion_dias",
];
const ESTADOS_SUSPENSION = ["suspendido_temporal", "bloqueado_intentos", "bloqueado_admin"];

type Ev = {
  id: string; ocurrido_en: string; user_id: string | null; email: string | null; tipo: string;
  resultado: string; entidad: string | null; entidad_id: string | null; detalle: any; ip: string | null;
};
type Linea = { cuando: string; texto: string; ip: string | null };
type Lote = { lineas: Linea[]; asunto: string; titulo: string; recuento: number; extraDest?: string[]; ultimo: string };

const r = (status: number) => new Response(null, { status });
const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const NOMBRE_CLAVE: Record<string, string> = {
  control_acceso_modo: "Modo de control de acceso", alta_dispositivo_modo: "Alta de equipos",
  control_sesiones_activo: "Sesiones simultáneas", segundo_factor_modo: "Segundo factor",
  sesion_duracion_horas: "Duración máxima de sesión (h)", acceso_permite_correo: "Acceso con correo",
  avisos_seguridad_activo: "Avisos de seguridad", avisos_seguridad_email: "Destinatario de avisos",
  registro_consultas_activo: "Registro de consultas",
  auditoria_retencion_dias: "Conservación de Auditoría (días)", consultas_retencion_dias: "Conservación de consultas (días)",
};
const NIVEL_2FA: Record<string, number> = { desactivado: 0, marcados: 1, activo: 2 };

function relaja(clave: string, antes: string | null, despues: string | null): boolean {
  if (antes === null || despues === null) return false;
  switch (clave) {
    case "control_acceso_modo": return antes === "bloqueo" && despues !== "bloqueo";
    case "alta_dispositivo_modo": return antes === "codigo" && despues !== "codigo";
    case "control_sesiones_activo": return antes === "true" && despues !== "true";
    case "acceso_permite_correo": return antes === "false" && despues === "true";
    case "segundo_factor_modo": return (NIVEL_2FA[despues] ?? 0) < (NIVEL_2FA[antes] ?? 0);
    case "sesion_duracion_horas": {
      const a = Number(antes), d = Number(despues);
      return d === 0 ? a !== 0 : a !== 0 && d > a;
    }
    case "avisos_seguridad_activo": return antes === "true" && despues !== "true";
    case "avisos_seguridad_email": return true;
    case "registro_consultas_activo": return antes === "true" && despues !== "true";
    case "auditoria_retencion_dias":
    case "consultas_retencion_dias": {
      const a = Number(antes), d = Number(despues);
      return Number.isFinite(a) && Number.isFinite(d) && d < a;
    }
  }
  return false;
}

async function nombres(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const m = new Map<string, string>();
  if (!unicos.length) return m;
  const { data } = await db.from("profiles").select("user_id, full_name, username, email").in("user_id", unicos);
  for (const p of data ?? []) {
    const base = p.full_name || p.email || p.user_id;
    m.set(p.user_id, p.username ? `${base} (${p.username})` : base);
  }
  return m;
}

async function eventos(tipos: string[], desde: string): Promise<Ev[]> {
  const { data, error } = await db.from("auditoria_eventos")
    .select("id, ocurrido_en, user_id, email, tipo, resultado, entidad, entidad_id, detalle, ip")
    .in("tipo", tipos).gt("ocurrido_en", desde).order("ocurrido_en", { ascending: true }).limit(1000);
  if (error) throw error;
  return (data ?? []) as Ev[];
}

async function estado(cat: string) {
  const { data } = await db.from("avisos_estado").select("cursor, ultimo_envio").eq("categoria", cat).maybeSingle();
  if (data) return data as { cursor: string; ultimo_envio: string | null };
  const nuevo = { categoria: cat, cursor: new Date().toISOString(), ultimo_envio: null };
  await db.from("avisos_estado").upsert(nuevo, { onConflict: "categoria", ignoreDuplicates: true });
  return { cursor: nuevo.cursor, ultimo_envio: null };
}

function plural(n: number, s: string, p: string) { return n === 1 ? `1 ${s}` : `${n} ${p}`; }

// ---------- Categorías ----------
async function loteSuspension(desde: string): Promise<Lote | null> {
  const evs = (await eventos(["suspension_automatica", "cambio_estado_usuario"], desde)).filter((e) =>
    e.tipo === "suspension_automatica" || ESTADOS_SUSPENSION.includes(e.detalle?.estado_nuevo));
  if (!evs.length) return null;
  const n = await nombres(evs.flatMap((e) => [e.entidad_id, e.user_id]));
  let sospechosas = 0;
  const lineas = evs.map((e) => {
    const quien = n.get(e.entidad_id ?? "") ?? e.detalle?.usuario ?? e.email ?? "usuario desconocido";
    if (e.tipo === "suspension_automatica") {
      const ciclo = Number(e.detalle?.ciclo ?? 0);
      if (ciclo >= 2) sospechosas++;
      return { cuando: cuando(e.ocurrido_en), ip: e.ip,
        texto: `${quien}: suspensión automática por intentos fallidos, ciclo ${ciclo}${ciclo >= 2 ? " — CUENTA SOSPECHOSA" : ""}` };
    }
    return { cuando: cuando(e.ocurrido_en), ip: e.ip,
      texto: `${quien}: estado cambiado a ${e.detalle?.estado_nuevo} por ${n.get(e.user_id ?? "") ?? "un administrador"}` };
  });
  return {
    lineas, recuento: evs.length, titulo: "Suspensiones de usuarios", ultimo: evs[evs.length - 1].ocurrido_en,
    asunto: `[CRM Rimosa] ${plural(evs.length, "suspensión", "suspensiones")}${sospechosas ? ` (${plural(sospechosas, "cuenta sospechosa", "cuentas sospechosas")})` : ""}`,
  };
}

async function loteIp(ultimoEnvio: string | null): Promise<Lote | null> {
  const ahora = Date.now();
  const desde = new Date(ahora - VENTANA_IP_MS).toISOString();
  const { data, error } = await db.from("auditoria_eventos").select("ip, ocurrido_en")
    .eq("tipo", "login").eq("resultado", "fallo").not("ip", "is", null).gte("ocurrido_en", desde)
    .or("detalle->>motivo.is.null,detalle->>motivo.neq.error_servicio").limit(5000);
  if (error) throw error;
  const porIp = new Map<string, { n: number; ultimo: string }>();
  for (const f of data ?? []) {
    const k = String(f.ip);
    const x = porIp.get(k) ?? { n: 0, ultimo: f.ocurrido_en };
    x.n++; if (f.ocurrido_en > x.ultimo) x.ultimo = f.ocurrido_en;
    porIp.set(k, x);
  }
  const marca = ultimoEnvio ?? "";
  const ips = [...porIp.entries()].filter(([, v]) => v.n >= LIMITE_IP && v.ultimo > marca);
  if (!ips.length) return null;
  return {
    recuento: ips.length, titulo: "Límite de intentos por conexión alcanzado",
    ultimo: new Date(ahora).toISOString(),
    asunto: `[CRM Rimosa] Límite de intentos alcanzado desde ${plural(ips.length, "conexión", "conexiones")}`,
    lineas: ips.map(([ip, v]) => ({ cuando: cuando(v.ultimo), ip,
      texto: `${v.n} contraseñas incorrectas en los últimos ${VENTANA_IP_MS / 60000} minutos; entradas bloqueadas desde esta conexión` })),
  };
}

async function loteConfig(desde: string): Promise<Lote | null> {
  const evs = (await eventos(["dato_cambio", "dato_alta"], desde)).filter((e) =>
    e.entidad === "app_settings" && CLAVES_CONFIG.includes(e.entidad_id ?? ""));
  if (!evs.length) return null;
  const n = await nombres(evs.map((e) => e.user_id));
  let relajadas = 0;
  const extra: string[] = [];
  const lineas = evs.map((e) => {
    const clave = e.entidad_id!;
    const antes = e.detalle?.antes ?? null, despues = e.detalle?.despues ?? null;
    const rel = relaja(clave, antes === null ? null : String(antes), despues === null ? null : String(despues));
    if (rel) relajadas++;
    if (clave === "avisos_seguridad_email" && typeof antes === "string" && antes.includes("@")) extra.push(antes);
    return { cuando: cuando(e.ocurrido_en), ip: e.ip,
      texto: `${NOMBRE_CLAVE[clave] ?? clave}: ${antes ?? "—"} → ${despues ?? "—"}, por ${n.get(e.user_id ?? "") ?? "el sistema"}${rel ? " — MEDIDA RELAJADA" : ""}` };
  });
  return {
    lineas, recuento: evs.length, extraDest: extra, titulo: "Cambios en la configuración de seguridad",
    ultimo: evs[evs.length - 1].ocurrido_en,
    asunto: `[CRM Rimosa] ${plural(evs.length, "cambio", "cambios")} de configuración de seguridad${relajadas ? " — MEDIDA RELAJADA" : ""}`,
  };
}

async function loteAdmin(desde: string): Promise<Lote | null> {
  const evs = (await eventos(["usuario_alta", "usuario_cambio"], desde)).filter((e) =>
    e.entidad === "user_roles" && e.detalle?.seguridad?.role?.despues === "admin");
  if (!evs.length) return null;
  const n = await nombres(evs.flatMap((e) => [e.entidad_id, e.user_id]));
  return {
    recuento: evs.length, titulo: "Nuevo administrador", ultimo: evs[evs.length - 1].ocurrido_en,
    asunto: `[CRM Rimosa] ${plural(evs.length, "usuario pasa", "usuarios pasan")} a ser administrador`,
    lineas: evs.map((e) => ({ cuando: cuando(e.ocurrido_en), ip: e.ip,
      texto: `${n.get(e.entidad_id ?? "") ?? e.entidad_id}: rol de administrador, asignado por ${n.get(e.user_id ?? "") ?? "el sistema"}` })),
  };
}

async function loteSimple(desde: string, tipo: string, titulo: string, s: string, p: string, verbo: string): Promise<Lote | null> {
  const evs = await eventos([tipo], desde);
  if (!evs.length) return null;
  const n = await nombres(evs.flatMap((e) => [e.entidad_id, e.user_id]));
  return {
    recuento: evs.length, titulo, ultimo: evs[evs.length - 1].ocurrido_en,
    asunto: `[CRM Rimosa] ${plural(evs.length, s, p)}`,
    lineas: evs.map((e) => ({ cuando: cuando(e.ocurrido_en), ip: e.ip,
      texto: `${n.get(e.entidad_id ?? "") ?? e.detalle?.usuario ?? e.entidad_id}: ${verbo} por ${n.get(e.user_id ?? "") ?? e.email ?? "un administrador"}` })),
  };
}

const CATEGORIAS: { cat: string; fn: (desde: string, ultimo: string | null) => Promise<Lote | null> }[] = [
  { cat: "suspension", fn: (d) => loteSuspension(d) },
  { cat: "limite_ip", fn: (_d, u) => loteIp(u) },
  { cat: "configuracion", fn: (d) => loteConfig(d) },
  { cat: "nuevo_admin", fn: (d) => loteAdmin(d) },
  { cat: "segundo_factor", fn: (d) => loteSimple(d, "2fa_reseteado", "Segundo factor restablecido", "segundo factor restablecido", "segundos factores restablecidos", "segundo factor restablecido") },
  { cat: "baja", fn: (d) => loteSimple(d, "baja_usuario", "Baja de usuarios", "baja de usuario", "bajas de usuario", "dado de baja") },
];

async function registrar(resultado: string, detalle: Record<string, unknown>) {
  await db.from("auditoria_eventos").insert({ tipo: "aviso_seguridad", resultado, entidad: "aviso", detalle });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return r(405);
  const token = req.headers.get("x-avisos-token") ?? "";
  if (!token) return r(401);
  const { data: valido, error: vErr } = await db.rpc("avisos_token_valido" as never, { _token: token } as never);
  if (vErr || valido !== true) return r(401);

  try {
    const ahora = new Date().toISOString();
    await db.from("avisos_estado").upsert({ categoria: "_latido", cursor: ahora }, { onConflict: "categoria" });

    const { data: ajustes } = await db.from("app_settings").select("key, value")
      .in("key", ["avisos_seguridad_activo", "avisos_seguridad_email"]);
    const a = new Map((ajustes ?? []).map((x) => [x.key, x.value]));
    const activo = (a.get("avisos_seguridad_activo") ?? "true") === "true";
    const destino = (a.get("avisos_seguridad_email") ?? "").trim();

    for (const { cat, fn } of CATEGORIAS) {
      // Con avisos apagados solo se procesa configuración, para avisar de que se han apagado.
      if (!activo && cat !== "configuracion") {
        // Apagados: se descarta lo ocurrido para no recibir todo de golpe al reactivarlos.
        await db.from("avisos_estado").upsert({ categoria: cat, cursor: ahora }, { onConflict: "categoria" });
        continue;
      }
      try {
        const st = await estado(cat);
        if (st.ultimo_envio && Date.now() - new Date(st.ultimo_envio).getTime() < ESPERA_MS) continue;
        const lote = await fn(st.cursor, st.ultimo_envio);
        if (!lote) continue;

        const destinatarios = [...new Set([destino, ...(lote.extraDest ?? [])].filter((d) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d)))];
        if (!destinatarios.length) {
          await registrar("fallo", { categoria: cat, recuento: lote.recuento, codigo: "sin_destinatario" });
          continue;
        }
        const templateData = {
          asunto: lote.asunto, titulo: lote.titulo, recuento: lote.recuento,
          lineas: lote.lineas.slice(0, MAX_LINEAS), restantes: Math.max(0, lote.lineas.length - MAX_LINEAS), enlace: ENLACE,
        };
        let avanzar = false;
        for (const to of destinatarios) {
          try {
            const res = await sendTemplateEmail("aviso-seguridad", to, {
              templateData, idempotencyKey: `avisos-${cat}-${st.cursor}-${to}`,
            });
            if (res.sent) {
              avanzar = true;
              await registrar("ok", { categoria: cat, recuento: lote.recuento, destinatario: to });
            } else {
              avanzar = true;
              await registrar("denegado", { categoria: cat, recuento: lote.recuento, destinatario: to, codigo: "destinatario_dado_de_baja" });
            }
          } catch (e) {
            const codigo = e instanceof EmailAPIError ? (e.code ?? String(e.status)) : "error_envio";
            console.error("[avisos-seguridad] envío", cat, codigo);
            await registrar("fallo", { categoria: cat, recuento: lote.recuento, destinatario: to, codigo });
          }
        }
        if (avanzar) {
          await db.from("avisos_estado").update({ cursor: lote.ultimo, ultimo_envio: new Date().toISOString() }).eq("categoria", cat);
        }
      } catch (e) {
        console.error("[avisos-seguridad] categoría", cat, e instanceof Error ? e.message : e);
      }
    }
    return r(204);
  } catch (e) {
    console.error("[avisos-seguridad] error", e instanceof Error ? e.message : e);
    return r(204);
  }
});
