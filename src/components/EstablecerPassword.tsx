import { useAuth, type ModoPassword } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { KeyRound } from "lucide-react";
import FormularioPassword from "@/components/FormularioPassword";

/** Pantalla bloqueante: no se muestra nada del CRM hasta establecer contraseña. */
export default function EstablecerPassword({ modo }: { modo: ModoPassword }) {
  const { signOut, passwordGuardada } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <KeyRound className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Establece tu contraseña</CardTitle>
          <CardDescription>
            {modo === "recuperacion"
              ? "Elige una contraseña nueva para tu cuenta."
              : "El administrador ha pedido que cambies tu contraseña antes de continuar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormularioPassword
            modo={modo}
            onExito={async () => {
              toast({ title: "Contraseña guardada" });
              await passwordGuardada();
            }}
          />
          <Button variant="ghost" className="w-full" onClick={signOut}>Cerrar sesión</Button>
        </CardContent>
      </Card>
    </div>
  );
}
