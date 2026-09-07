import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TIPOS_PERMITIDOS = [
  "login",
  "logout",
  "acceso_denegado",
  "cambio_rol",
  "aprobacion_usuario",
  "baja_usuario",
  "cambio_ver_margen",
] as const;

const RESULTADOS = ["ok", "denegado", "fallo"];

const sinContenido = () => new Response(null, { status: 204, headers: corsHeaders });

const texto = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      return sinContenido();
    }

    const tipo = texto(body.tipo, 60);
    const resultado = texto(body.resultado, 20);
    if (!tipo || !resultado) return sinContenido();
    if (!(TIPOS_PERMITIDOS as readonly string[]).includes(tipo)) return sinContenido();
    if (!RESULTADOS.includes(resultado)) return sinContenido();

    // Identidad: solo desde el token, nunca desde el cuerpo
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const cliente = createClient(url, serviceKey);
      const { data, error } = await cliente.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!error && data?.user) userId = data.user.id;
    }
    const autenticado = userId !== null;

    // Sin sesión válida solo se acepta un login fallido
    if (!autenticado && !(tipo === "login" && resultado === "fallo")) {
      return sinContenido();
    }

    const xff = req.headers.get("x-forwarded-for");
    const partes = (xff ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const ip = partes.length ? partes[partes.length - 1] : null;

    const detalleCliente =
      body.detalle && typeof body.detalle === "object" && !Array.isArray(body.detalle)
        ? (body.detalle as Record<string, unknown>)
        : {};

    const detalle = {
      ...detalleCliente,
      autenticado,
      x_forwarded_for: xff ?? null,
    };

    const admin = createClient(url, serviceKey);
    await admin.from("auditoria_eventos").insert({
      user_id: userId,
      email: texto(body.email, 320),
      tipo,
      resultado,
      entidad: texto(body.entidad, 60),
      entidad_id: texto(body.entidad_id, 120),
      ruta: texto(body.ruta, 300),
      detalle,
      ip,
      user_agent: texto(req.headers.get("user-agent"), 500),
      dispositivo_id: null,
    });

    return sinContenido();
  } catch (err) {
    console.error("[registrar-evento] error:", err);
    return sinContenido();
  }
});
