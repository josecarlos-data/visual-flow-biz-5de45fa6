import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const PESTANAS: Record<string, string> = {
  resumen: "Resumen", visitas: "Visitas", productos: "Productos", documentos: "Documentos", perfil: "Perfil", ia: "IA",
};
const MAX_DIAS = 90;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
const num = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

interface FilaCliente {
  cod_cliente: number; cliente: string | null; veces: number; dias: number; primera: string; ultima: string;
  media: number; pestanas: Record<string, number> | null; pestana_principal: string | null;
  destacado: boolean; motivo: "nuevo" | "triple" | null;
}
interface ResUsuario {
  primera_consulta: string | null; historial_suficiente: boolean; clientes_dia: number; clientes_dia_media: number;
  clientes: FilaCliente[];
}
interface FilaUsuario {
  user_id: string; nombre: string | null; veces: number; dias: number; primera: string; ultima: string;
  pestanas: Record<string, number> | null;
}

const Pestanas = ({ p }: { p: Record<string, number> | null }) => (
  <div className="flex flex-wrap gap-1">
    {Object.entries(p ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
      <Badge key={k} variant="outline" className="text-xs font-normal">{PESTANAS[k] ?? k}: {n}</Badge>
    ))}
  </div>
);

export default function ConsultasAuditoria({ usuarios }: { usuarios: { user_id: string; full_name: string | null; email: string | null }[] }) {
  const [modo, setModo] = useState<"usuario" | "cliente">("usuario");
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoyISO());
  const [usuario, setUsuario] = useState("");
  const [busca, setBusca] = useState("");
  const [candidatos, setCandidatos] = useState<{ cod_cliente: number; cliente: string }[]>([]);
  const [cliente, setCliente] = useState<{ cod_cliente: number; cliente: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resU, setResU] = useState<ResUsuario | null>(null);
  const [resC, setResC] = useState<FilaUsuario[] | null>(null);

  const periodo = () => {
    const d = new Date(`${desde}T00:00:00`);
    const h = new Date(`${hasta}T00:00:00`);
    h.setDate(h.getDate() + 1);
    if (!(h > d)) { toast({ title: "Periodo no válido", variant: "destructive" }); return null; }
    if ((h.getTime() - d.getTime()) / 86400000 > MAX_DIAS) {
      toast({ title: "Periodo demasiado largo", description: `Como máximo ${MAX_DIAS} días.`, variant: "destructive" });
      return null;
    }
    return { _desde: d.toISOString(), _hasta: h.toISOString() };
  };

  const buscarCliente = async () => {
    const t = busca.trim();
    if (!t) return;
    const q = supabase.from("clientes").select("cod_cliente, cliente").limit(15);
    const { data } = /^\d+$/.test(t) ? await q.eq("cod_cliente", Number(t)) : await q.ilike("cliente", `%${t}%`);
    setCandidatos((data as any[]) ?? []);
  };

  const consultar = async () => {
    const p = periodo();
    if (!p) return;
    setLoading(true);
    if (modo === "usuario") {
      if (!usuario) { setLoading(false); toast({ title: "Elige un usuario" }); return; }
      const { data, error } = await (supabase.rpc as any)("consultas_por_usuario", { _user_id: usuario, ...p });
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      setResU(error ? null : (data as ResUsuario));
    } else {
      if (!cliente) { setLoading(false); toast({ title: "Elige un cliente" }); return; }
      const { data, error } = await (supabase.rpc as any)("consultas_por_cliente", { _cod: cliente.cod_cliente, ...p });
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      setResC(error ? null : ((data as any)?.usuarios ?? []));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registro de consultas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Solo para investigar una posible fuga de información. Cada consulta que hagas aquí queda registrada en Auditoría.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={modo === "usuario" ? "default" : "outline"} onClick={() => setModo("usuario")}>Por usuario</Button>
            <Button size="sm" variant={modo === "cliente" ? "default" : "outline"} onClick={() => setModo("cliente")}>Por cliente</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="c-desde">Desde</Label>
              <Input id="c-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="c-hasta">Hasta</Label>
              <Input id="c-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            {modo === "usuario" ? (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Usuario</Label>
                <Select value={usuario} onValueChange={setUsuario}>
                  <SelectTrigger><SelectValue placeholder="Elige un usuario" /></SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.email || u.user_id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="c-busca">Cliente (nombre o código)</Label>
                <div className="flex gap-2">
                  <Input id="c-busca" value={busca} onChange={(e) => setBusca(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void buscarCliente(); }} />
                  <Button size="sm" variant="outline" onClick={buscarCliente}>Buscar</Button>
                </div>
                {cliente && <p className="text-xs">Elegido: <strong>{cliente.cliente}</strong> ({cliente.cod_cliente})</p>}
                {candidatos.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {candidatos.map((c) => (
                      <Button key={c.cod_cliente} size="sm" variant="ghost" className="h-auto whitespace-normal py-1 text-left text-xs"
                        onClick={() => { setCliente(c); setCandidatos([]); }}>
                        {c.cliente} ({c.cod_cliente})
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Periodo máximo: {MAX_DIAS} días.</p>
          <Button size="sm" onClick={consultar} disabled={loading}>{loading ? "Consultando…" : "Consultar"}</Button>
        </CardContent>
      </Card>

      {modo === "usuario" && resU && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clientes consultados ({resU.clientes.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clientes distintos al día: {num(resU.clientes_dia)} en el periodo, frente a {num(resU.clientes_dia_media)} de media en
              los 90 días anteriores.
            </p>
            {resU.historial_suficiente ? (
              <p className="text-xs text-muted-foreground">
                Se destaca un cliente si no lo había consultado en los 90 días anteriores, o si lo consulta al menos el triple que
                su media y al menos 3 veces.
              </p>
            ) : (
              <p className="text-xs font-medium text-muted-foreground">
                Historial insuficiente para comparar{resU.primera_consulta ? ` (desde ${fecha(resU.primera_consulta)})` : " (sin consultas registradas)"}.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {resU.clientes.length === 0 && <p className="text-sm text-muted-foreground">Sin consultas en este periodo.</p>}
            {resU.clientes.map((c) => (
              <div key={c.cod_cliente} className={`rounded-md border p-3 text-sm ${c.destacado ? "border-destructive/50 bg-destructive/5" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{c.cliente ?? "Cliente"} <span className="text-xs text-muted-foreground">({c.cod_cliente})</span></span>
                  {c.destacado && (
                    <Badge variant="destructive">
                      {c.motivo === "nuevo" ? "No lo consultaba antes" : "Triple de lo habitual"}
                      {c.pestana_principal === "documentos" || c.pestana_principal === "productos" ? ` · sobre todo ${PESTANAS[c.pestana_principal]}` : ""}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.veces} {c.veces === 1 ? "consulta" : "consultas"} en {c.dias} {c.dias === 1 ? "día" : "días"}
                  {resU.historial_suficiente ? ` · media habitual ${num(c.media)}` : ""} · {fechaHora(c.primera)} – {fechaHora(c.ultima)}
                </p>
                <div className="mt-1"><Pestanas p={c.pestanas} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {modo === "cliente" && resC && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quién lo ha consultado ({resC.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resC.length === 0 && <p className="text-sm text-muted-foreground">Nadie lo ha consultado en este periodo.</p>}
            {resC.map((u) => (
              <div key={u.user_id} className="rounded-md border p-3 text-sm">
                <p className="break-words font-medium">{u.nombre ?? u.user_id.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {u.veces} {u.veces === 1 ? "consulta" : "consultas"} en {u.dias} {u.dias === 1 ? "día" : "días"} · {fechaHora(u.primera)} – {fechaHora(u.ultima)}
                </p>
                <div className="mt-1"><Pestanas p={u.pestanas} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
