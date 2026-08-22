import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import LoadingScreen from "@/components/LoadingScreen";
import Auth from "./pages/Auth";
import PendingApproval from "./pages/PendingApproval";
import Ventas from "./pages/Ventas";
import Dashboard from "./pages/Dashboard";

import Clientes from "./pages/Clientes";
import ClienteDetalle from "./pages/ClienteDetalle";
import Visitas from "./pages/Visitas";
import NuevaVisita from "./pages/NuevaVisita";
import Agenda from "./pages/Agenda";
import Rutas from "./pages/Rutas";
import RutaDetalle from "./pages/RutaDetalle";
import AdminUsers from "./pages/AdminUsers";
import AdminData from "./pages/AdminData";
import AdminFunctions from "./pages/AdminFunctions";
import AdminVisitas from "./pages/AdminVisitas";
import RevisionVisitas from "./pages/RevisionVisitas";
import AdminSituaciones from "./pages/AdminSituaciones";
import AdminObjetivos from "./pages/AdminObjetivos";
import Objetivos from "./pages/Objetivos";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthErrorScreen({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold">No se pudo cargar tu perfil</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Ha ocurrido un error de conexión o de permisos al validar tu cuenta. No es un problema de aprobación.
        </p>
        <p className="mb-4 break-words rounded bg-muted p-2 text-xs text-muted-foreground">{message}</p>
        <div className="flex justify-center gap-2">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({
  children,
  adminOnly = false,
  allowedRoles,
  dashboardKey,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  allowedRoles?: string[];
  dashboardKey?: string;
}) {
  const { user, isApproved, role, isLoading, hasDashboard, dashboards, authError, signOut } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (authError) return <AuthErrorScreen message={authError} onSignOut={signOut} />;
  if (!isApproved) return <Navigate to="/pending" replace />;
  if (adminOnly && role !== "admin" && !(allowedRoles ?? []).includes(role ?? "")) {
    return <Navigate to="/" replace />;
  }
  if (dashboardKey && !hasDashboard(dashboardKey)) {
    // Fallback to first available dashboard, or pending if none
    const fallback = dashboards[0]?.route;
    return <Navigate to={fallback && fallback !== `/${dashboardKey}` ? fallback : "/"} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isApproved, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (user && isApproved) return <Navigate to="/" replace />;
  if (user && !isApproved) return <Navigate to="/pending" replace />;

  return <>{children}</>;
}

function PendingRoute({ children }: { children: React.ReactNode }) {
  const { user, isApproved, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isApproved) return <Navigate to="/" replace />;

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/register" element={<Navigate to="/auth" replace />} />
            <Route path="/auth/register" element={<Navigate to="/auth" replace />} />
            <Route path="/pending" element={<PendingRoute><PendingApproval /></PendingRoute>} />
            <Route path="/" element={<ProtectedRoute dashboardKey="ventas"><Ventas /></ProtectedRoute>} />
            <Route path="/ventas-historico" element={<ProtectedRoute dashboardKey="ventas"><Dashboard /></ProtectedRoute>} />
            <Route path="/compras" element={<ProtectedRoute dashboardKey="compras"><Compras /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute dashboardKey="clientes"><Clientes /></ProtectedRoute>} />
            <Route path="/clientes/:cod" element={<ProtectedRoute dashboardKey="clientes"><ClienteDetalle /></ProtectedRoute>} />
            <Route path="/visitas" element={<ProtectedRoute dashboardKey="visitas"><Visitas /></ProtectedRoute>} />
            <Route path="/visitas/nueva" element={<ProtectedRoute dashboardKey="visitas"><NuevaVisita /></ProtectedRoute>} />
            <Route path="/visitas/revision" element={<ProtectedRoute dashboardKey="visitas"><RevisionVisitas /></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute dashboardKey="agenda"><Agenda /></ProtectedRoute>} />
            <Route path="/rutas" element={<ProtectedRoute dashboardKey="rutas"><Rutas /></ProtectedRoute>} />
            <Route path="/rutas/:codigo" element={<ProtectedRoute dashboardKey="rutas"><RutaDetalle /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/data" element={<ProtectedRoute adminOnly><AdminData /></ProtectedRoute>} />
            <Route path="/admin/functions" element={<ProtectedRoute adminOnly><AdminFunctions /></ProtectedRoute>} />
            <Route path="/admin/visitas" element={<ProtectedRoute adminOnly><AdminVisitas /></ProtectedRoute>} />
            <Route path="/admin/situaciones" element={<ProtectedRoute adminOnly><AdminSituaciones /></ProtectedRoute>} />
            <Route path="/admin/objetivos" element={<ProtectedRoute adminOnly allowedRoles={["director_comercial"]}><AdminObjetivos /></ProtectedRoute>} />
            <Route path="/objetivos" element={<ProtectedRoute dashboardKey="objetivos"><Objetivos /></ProtectedRoute>} />



            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
