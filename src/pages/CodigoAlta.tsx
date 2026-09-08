import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { idEquipoCorto } from "@/lib/dispositivo";

export default function CodigoAlta() {
  const { enviarCodigoAlta, codigoError, signOut, idEquipo } = useAuth();
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.trim().length < 8) return;
    setEnviando(true);
    await enviarCodigoAlta(codigo);
    setEnviando(false);
    setCodigo("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Equipo nuevo</CardTitle>
          <CardDescription>
            Este equipo aún no está dado de alta. Pide al administrador un código de alta e introdúcelo aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="XXXXXXXX"
              autoFocus
              inputMode="text"
              autoCapitalize="characters"
              className="text-center text-2xl font-mono tracking-[0.4em]"
            />
            {codigoError && <p className="text-sm text-destructive">{codigoError}</p>}
            <Button type="submit" className="w-full" disabled={enviando || codigo.trim().length < 8}>
              {enviando ? "Comprobando..." : "Dar de alta este equipo"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Identificador de equipo: <span className="font-mono">{idEquipoCorto(idEquipo)}</span>
          </p>
          <Button variant="ghost" className="mt-2 w-full text-xs" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
