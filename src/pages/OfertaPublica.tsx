import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText } from "lucide-react";
import type { AdjuntoOferta } from "@/lib/ofertas";

type Resp =
  | { estado: "no_disponible" | "vencida" }
  | { estado: "vigente"; titulo: string; descripcion: string | null; vigente_hasta: string | null; adjuntos: AdjuntoOferta[] };

export default function OfertaPublica() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Resp | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: r, error } = await supabase.rpc("oferta_publica", { _token: token });
      const resp = (error ? { estado: "no_disponible" } : r) as Resp;
      setData(resp);
      if (resp.estado === "vigente" && resp.adjuntos?.length) {
        const out: Record<string, string> = {};
        for (const a of resp.adjuntos) {
          const { data: s } = await supabase.storage.from("ofertas-publicas").createSignedUrl(a.path, 3600);
          if (s?.signedUrl) out[a.path] = s.signedUrl;
        }
        setUrls(out);
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/30 p-4 sm:p-8">
      <Card className="w-full max-w-xl">
        {!data ? (
          <CardContent className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent>
        ) : data.estado !== "vigente" ? (
          <CardContent className="py-12 text-center text-lg font-medium">
            {data.estado === "vencida" ? "Esta oferta ha vencido" : "Oferta no disponible"}
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">RIMOSA</p>
              <CardTitle className="text-2xl">{data.titulo}</CardTitle>
              {data.vigente_hasta && (
                <p className="text-sm text-muted-foreground">
                  Válida hasta el {new Date(`${data.vigente_hasta}T00:00:00`).toLocaleDateString("es-ES")}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {data.descripcion && <p className="whitespace-pre-line">{data.descripcion}</p>}
              {data.adjuntos.map((a) =>
                a.tipo.startsWith("image/") && urls[a.path] ? (
                  <img key={a.path} src={urls[a.path]} alt={a.nombre} className="w-full rounded-md border" />
                ) : (
                  <a key={a.path} href={urls[a.path]} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted">
                    <FileText className="h-4 w-4" /> {a.nombre}
                  </a>
                ),
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
