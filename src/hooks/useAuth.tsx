import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { registrarEvento } from "@/lib/auditoria";
import { getDispositivoId, getSesionId, idEquipoCorto, limpiarSesionId } from "@/lib/dispositivo";
import { toast } from "@/hooks/use-toast";

type AppRole = Database["public"]["Enums"]["app_role"];

export type EstadoAcceso =
  | "cargando"
  | "sin_sesion"
  | "pendiente_aprobacion"
  | "pide_codigo"
  | "denegado"
  | "activo";

export interface DashboardItem {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  route: string;
  sort_order: number;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  isApproved: boolean;
  isLoading: boolean;
  authError: string | null;
  employeeCode: string | null;
  delegacion: string | null;
  verMargen: boolean;
  dashboards: DashboardItem[];
  hasDashboard: (key: string) => boolean;
  signOut: () => Promise<void>;
  /** Cuando es true, hay que pedir el código de alta antes de mostrar nada. */
  pideCodigoAlta: boolean;
  codigoError: string | null;
  enviarCodigoAlta: (codigo: string) => Promise<void>;
  idEquipo: string;
  /** Indica que la comprobación de control de equipo ya ha terminado. */
  controlListo: boolean;
  estadoAcceso: EstadoAcceso;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  isApproved: false,
  isLoading: true,
  authError: null,
  employeeCode: null,
  delegacion: null,
  verMargen: false,
  dashboards: [],
  hasDashboard: () => false,
  signOut: async () => {},
  pideCodigoAlta: false,
  codigoError: null,
  enviarCodigoAlta: async () => {},
  idEquipo: "",
  controlListo: false,
  estadoAcceso: "cargando",
});

const LIMITE_PASO_MS = 8000;
const VENCIDO = Symbol("vencido");

function conLimite<T>(p: Promise<T>, ms: number): Promise<T | typeof VENCIDO> {
  return Promise.race([p, new Promise<typeof VENCIDO>((r) => setTimeout(() => r(VENCIDO), ms))]);
}

interface DatosUsuario {
  error: string | null;
  isApproved: boolean;
  role: AppRole | null;
  employeeCode: string | null;
  delegacion: string | null;
  verMargen: boolean;
  dashboards: DashboardItem[];
}

/** Carga perfil, rol y dashboards. No escribe estado. */
async function cargarDatosUsuario(userId: string): Promise<DatosUsuario> {
  const vacio: DatosUsuario = {
    error: null, isApproved: false, role: null, employeeCode: null, delegacion: null, verMargen: false, dashboards: [],
  };
  try {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("is_approved, employee_code, delegacion, ver_margen").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);
    const role = roleRes.error ? null : ((roleRes.data?.role as AppRole) ?? null);
    if (roleRes.error) console.error("[Auth] Error fetching role:", roleRes.error);
    if (profileRes.error) {
      console.error("[Auth] Error fetching profile:", profileRes.error);
      return { ...vacio, role, error: profileRes.error.message };
    }
    const [catalogRes, accessRes] = await Promise.all([
      supabase
        .from("dashboards" as any)
        .select("key, name, description, icon, route, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      role === "admin"
        ? Promise.resolve({ data: null, error: null })
        : supabase.from("user_dashboard_access" as any).select("dashboard_key").eq("user_id", userId),
    ]);
    const catalog = ((catalogRes.data as any[]) ?? []) as DashboardItem[];
    let dashboards: DashboardItem[];
    if (role === "admin") {
      dashboards = catalog;
    } else {
      const allowed = new Set(((accessRes.data as any[]) ?? []).map((r) => r.dashboard_key));
      dashboards = catalog.filter((d) => allowed.has(d.key));
    }
    return {
      error: null,
      isApproved: profileRes.data?.is_approved ?? false,
      role,
      employeeCode: profileRes.data?.employee_code ?? null,
      delegacion: profileRes.data?.delegacion ?? null,
      verMargen: ((profileRes.data as any)?.ver_margen ?? false) || role === "admin",
      dashboards,
    };
  } catch (err) {
    console.error("[Auth] Error fetching user data:", err);
    return { ...vacio, error: err instanceof Error ? err.message : "Error de conexión" };
  }
}

