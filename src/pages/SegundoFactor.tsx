import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import { registrarEvento } from "@/lib/auditoria";

interface Props {
  modo: "alta" | "verificar";
}

export default function SegundoFactor({ modo }: Props) {
  const { signOut, segundoFactorListo } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      try {
        const { data: lista, error: lErr } = await supabase.auth.mfa.listFactors();
        if (lErr) throw lErr;
        if (modo === "verificar") {
          const f = lista?.totp?.[0];
          if (!f) throw new Error("sin_factor");
          setFactorId(f.id);
        } else {
          // Quita altas a medias de intentos anteriores antes de crear una nueva
          for (const f of lista?.all ?? []) {
            if (f.factor_type === "totp" && f.status !== "verified") {
              await supabase.auth.mfa.unenroll({ factorId: f.id });
            }
          }
          const { data, error: eErr } = await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: `CRM ${new Date().toISOString().slice(0, 16)}`,
          });
          if (eErr || !data) throw eErr ?? new Error("enroll");
          setFactorId(data.id);
          setQr(data.totp.qr_code);
          setSecreto(data.totp.secret);
        }
      } catch {
        setError("No se ha podido preparar el segundo factor. Recarga la página.");
      } finally {
        setPreparando(false);
      }
    })();
  }, [modo]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || codigo.length !== 6) return;
    setEnviando(true);
    setError(null);
    const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (vErr) {
      registrarEvento("2fa_fallido", { resultado: "fallo", detalle: { modo } });
      setError("Código incorrecto. Comprueba la hora del móvil y prueba con el código actual.");
      setCodigo("");
      setEnviando(false);
      return;
    }
    registrarEvento(modo === "alta" ? "2fa_alta" : "2fa_verificado", { detalle: { factor_id: factorId } });
    await segundoFactorListo();
    setEnviando(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <KeyRound className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{modo === "alta" ? "Configura el segundo factor" : "Segundo factor"}</CardTitle>
          <CardDescription>
            {modo === "alta"
              ? "Escanea el código con Microsoft Authenticator o Google Authenticator"
              : "Introduce el código de 6 dígitos de tu aplicación de autenticación."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {modo === "alta" && qr && (
            <div className="space-y-2 text-center">
              <img src={qr} alt="Código QR del segundo factor" className="mx-auto h-48 w-48 rounded-md bg-background p-2" />
              {secreto && (
                <p className="text-xs text-muted-foreground">
                  Si no puedes escanearlo, teclea esta clave:
                  <span className="mt-1 block break-all font-mono text-sm text-foreground">{secreto}</span>
                </p>
              )}
            </div>
          )}
          <form onSubmit={enviar} className="space-y-4">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={preparando || !factorId}
              className="text-center font-mono text-2xl tracking-[0.4em]"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={enviando || preparando || codigo.length !== 6}>
              {enviando ? "Comprobando..." : modo === "alta" ? "Confirmar" : "Verificar"}
            </Button>
          </form>
          <Button variant="ghost" className="w-full text-xs" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
