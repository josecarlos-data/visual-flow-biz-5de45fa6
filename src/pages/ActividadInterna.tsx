import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useActividadFiltros,
  useActividadUsuarios,
  useActividadAlmacenes,
  type ActividadUsuario,
  type ActividadAlmacen,
  eur,
  num,
} from "@/hooks/useCrm";
import { useScrollRestore } from "@/hooks/useScrollRestore";

const TODOS = "__todos__";

const pct1 = (v: number | null | undefined) => (v == null ? "-" : `${num(v, 1)} %`);

type Dir = "asc" | "desc";

function useOrdenLocal<T>(filas: T[] | undefined, inicial: keyof T) {
  const [col, setCol] = useState<keyof T>(inicial);
  const [dir, setDir] = useState<Dir>("desc");

  const ordenar = (c: keyof T) => {
    if (c === col) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setCol(c);
      setDir("desc");
    }
  };

  const datos = useMemo(() => {
    const arr = [...(filas ?? [])];
    arr.sort((a, b) => {
      const va = a[col] as unknown;
      const vb = b[col] as unknown;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es");
      return dir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filas, col, dir]);

  return { col, dir, ordenar, datos };
}

export default function ActividadInterna() {
  const { data: filtros, isLoading: cargandoFiltros } = useActividadFiltros();
  const [anio, setAnio] = useState<string>("");
  const [almacen, setAlmacen] = useState<string | null>(null);
  const anioInicializado = useRef(false);

  useEffect(() => {
    if (anioInicializado.current) return;
    const primero = filtros?.anios?.[0];
    if (primero != null) {
      setAnio(String(primero));
      anioInicializado.current = true;
    }
  }, [filtros]);

  const anioNum = anio ? Number(anio) : null;
  const usuarios = useActividadUsuarios(anioNum, almacen);
  const almacenes = useActividadAlmacenes(anioNum);

  useScrollRestore("actividad-interna", !usuarios.isLoading);

  const ordU = useOrdenLocal<ActividadUsuario>(usuarios.data, "importe_vendido");
  const ordA = useOrdenLocal<ActividadAlmacen>(almacenes.data, "importe_vendido");

  const CabU = ({
    col,
    children,
    className,
  }: {
    col: keyof ActividadUsuario;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => ordU.ordenar(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          ordU.col === col ? "font-medium text-foreground" : ""
        }`}
      >
        {children}
        {ordU.col === col &&
          (ordU.dir === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />)}
      </button>
    </TableHead>
  );

  const CabA = ({
    col,
    children,
    className,
  }: {
    col: keyof ActividadAlmacen;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => ordA.ordenar(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          ordA.col === col ? "font-medium text-foreground" : ""
        }`}
      >
        {children}
        {ordA.col === col &&
          (ordA.dir === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Actividad interna</h1>
        <p className="text-sm text-muted-foreground">
          Comparativa de actividad por usuario de registro y almacén
        </p>
      </div>

      <Tabs defaultValue="usuario" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="usuario">Por usuario</TabsTrigger>
            <TabsTrigger value="almacen">Por almacén</TabsTrigger>
          </TabsList>
          <Select value={anio} onValueChange={setAnio} disabled={cargandoFiltros}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {(filtros?.anios ?? []).map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="usuario" className="space-y-3">
          {(filtros?.almacenes?.length ?? 0) > 1 && (
            <Select
              value={almacen ?? TODOS}
              onValueChange={(v) => setAlmacen(v === TODOS ? null : v)}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Todos los almacenes" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={TODOS}>Todos los almacenes</SelectItem>
                {(filtros?.almacenes ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Card>
            <CardContent className="p-0">
              {usuarios.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : ordU.datos.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Sin datos para este año.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <CabU col="registrado_por">Usuario</CabU>
                        <CabU col="almacen_principal">Plaza (est.)</CabU>
                        <CabU col="importe_vendido" className="text-right">
                          Vendido
                        </CabU>
                        <CabU col="importe_neto" className="text-right">
                          Neto
                        </CabU>
                        <CabU col="docs_venta" className="text-right">
                          Docs.
                        </CabU>
                        <CabU col="ticket_medio" className="text-right">
                          Ticket medio
                        </CabU>
                        <CabU col="clientes_distintos" className="text-right">
                          Clientes
                        </CabU>
                        <CabU col="n_abonos" className="text-right">
                          Abonos tramitados
                        </CabU>
                        <CabU col="abonos_ajenos" className="text-right">
                          de otros
                        </CabU>
                        <CabU col="importe_abonado" className="text-right">
                          Imp. tramitado
                        </CabU>
                        <CabU col="abonos_atribuidos" className="text-right">
                          Abonos s/ sus ventas
                        </CabU>
                        <CabU col="importe_atribuido" className="text-right">
                          Imp. atribuido
                        </CabU>
                        <CabU col="pct_abonos" className="text-right">
                          % abonos
                        </CabU>
                        <CabU col="pct_importe_abonado" className="text-right">
                          % imp. abonado
                        </CabU>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordU.datos.map((r) => (
                        <TableRow key={r.registrado_por}>
                          <TableCell className="font-medium">{r.registrado_por}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.almacen_principal ?? "-"}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_vendido, 0)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_neto, 0)}</TableCell>
                          <TableCell className="text-right">{num(r.docs_venta)}</TableCell>
                          <TableCell className="text-right">{eur(r.ticket_medio, 0)}</TableCell>
                          <TableCell className="text-right">{num(r.clientes_distintos)}</TableCell>
                          <TableCell className="text-right">{num(r.n_abonos)}</TableCell>
                          <TableCell className="text-right">{num(r.abonos_ajenos)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_abonado, 0)}</TableCell>
                          <TableCell className="text-right">{num(r.abonos_atribuidos)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_atribuido, 0)}</TableCell>
                          <TableCell className="text-right">{pct1(r.pct_abonos)}</TableCell>
                          <TableCell className="text-right">{pct1(r.pct_importe_abonado)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="almacen">
          <Card>
            <CardContent className="p-0">
              {almacenes.isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : ordA.datos.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Sin datos para este año.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <CabA col="almacen">Almacén</CabA>
                        <CabA col="n_usuarios" className="text-right">
                          Usuarios
                        </CabA>
                        <CabA col="importe_vendido" className="text-right">
                          Vendido
                        </CabA>
                        <CabA col="importe_neto" className="text-right">
                          Neto
                        </CabA>
                        <CabA col="docs_venta" className="text-right">
                          Docs.
                        </CabA>
                        <CabA col="ticket_medio" className="text-right">
                          Ticket medio
                        </CabA>
                        <CabA col="clientes_distintos" className="text-right">
                          Clientes
                        </CabA>
                        <CabA col="n_abonos" className="text-right">
                          Abonos tramitados
                        </CabA>
                        <CabA col="importe_abonado" className="text-right">
                          Imp. tramitado
                        </CabA>
                        <CabA col="abonos_atribuidos" className="text-right">
                          Abonos s/ sus ventas
                        </CabA>
                        <CabA col="importe_atribuido" className="text-right">
                          Imp. atribuido
                        </CabA>
                        <CabA col="pct_abonos" className="text-right">
                          % abonos
                        </CabA>
                        <CabA col="pct_importe_abonado" className="text-right">
                          % imp. abonado
                        </CabA>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordA.datos.map((r) => (
                        <TableRow key={r.almacen}>
                          <TableCell className="font-medium">{r.almacen}</TableCell>
                          <TableCell className="text-right">{num(r.n_usuarios)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_vendido, 0)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_neto, 0)}</TableCell>
                          <TableCell className="text-right">{num(r.docs_venta)}</TableCell>
                          <TableCell className="text-right">{eur(r.ticket_medio, 0)}</TableCell>
                          <TableCell className="text-right">{num(r.clientes_distintos)}</TableCell>
                          <TableCell className="text-right">{num(r.n_abonos)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_abonado, 0)}</TableCell>
                          <TableCell className="text-right">{num(r.abonos_atribuidos)}</TableCell>
                          <TableCell className="text-right">{eur(r.importe_atribuido, 0)}</TableCell>
                          <TableCell className="text-right">{pct1(r.pct_abonos)}</TableCell>
                          <TableCell className="text-right">{pct1(r.pct_importe_abonado)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
