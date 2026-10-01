import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import FormularioPassword from "@/components/FormularioPassword";

export default function CambiarPassword() {
  return (
    <div className="mx-auto w-full max-w-md p-4">
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Mínimo 12 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioPassword modo="voluntario" onExito={() => { toast({ title: "Contraseña cambiada" }); }} />
        </CardContent>
      </Card>
    </div>
  );
}
