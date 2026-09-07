import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface EventoRow {
  id: string;
  ocurrido_en: string;
  user_id: string | null;
  email: string | null;
  tipo: string;
  resultado: string;
  entidad: string | null;
  entidad_id: string | null;
  ruta: string | null;
  detalle: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  dispositivo_id: string | null;
  full_name: string | null;
  total_filas: number;
}

const TIPOS: { value: string; label: string }[] = [
  { value: "login", label: "Inicio de sesión" },
  { value: "logout", label: "Cierre de sesión" },
  { value: "acceso_denegado", label: "Acceso denegado" },
  { value: "cambio_rol", label: "Cambio de rol" },
  { value: "aprobacion_usuario", label: "Aprobación de usuario" },
  { value: "baja_usuario", label: "Baja de usuario" },
  { value: "cambio_ver_margen", label: "Cambio de visibilidad de margen" },
];

const RESULTADOS: { value: string; label: string }[] = [
  { value: "ok", label: "Correcto" },
  { value: "denegado", label: "Denegado" },
  { value: "fallo", label: "Fallo" },
];

const PAGE_SIZE = 50;
const TODOS = "__todos__";

const etiquetaTipo = (t: string) => TIPOS.find((x) => x.value === t)?.label ?? t;

const variantResultado = (r: string): "default" | "secondary" | "destructive" =>
  r === "ok" ? "secondary" : r === "denegado" ? "destructive" : "destructive";

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });

export default function AdminAuditoria() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<EventoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [usuario, setUsuario] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [resultado, setResultado] = useState(TODOS);

  const fetchUsuarios = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(300);
    setUsuarios((data as any[]) ?? []);
  };

  const fetchData = async (pagina = page) => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("auditoria_listado", {
      _desde: desde ? new Date(desde).toISOString() : null,
      _hasta: hasta ? new Date(hasta).toISOString() : null,
      _user_id: usuario === TODOS ? null : usuario,
      _tipo: tipo === TODOS ? null : tipo,
      _resultado: resultado === TODOS ? null : resultado,
      _limit: PAGE_SIZE,
      _offset: pagina * PAGE_SIZE,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setRows([]);
      setTotal(0);
    } else {
      const list = ((data as any[]) ?? []) as EventoRow[];
      setRows(list);
      setTotal(list.length ? Number(list[0].total_filas) : 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
    fetchData(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicar = () => {
    setPage(0);
    fetchData(0);
  };

  const limpiar = () => {
    setDesde("");
    setHasta("");
    setUsuario(TODOS);
    setTipo(TODOS);
    setResultado(TODOS);
    setPage(0);
    setTimeout(() => fetchData(0), 0);
  };

  const cambiarPagina = (delta: number) => {
    const nueva = Math.max(0, page + delta);
    setPage(nueva);
    fetchData(nueva);
  };

  const totalPaginas = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const nombreUsuario = (r: EventoRow) => r.full_name || r.email || (r.user_id ? "—" : "Sin sesión");

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Auditoría de seguridad</h1>
        <p className="text-sm text-muted-foreground">
          Registro inmutable de accesos, denegaciones y cambios sobre usuarios.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="desde" className="text-xs">Desde</Label>
              <Input id="desde" type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta" className="text-xs">Hasta</Label>
              <Input id="hasta" type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Usuario</Label>
              <Select value={usuario} onValueChange={setUsuario}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email || u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resultado</Label>
              <Select value={resultado} onValueChange={setResultado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {RESULTADOS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={aplicar} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Aplicar
            </Button>
            <Button size="sm" variant="outline" onClick={limpiar} disabled={loading}>Limpiar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Eventos {total > 0 ? `(${total.toLocaleString("es-ES")})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay eventos para estos filtros.</p>
          ) : isMobile ? (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{etiquetaTipo(r.tipo)}</span>
                    <Badge variant={variantResultado(r.resultado)}>{r.resultado}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{fechaLarga(r.ocurrido_en)}</p>
                  <p className="mt-1 break-words">{nombreUsuario(r)}</p>
                  {r.email && <p className="break-words text-xs text-muted-foreground">{r.email}</p>}
                  {r.ruta && <p className="break-words text-xs text-muted-foreground">Ruta: {r.ruta}</p>}
                  {r.entidad && (
                    <p className="break-words text-xs text-muted-foreground">
                      {r.entidad}: {r.entidad_id}
                    </p>
                  )}
                  {r.ip && <p className="text-xs text-muted-foreground">IP: {r.ip}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">{fechaLarga(r.ocurrido_en)}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate">{nombreUsuario(r)}</div>
                        {r.email && <div className="truncate text-xs text-muted-foreground">{r.email}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{etiquetaTipo(r.tipo)}</TableCell>
                      <TableCell><Badge variant={variantResultado(r.resultado)}>{r.resultado}</Badge></TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{r.ruta ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">
                        {r.entidad ? `${r.entidad}: ${r.entidad_id ?? ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.ip ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => cambiarPagina(-1)} disabled={page === 0 || loading}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cambiarPagina(1)}
                disabled={loading || page + 1 >= totalPaginas}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
