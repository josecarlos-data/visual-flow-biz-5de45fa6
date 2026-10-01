import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ModoCambio = "voluntario" | "forzado" | "recuperacion";
const MIN = 12;

const MENSAJES: Record<string, string> = {
  filtrada: "Esta contraseña aparece en filtraciones públicas de datos. Elige otra distinta.",
  debil: "La contraseña es demasiado débil. Prueba con una frase más larga.",
  igual: "La nueva contraseña debe ser distinta de la anterior.",
  sesion: "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.",
  actual_incorrecta: "La contraseña actual no es correcta.",
  corta: `La contraseña debe tener al menos ${MIN} caracteres.`,
  modo_invalido: "No se puede cambiar la contraseña de esta forma. Vuelve a iniciar sesión.",
  error: "No se ha podido cambiar la contraseña. Inténtalo de nuevo.",
};

async function codigoDeError(error: any, data: any): Promise<string> {
  if (data?.codigo) return data.codigo;
  try {
    const body = await error?.context?.json?.();
    if (body?.codigo) return body.codigo;
  } catch {
    // ignorado
  }
  return "error";
}

export default function FormularioPassword({ modo, onExito }: { modo: ModoCambio; onExito: () => void | Promise<void> }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const largo = nueva.length >= MIN;
  const coinciden = nueva.length > 0 && nueva === repetir;
  const pideActual = modo !== "recuperacion";
  const valido = largo && coinciden && (!pideActual || actual.length > 0);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("cambiar-password", {
        body: { modo, password: nueva, actual: pideActual ? actual : undefined },
      });
      if (err || !data?.ok) {
        setError(MENSAJES[await codigoDeError(err, data)] ?? MENSAJES.error);
        return;
      }
      setActual("");
      setNueva("");
      setRepetir("");
      await onExito();
    } catch {
      setError(MENSAJES.error);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      {pideActual && (
        <div className="space-y-2">
          <Label htmlFor="pw-actual">Contraseña actual</Label>
          <Input id="pw-actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="pw-nueva">Nueva contraseña</Label>
        <Input id="pw-nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <p className={`text-xs ${largo ? "text-primary" : "text-muted-foreground"}`}>
          {nueva.length} / {MIN} caracteres mínimo
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-repetir">Repite la nueva contraseña</Label>
        <Input id="pw-repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        {repetir.length > 0 && !coinciden && <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Usa una frase de varias palabras; es más segura y más fácil de recordar que una contraseña corta con símbolos.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={!valido || guardando}>
        {guardando ? "Guardando..." : "Guardar contraseña"}
      </Button>
    </form>
  );
}
