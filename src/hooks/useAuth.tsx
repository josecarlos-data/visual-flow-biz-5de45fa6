import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

  const signOut = async () => {
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
    }
  };

  const hasDashboard = (key: string) => role === "admin" || dashboards.some((d) => d.key === key);

  return (
    <AuthContext.Provider value={{ session, user, role, isApproved, isLoading, authError, employeeCode, delegacion, verMargen, dashboards, hasDashboard, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
