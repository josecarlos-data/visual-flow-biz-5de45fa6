import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { registrarEvento } from "@/lib/auditoria";
import { getDispositivoId, getSesionId, idEquipoCorto, limpiarSesionId } from "@/lib/dispositivo";
import { toast } from "@/hooks/use-toast";

type AppRole = Database["public"]["Enums"]["app_role"];

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
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState<string | null>(null);
  const [delegacion, setDelegacion] = useState<string | null>(null);
  const [verMargen, setVerMargen] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardItem[]>([]);
  const [pideCodigoAlta, setPideCodigoAlta] = useState(false);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [controlListo, setControlListo] = useState(false);
  const intentosCodigo = useRef(0);
  const controlHechoPara = useRef<string | null>(null);
  const comprobandoSesion = useRef(false);
  const idEquipo = typeof window !== "undefined" ? getDispositivoId() : "";
  const location = useLocation();


  const fetchUserData = async (userId: string) => {
    try {
      if (import.meta.env.DEV) console.log("[Auth] Fetching user data for:", userId);
      
      const [profileRes, roleRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("is_approved, employee_code, delegacion, ver_margen")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (import.meta.env.DEV) console.log("[Auth] Profile result:", JSON.stringify(profileRes));
      if (import.meta.env.DEV) console.log("[Auth] Role result:", JSON.stringify(roleRes));

      if (profileRes.error) {
        console.error("[Auth] Error fetching profile:", profileRes.error);
        setAuthError(profileRes.error.message);
        setIsApproved(false);
        setEmployeeCode(null);
        setDelegacion(null);
      } else {
        setAuthError(null);
        setIsApproved(profileRes.data?.is_approved ?? false);
        setEmployeeCode(profileRes.data?.employee_code ?? null);
        setDelegacion(profileRes.data?.delegacion ?? null);
        setVerMargen(((profileRes.data as any)?.ver_margen ?? false) || (roleRes.data?.role as AppRole) === "admin");
      }

      if (roleRes.error) {
        console.error("[Auth] Error fetching role:", roleRes.error);
        setRole(null);
      } else {
        setRole((roleRes.data?.role as AppRole) ?? null);
      }

      // Fetch dashboards: catalog + user assignments
      const userRole = (roleRes.data?.role as AppRole) ?? null;
      const [catalogRes, accessRes] = await Promise.all([
        supabase
          .from("dashboards" as any)
          .select("key, name, description, icon, route, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        userRole === "admin"
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from("user_dashboard_access" as any)
              .select("dashboard_key")
              .eq("user_id", userId),
      ]);

      const catalog = ((catalogRes.data as any[]) ?? []) as DashboardItem[];
      if (userRole === "admin") {
        setDashboards(catalog);
      } else {
        const allowed = new Set(((accessRes.data as any[]) ?? []).map((r) => r.dashboard_key));
        setDashboards(catalog.filter((d) => allowed.has(d.key)));
      }
    } catch (err) {
      console.error("[Auth] Error fetching user data:", err);
      setAuthError(err instanceof Error ? err.message : "Error de conexión");
      setIsApproved(false);
      setRole(null);
      setDashboards([]);
      setVerMargen(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (import.meta.env.DEV) console.log("[Auth] Initial session:", session?.user?.id ?? "none");
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      if (mounted) setIsLoading(false);
    }).catch(() => {
      if (mounted) setIsLoading(false);
    });

    // Then listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        if (import.meta.env.DEV) console.log("[Auth] Auth state change:", _event, session?.user?.id ?? "none");
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Registrar como máximo un 'login' por sesión de navegador
          if (_event === "SIGNED_IN") {
            try {
              const marca = `auditoria_login_${session.user.id}`;
              if (!sessionStorage.getItem(marca)) {
                sessionStorage.setItem(marca, "1");
                registrarEvento("login", { resultado: "ok", email: session.user.email ?? null });
              }
            } catch {
              // sessionStorage no disponible: no registramos
            }
          }
          // Defer Supabase calls to avoid deadlock inside onAuthStateChange
          setTimeout(async () => {
            if (!mounted) return;
            await fetchUserData(session.user.id);
            if (mounted) setIsLoading(false);
          }, 0);
        } else {
          setRole(null);
          setIsApproved(false);
          setIsLoading(false);
        }
      }
    );

    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await registrarEvento("logout", { resultado: "ok", email: user?.email ?? null, esperar: true });
    } catch {
      // la auditoría no debe impedir el cierre de sesión
    }
    try {
      await (supabase.rpc as any)("cerrar_sesion", { _sesion_id: getSesionId() });
    } catch {
      // ignorado: el cierre de sesión debe ocurrir igualmente
    }
    try {
      sessionStorage.removeItem(`auditoria_login_${user?.id ?? ""}`);
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
      setSession(null);
      setUser(null);
      setRole(null);
      setIsApproved(false);
      setDashboards([]);
      setVerMargen(false);
      setIsLoading(false);
      setPideCodigoAlta(false);
      setCodigoError(null);
      setControlListo(false);
      intentosCodigo.current = 0;
      controlHechoPara.current = null;
    }
  }, [user]);

  // ---- Control de equipos y sesiones ----
  const evaluarControl = useCallback(
    async (codigo?: string) => {
      try {
        const { data, error } = await (supabase.rpc as any)("registrar_sesion", {
          _dispositivo_id: getDispositivoId(),
          _sesion_id: getSesionId(),
          _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          _codigo: codigo ?? null,
        });
        if (error) return true; // ante error, dejar pasar

        const res = (data ?? {}) as { permitido?: boolean; motivo?: string | null };
        const motivo = res.motivo ?? null;
        const permitido = res.permitido !== false;

        if (permitido) {
          setPideCodigoAlta(false);
          setCodigoError(null);
          intentosCodigo.current = 0;
          if (motivo === "dispositivo_nuevo") {
            registrarEvento("dispositivo_alta", {
              detalle: { dispositivo_id: getDispositivoId(), con_codigo: !!codigo },
            });
            if (codigo) {
              registrarEvento("codigo_usado", { detalle: { dispositivo_id: getDispositivoId() } });
            }
          }
          return true;
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
            await signOut();
            return false;
          }
          setPideCodigoAlta(true);
          setCodigoError(motivo === "codigo_invalido" ? "El código no es válido o ha caducado." : null);
          return false;
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
        await signOut();
        return false;
      } catch {
        return true; // ante error de red, dejar pasar
      } finally {
        setControlListo(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const enviarCodigoAlta = async (codigo: string) => {
    setCodigoError(null);
    await evaluarControl(codigo.trim().toUpperCase());
  };

  useEffect(() => {
    if (!user || !isApproved) return;
    if (controlHechoPara.current === user.id) return;
    controlHechoPara.current = user.id;
    void evaluarControl();
  }, [user, isApproved, evaluarControl]);

  const comprobarSesion = useCallback(async () => {
    if (comprobandoSesion.current) return;
    comprobandoSesion.current = true;
    try {
      const { data, error } = await (supabase.rpc as any)("verificar_sesion", { _sesion_id: getSesionId() });
      if (error) return;
      const vigente = ((data ?? {}) as { vigente?: boolean }).vigente !== false;
      if (!vigente) {
        registrarEvento("sesion_expulsada", { resultado: "denegado", detalle: { dispositivo_id: getDispositivoId() } });
        toast({
          title: "Sesión cerrada",
          description: "Se ha iniciado sesión en otro equipo, por lo que esta sesión se ha cerrado.",
          variant: "destructive",
        });
        await signOut();
      }
    } catch {
      // ante error de red, no hacemos nada
    } finally {
      comprobandoSesion.current = false;
    }
  }, [signOut]);

  useEffect(() => {
    if (!user || !isApproved) {
      setControlListo(true);
      return;
    }
    if (controlHechoPara.current === user.id) return;
    setControlListo(false);
  }, [user, isApproved]);

  useEffect(() => {
    if (!user || !isApproved || pideCodigoAlta) return;

    const intervalo = setInterval(comprobarSesion, 20000);
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
  }, [user, isApproved, pideCodigoAlta, comprobarSesion]);

  useEffect(() => {
    if (!user || !isApproved || pideCodigoAlta) return;
    void comprobarSesion();
  }, [location.pathname, user, isApproved, pideCodigoAlta, comprobarSesion]);

  const hasDashboard = (key: string) => role === "admin" || dashboards.some((d) => d.key === key);

  return (
    <AuthContext.Provider value={{ session, user, role, isApproved, isLoading, authError, employeeCode, delegacion, verMargen, dashboards, hasDashboard, signOut, pideCodigoAlta, codigoError, enviarCodigoAlta, idEquipo, controlListo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
