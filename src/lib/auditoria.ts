import { supabase } from "@/integrations/supabase/client";

export type TipoEvento =
  | "login"
  | "logout"
  | "acceso_denegado"
  | "cambio_rol"
  | "aprobacion_usuario"
  | "baja_usuario"
  | "cambio_ver_margen";

export type ResultadoEvento = "ok" | "denegado" | "fallo";

export interface OpcionesEvento {
  resultado?: ResultadoEvento;
  email?: string | null;
  entidad?: string | null;
  entidad_id?: string | null;
  ruta?: string | null;
  detalle?: Record<string, unknown> | null;
}

/**
 * Registra un evento de auditoría en modo "dispara y olvida".
 * Nunca bloquea la UI ni propaga errores: si falla, la app sigue funcionando.
 */
export async function registrarEvento(tipo: TipoEvento, opts: OpcionesEvento = {}): Promise<void> {
  try {
    const body = {
      tipo,
      resultado: opts.resultado ?? "ok",
      email: opts.email ?? undefined,
      entidad: opts.entidad ?? undefined,
      entidad_id: opts.entidad_id ?? undefined,
      ruta: opts.ruta ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      detalle: opts.detalle ?? undefined,
    };
    void supabase.functions.invoke("registrar-evento", { body }).catch(() => {});
  } catch {
    // silencio intencionado
  }
}
