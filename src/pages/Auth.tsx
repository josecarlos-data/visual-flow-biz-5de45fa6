import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { BarChart3 } from "lucide-react";

export default function Auth() {
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [permiteCorreo, setPermiteCorreo] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.functions
      .invoke("iniciar-sesion", { body: { accion: "config" } })
      .then(({ data }) => {
        if (data && typeof data.permite_correo === "boolean") setPermiteCorreo(data.permite_correo);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("iniciar-sesion", {
        body: { identificador: identificador.trim(), password },
      });
      if (error || !data?.ok || !data.access_token || !data.refresh_token) {
        toast({
          title: "Error al iniciar sesión",
          description: data?.mensaje ?? "No se ha podido iniciar sesión. Inténtalo de nuevo.",
          variant: "destructive",
        });
        return;
      }
      const { error: sErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sErr) {
        toast({ title: "Error al iniciar sesión", description: "No se ha podido iniciar sesión. Inténtalo de nuevo.", variant: "destructive" });
        return;
      }
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <BarChart3 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">CRM Rimosa</CardTitle>
          <CardDescription>Inicia sesión para acceder</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identificador">{permiteCorreo ? "Usuario o correo" : "Usuario"}</Label>
              <Input
                id="identificador"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                required
                placeholder={permiteCorreo ? "usuario o tu@email.com" : "usuario"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : "Iniciar Sesión"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