type Veredicto = { estado: "activo" | "pide_codigo" | "denegado"; codigoError: string | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState<string | null>(null);
  const [delegacion, setDelegacion] = useState<string | null>(null);
  const [verMargen, setVerMargen] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardItem[]>([]);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso>("cargando");

  const generacion = useRef(0);
  const estadoRef = useRef<EstadoAcceso>("cargando");
  const sessionRef = useRef<Session | null>(null);
  const datosCargadosPara = useRef<string | null>(null);
  const intentosCodigo = useRef(0);
  const comprobandoSesion = useRef(false);
  const ultimoPathnameComprobado = useRef<string | null>(null);
  const idEquipo = typeof window !== "undefined" ? getDispositivoId() : "";
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const fijarSesion = (s: Session | null) => {
    sessionRef.current = s;
    setSession(s);
    setUser(s?.user ?? null);
  };

  // Evalúa el control de equipo. Emite eventos y avisos; devuelve el veredicto.
  const evaluarControl = async (codigo?: string): Promise<Veredicto> => {
    try {
      const { data, error } = await (supabase.rpc as any)("registrar_sesion", {
        _dispositivo_id: getDispositivoId(),
        _sesion_id: getSesionId(),
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        _codigo: codigo ?? null,
      });
      if (error) return { estado: "activo", codigoError: null };

      const res = (data ?? {}) as { permitido?: boolean; motivo?: string | null };
      const motivo = res.motivo ?? null;

      if (res.permitido !== false) {
        intentosCodigo.current = 0;
        if (motivo === "dispositivo_nuevo") {
          registrarEvento("dispositivo_alta", {
            detalle: { dispositivo_id: getDispositivoId(), con_codigo: !!codigo },
          });
          if (codigo) registrarEvento("codigo_usado", { detalle: { dispositivo_id: getDispositivoId() } });
        }
        return { estado: "activo", codigoError: null };
      }

      if (motivo === "codigo_requerido" || motivo === "codigo_invalido") {
        if (motivo === "codigo_invalido") {
          intentosCodigo.current += 1;
          registrarEvento("codigo_invalido", { resultado: "denegado", detalle: { dispositivo_id: getDispositivoId() } });
        }
        if (intentosCodigo.current >= 3) {
          toast({
            title: "Código no válido",
            description: "Has agotado los intentos. Pide un código nuevo al administrador.",
            variant: "destructive",
          });
          return { estado: "denegado", codigoError: null };
        }
        return {
          estado: "pide_codigo",
          codigoError: motivo === "codigo_invalido" ? "El código no es válido o ha caducado." : null,
        };
      }

      registrarEvento("dispositivo_denegado", {
        resultado: "denegado",
        detalle: { motivo, dispositivo_id: getDispositivoId() },
      });
      toast({
        title: "Equipo no autorizado",
        description: `Este equipo no está autorizado para entrar. Contacte con el administrador e indíquele el identificador de equipo ${idEquipoCorto(getDispositivoId())}.`,
        variant: "destructive",
      });
      return { estado: "denegado", codigoError: null };
    } catch {
      return { estado: "activo", codigoError: null }; // error de red: dejar pasar
    }
  };

  /** ÚNICA función que escribe estadoAcceso. */
  const resolverAcceso = async (s: Session | null, codigo?: string): Promise<void> => {
    const gen = ++generacion.current;
    const vigente = () => gen === generacion.current;
    const fijar = (e: EstadoAcceso) => {
      estadoRef.current = e;
      setEstadoAcceso(e);
    };

    if (!s?.user) {
      datosCargadosPara.current = null;
      intentosCodigo.current = 0;
      setRole(null);
      setAuthError(null);
      setEmployeeCode(null);
      setDelegacion(null);
      setVerMargen(false);
      setDashboards([]);
      setCodigoError(null);
      fijar("sin_sesion");
      return;
    }

    const userId = s.user.id;
    const reintentoCodigo = codigo !== undefined && datosCargadosPara.current === userId;

    if (!reintentoCodigo) {
      fijar("cargando");
      datosCargadosPara.current = null;
      const r = await conLimite(cargarDatosUsuario(userId), LIMITE_PASO_MS);
      if (!vigente()) return;
      if (r === VENCIDO) {
        setAuthError("No se ha podido cargar tu perfil. Recarga la página.");
        setRole(null);
        setDashboards([]);
        setVerMargen(false);
        fijar("pendiente_aprobacion");
        return;
      }
      setAuthError(r.error);
      setRole(r.role);
      setEmployeeCode(r.employeeCode);
      setDelegacion(r.delegacion);
      setVerMargen(r.verMargen);
      setDashboards(r.dashboards);
      if (r.error || !r.isApproved) {
        fijar("pendiente_aprobacion");
        return;
      }
      datosCargadosPara.current = userId;
    }

    const v = await conLimite(evaluarControl(codigo), LIMITE_PASO_MS);
    if (!vigente()) return;
    const veredicto: Veredicto = v === VENCIDO ? { estado: "activo", codigoError: null } : v;
    setCodigoError(veredicto.codigoError);
    fijar(veredicto.estado);
    if (veredicto.estado === "denegado") await cerrarSesionDenegada();
  };

  const limpiarEstadoLocal = () => {
    fijarSesion(null);
    ultimoPathnameComprobado.current = null;
    void resolverAcceso(null);
  };

  /** Cierre local tras denegación de acceso: sin evento 'logout' ni cerrar_sesion, y sin revocar la sesión en otros equipos. */
  const cerrarSesionDenegada = async () => {
    const uid = sessionRef.current?.user?.id ?? "";
    try {
      sessionStorage.removeItem(`auditoria_login_${uid}`);
    } catch {
      // ignorado
    }
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Sign out timeout")), 4000)),
      ]);
    } catch (err) {
      console.error("Error during local sign out:", err);
    } finally {
      limpiarEstadoLocal();
    }
  };

  const signOut = async () => {
    const email = sessionRef.current?.user?.email ?? null;
    const uid = sessionRef.current?.user?.id ?? "";
    try {
      await registrarEvento("logout", { resultado: "ok", email, esperar: true });
    } catch {
      // la auditoría no debe impedir el cierre de sesión
    }
    try {
      await (supabase.rpc as any)("cerrar_sesion", { _sesion_id: getSesionId() });
    } catch {
      // ignorado
    }
    try {
      sessionStorage.removeItem(`auditoria_login_${uid}`);
      limpiarSesionId();
    } catch {
      // ignorado
    }
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Sign out timeout")), 4000)),
      ]);
    } catch (err) {
      console.error("Error during sign out:", err);
    } finally {
      limpiarEstadoLocal();
    }
  };

  // Referencias estables para las funciones que usan los efectos.
  const fnRef = useRef({ resolverAcceso, signOut, limpiarEstadoLocal });
  fnRef.current = { resolverAcceso, signOut, limpiarEstadoLocal };

  const signOutEstable = useCallback(() => fnRef.current.signOut(), []);

  const enviarCodigoAlta = useCallback(async (codigo: string) => {
    setCodigoError(null);
    await fnRef.current.resolverAcceso(sessionRef.current, codigo.trim().toUpperCase());
  }, []);

  // ---- Disparadores de la cadena ----
  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!mounted) return;
        fijarSesion(s);
        void fnRef.current.resolverAcceso(s);
      })
      .catch(() => {
        if (mounted) void fnRef.current.resolverAcceso(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      const anteriorId = sessionRef.current?.user?.id ?? null;
      fijarSesion(s);

      if (event === "SIGNED_IN" && s?.user) {
        try {
          const marca = `auditoria_login_${s.user.id}`;
          if (!sessionStorage.getItem(marca)) {
            sessionStorage.setItem(marca, "1");
            registrarEvento("login", { resultado: "ok", email: s.user.email ?? null });
          }
        } catch {
          // sessionStorage no disponible
        }
        // Mismo usuario ya activo (p. ej. al volver a enfocar): no relanzar.
        if (estadoRef.current === "activo" && anteriorId === s.user.id) return;
      }

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // Diferido: llamar a Supabase dentro del callback provoca bloqueo.
        setTimeout(() => {
          if (mounted) void fnRef.current.resolverAcceso(s);
        }, 0);
      }
      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION: solo session/user.
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---- Vigilante de sesión (solo en 'activo') ----
  const comprobarSesion = useCallback(async () => {
    if (estadoRef.current !== "activo") return;
    if (comprobandoSesion.current) return;
    comprobandoSesion.current = true;
    const gen = generacion.current;
    try {
      const { data, error } = await (supabase.rpc as any)("verificar_sesion", { _sesion_id: getSesionId() });
      if (error) return;
      if (gen !== generacion.current || estadoRef.current !== "activo") return;
      const vigente = ((data ?? {}) as { vigente?: boolean }).vigente !== false;
      if (vigente) return;
      registrarEvento("sesion_expulsada", { resultado: "denegado", detalle: { dispositivo_id: getDispositivoId() } });
      toast({
        title: "Sesión cerrada",
        description: "Se ha iniciado sesión en otro equipo, por lo que esta sesión se ha cerrado.",
        variant: "destructive",
      });
      // Cierre LOCAL: un signOut global revocaría el token también en la sesión ganadora.
      try {
        sessionStorage.removeItem(`auditoria_login_${sessionRef.current?.user?.id ?? ""}`);
        limpiarSesionId();
      } catch {
        // ignorado
      }
      try {
        await Promise.race([
          supabase.auth.signOut({ scope: "local" }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Sign out timeout")), 4000)),
        ]);
      } catch (err) {
        console.error("Error during local sign out:", err);
      } finally {
        fnRef.current.limpiarEstadoLocal();
      }
    } catch {
      // error de red: no hacemos nada
    } finally {
      comprobandoSesion.current = false;
    }
  }, []);

  // Efecto A: arranca/desmonta el vigilante.
  useEffect(() => {
    if (estadoAcceso !== "activo") {
      ultimoPathnameComprobado.current = null;
      return;
    }
    ultimoPathnameComprobado.current = pathnameRef.current;
    const intervalo = setInterval(() => void comprobarSesion(), 20000);
    const alEnfocar = () => void comprobarSesion();
    const alVisibilidad = () => {
      if (document.visibilityState === "visible") void comprobarSesion();
    };
    window.addEventListener("focus", alEnfocar);
    document.addEventListener("visibilitychange", alVisibilidad);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("focus", alEnfocar);
      document.removeEventListener("visibilitychange", alVisibilidad);
    };
  }, [estadoAcceso, comprobarSesion]);

  // Efecto B: comprobación al cambiar de sección.
  useEffect(() => {
    if (estadoAcceso !== "activo") return;
    if (ultimoPathnameComprobado.current === null) return;
    if (ultimoPathnameComprobado.current === location.pathname) return;
    ultimoPathnameComprobado.current = location.pathname;
    void comprobarSesion();
  }, [location.pathname, estadoAcceso, comprobarSesion]);

  const hasDashboard = (key: string) => role === "admin" || dashboards.some((d) => d.key === key);

  const isLoading = estadoAcceso === "cargando";
  const controlListo = estadoAcceso !== "cargando";
  const pideCodigoAlta = estadoAcceso === "pide_codigo";
  const isApproved = estadoAcceso === "pide_codigo" || estadoAcceso === "denegado" || estadoAcceso === "activo";

  return (
    <AuthContext.Provider
      value={{
        session, user, role, isApproved, isLoading, authError, employeeCode, delegacion, verMargen, dashboards,
        hasDashboard, signOut: signOutEstable, pideCodigoAlta, codigoError, enviarCodigoAlta, idEquipo, controlListo,
        estadoAcceso,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
