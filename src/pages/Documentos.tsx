import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentoLineasDialog } from "@/components/DocumentoLineasDialog";
import {
  useDocumentosListado,
  useDocumentosFiltrosOpciones,
  usePuedeVerMargen,
  type DocumentoListado,
  type DocumentosOrden,
  eur,
  num,
  fechaCorta,
} from "@/hooks/useCrm";
import { supabase } from "@/integrations/supabase/client";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useIsMobile } from "@/hooks/use-mobile";

const LIMITE = 50;
const UMBRAL_DEFAULT = 300;
const TODOS = "__todos__";

interface Filtros {
  buscar: string;
  fechaDesde: string;
  fechaHasta: string;
  importeMin: number;
  importeMax: number | null;
  canal: string | null;
  almacen: string | null;
  registradoPor: string | null;
  operacion: string | null;
  motivoAbono: string | null;
  delegacion: string | null;
  vendedor: string | null;
}

const FILTROS_INICIALES: Filtros = {
  buscar: "",
  fechaDesde: "",
  fechaHasta: "",
  importeMin: UMBRAL_DEFAULT,
  importeMax: null,
  canal: null,
  almacen: null,
  registradoPor: null,
  operacion: null,
  motivoAbono: null,
  delegacion: null,
  vendedor: null,
};

export default function Documentos() {
  const [searchParams] = useSearchParams();
  const [anio, setAnio] = useState<string>("");
  const anioInicializado = useRef(false);
  const filtrosInicializados = useRef(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [orden, setOrden] = useState<DocumentosOrden>("fecha");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState<DocumentoListado | null>(null);
  const [dialogoOpen, setDialogoOpen] = useState(false);

  const setFiltro = <K extends keyof Filtros>(key: K, valor: Filtros[K]) =>
    setFiltros((f) => ({ ...f, [key]: valor }));

  const { data: ultimoAnio, isLoading: cargandoAnio } = useQuery({
    queryKey: ["documentos_ultimo_anio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas_diarias")
        .select("fecha")
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.fecha ? new Date(data.fecha).getFullYear() : new Date().getFullYear();
    },
  });

  // Hidratar filtros desde URL una sola vez al montar
  useEffect(() => {
    if (filtrosInicializados.current) return;

    const getParam = (name: string) => {
      const v = searchParams.get(name);
      return v && v.trim() ? v.trim() : null;
    };

    const anioParam = getParam("anio");
    const canal = getParam("canal");
    const motivoAbono = getParam("motivoAbono");
    const operacion = getParam("operacion");
    const vendedor = getParam("vendedor");
    const delegacion = getParam("delegacion");
    const importeMinRaw = searchParams.get("importeMin");

    const nuevosFiltros: Partial<Filtros> = {};
    if (canal) nuevosFiltros.canal = canal;
    if (motivoAbono) nuevosFiltros.motivoAbono = motivoAbono;
    if (operacion) nuevosFiltros.operacion = operacion;
    if (vendedor) nuevosFiltros.vendedor = vendedor;
    if (delegacion) nuevosFiltros.delegacion = delegacion;

    if (importeMinRaw !== null) {
      const parsed = Number(importeMinRaw);
      nuevosFiltros.importeMin = Number.isNaN(parsed) ? 0 : parsed;
    }

    setFiltros((f) => ({ ...f, ...nuevosFiltros }));

    if (anioParam && /^\d{4}$/.test(anioParam)) {
      setAnio(anioParam);
    }

    anioInicializado.current = true;
    filtrosInicializados.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (ultimoAnio && !anioInicializado.current) {
      setAnio(String(ultimoAnio));
      anioInicializado.current = true;
    }
  }, [ultimoAnio]);

  const anios = useMemo(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => actual - i);
  }, []);

  const anioNum = anio ? Number(anio) : null;

  const { data, isLoading, error } = useDocumentosListado({
    anio: anioNum,
    pagina,
    limite: LIMITE,
    importeMin: filtros.importeMin,
    importeMax: filtros.importeMax,
    buscar: filtros.buscar,
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    canal: filtros.canal,
    almacen: filtros.almacen,
    registradoPor: filtros.registradoPor,
    operacion: filtros.operacion,
    motivoAbono: filtros.motivoAbono,
    delegacion: filtros.delegacion,
    vendedor: filtros.vendedor,
    orden,
    dir,
  });
  const { data: opciones } = useDocumentosFiltrosOpciones(anioNum);
  const { data: verMargen } = usePuedeVerMargen();
  const isMobile = useIsMobile();

  useScrollRestore("documentos", !isLoading && !!data);

  const volverRaw = searchParams.get("volver");
  const volverTxtRaw = searchParams.get("volverTxt");
  const volver = volverRaw && volverRaw.startsWith("/") && !volverRaw.startsWith("//") ? volverRaw : null;
  const volverTxt = volverTxtRaw && volverTxtRaw.trim() ? decodeURIComponent(volverTxtRaw) : "Documentos";

  const totalPaginas = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, Math.ceil(data.total / LIMITE));
  }, [data]);

  useEffect(() => {
    setPagina(1);
  }, [anio, filtros, orden, dir]);

  const ordenar = (col: DocumentosOrden) => {
    if (orden === col) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setOrden(col);
      setDir("desc");
    }
  };

  const abrirLineas = (doc: DocumentoListado) => {
    setSeleccionado(doc);
    setDialogoOpen(true);
  };

  const chips: { key: string; label: string; quitar: () => void }[] = [];
  if (filtros.importeMin > 0)
    chips.push({
      key: "min",
      label: `Más de ${eur(filtros.importeMin, 0)}`,
      quitar: () => setFiltro("importeMin", 0),
    });
  if (filtros.importeMax != null)
    chips.push({
      key: "max",
      label: `Menos de ${eur(filtros.importeMax, 0)}`,
      quitar: () => setFiltro("importeMax", null),
    });
  if (filtros.buscar.trim())
    chips.push({ key: "buscar", label: `“${filtros.buscar.trim()}”`, quitar: () => setFiltro("buscar", "") });
  if (filtros.fechaDesde)
    chips.push({ key: "desde", label: `Desde ${filtros.fechaDesde}`, quitar: () => setFiltro("fechaDesde", "") });
  if (filtros.fechaHasta)
    chips.push({ key: "hasta", label: `Hasta ${filtros.fechaHasta}`, quitar: () => setFiltro("fechaHasta", "") });
  const chipTexto = (key: keyof Filtros, prefijo: string) => {
    const v = filtros[key] as string | null;
    if (v) chips.push({ key: String(key), label: `${prefijo}: ${v}`, quitar: () => setFiltro(key, null as never) });
  };
  chipTexto("canal", "Canal");
  chipTexto("almacen", "Almacén");
  chipTexto("registradoPor", "Registrado por");
  chipTexto("operacion", "Operación");
  chipTexto("motivoAbono", "Motivo abono");
  chipTexto("delegacion", "Delegación");
  chipTexto("vendedor", "Comercial");

  const numFiltros = chips.length;

  const SelectFiltro = ({
    label,
    valor,
    opts,
    onChange,
  }: {
    label: string;
    valor: string | null;
    opts: string[];
    onChange: (v: string | null) => void;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={valor ?? TODOS} onValueChange={(v) => onChange(v === TODOS ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opts.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const Cabecera = ({
    col,
    children,
    className,
  }: {
    col: DocumentosOrden;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => ordenar(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          orden === col ? "text-foreground font-medium" : ""
        }`}
      >
        {children}
        {orden === col &&
          (dir === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {volver && (
        <Link
          to={volver}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {volverTxt}
        </Link>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Documentos</h1>
        <p className="text-sm text-muted-foreground">Documentos de venta de tus clientes</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={anio} onValueChange={setAnio} disabled={cargandoAnio}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {anios.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Sheet open={panelAbierto} onOpenChange={setPanelAbierto}>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {numFiltros > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {numFiltros}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Buscar cliente o código</Label>
                <Input
                  value={filtros.buscar}
                  onChange={(e) => setFiltro("buscar", e.target.value)}
                  placeholder="Nombre o código de cliente"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Desde</Label>
                  <Input
                    type="date"
                    value={filtros.fechaDesde}
                    onChange={(e) => setFiltro("fechaDesde", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hasta</Label>
                  <Input
                    type="date"
                    value={filtros.fechaHasta}
                    onChange={(e) => setFiltro("fechaHasta", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Importe mínimo (€)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filtros.importeMin}
                    onChange={(e) => setFiltro("importeMin", Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Importe máximo (€)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filtros.importeMax ?? ""}
                    placeholder="Sin límite"
                    onChange={(e) =>
                      setFiltro("importeMax", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </div>
              </div>

              <SelectFiltro
                label="Canal"
                valor={filtros.canal}
                opts={opciones?.canales ?? []}
                onChange={(v) => setFiltro("canal", v)}
              />
              <SelectFiltro
                label="Almacén"
                valor={filtros.almacen}
                opts={opciones?.almacenes ?? []}
                onChange={(v) => setFiltro("almacen", v)}
              />
              <SelectFiltro
                label="Registrado por"
                valor={filtros.registradoPor}
                opts={opciones?.registrados_por ?? []}
                onChange={(v) => setFiltro("registradoPor", v)}
              />
              <SelectFiltro
                label="Operación"
                valor={filtros.operacion}
                opts={opciones?.operaciones ?? []}
                onChange={(v) => setFiltro("operacion", v)}
              />
              <SelectFiltro
                label="Motivo de abono"
                valor={filtros.motivoAbono}
                opts={opciones?.motivos_abono ?? []}
                onChange={(v) => setFiltro("motivoAbono", v)}
              />
              {(opciones?.delegaciones.length ?? 0) > 1 && (
                <SelectFiltro
                  label="Delegación"
                  valor={filtros.delegacion}
                  opts={opciones!.delegaciones}
                  onChange={(v) => setFiltro("delegacion", v)}
                />
              )}
              {(opciones?.vendedores.length ?? 0) > 1 && (
                <SelectFiltro
                  label="Comercial"
                  valor={filtros.vendedor}
                  opts={opciones!.vendedores}
                  onChange={(v) => setFiltro("vendedor", v)}
                />
              )}

              <Button variant="ghost" className="w-full" onClick={() => setFiltros(FILTROS_INICIALES)}>
                Restablecer filtros
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 px-3 py-1 text-sm">
              {c.label}
              <button
                type="button"
                onClick={c.quitar}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                aria-label={`Quitar filtro ${c.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            No se han podido cargar los documentos: {(error as Error).message}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay documentos para los filtros seleccionados.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <Cabecera col="fecha">Fecha</Cabecera>
                  <TableHead>Hora</TableHead>
                  <Cabecera col="cliente">Cliente</Cabecera>
                  <Cabecera col="operacion">Tipo / Operación</Cabecera>
                  <Cabecera col="almacen">Almacén</Cabecera>
                  <Cabecera col="registrado_por">Registrado por</Cabecera>
                  <Cabecera col="lineas" className="text-right">
                    Líneas
                  </Cabecera>
                  <Cabecera col="importe" className="text-right">
                    Importe
                  </Cabecera>
                  {verMargen && <TableHead className="text-right">Margen</TableHead>}
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((d) => {
                  const negativo = d.importe < 0;
                  return (
                    <TableRow key={d.id_documento} className="cursor-pointer" onClick={() => abrirLineas(d)}>
                      <TableCell className="whitespace-nowrap">{fechaCorta(d.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {d.hora ? d.hora.slice(0, 5) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate text-sm font-medium">
                          <Link
                            to={`/clientes/${d.cod_cliente}?volver=/documentos&volverTxt=Documentos`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline"
                          >
                            {d.cliente}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">#{d.cod_cliente}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="whitespace-nowrap">{d.operacion ?? d.tipo_documento ?? "—"}</div>
                        {negativo && d.motivo_abono && (
                          <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {d.motivo_abono}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {d.almacen ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {d.registrado_por ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{num(d.lineas)}</TableCell>
                      <TableCell className={`text-right tabular-nums text-sm font-medium ${negativo ? "text-destructive" : ""}`}>
                        {eur(d.importe, 2)}
                      </TableCell>
                      {verMargen && (
                        <TableCell className="text-right tabular-nums text-sm">{eur(d.margen, 2)}</TableCell>
                      )}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirLineas(d)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {(data.total || 0).toLocaleString("es-ES")} documentos · Página {pagina} de {totalPaginas}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
              >
                Siguiente <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <DocumentoLineasDialog
        open={dialogoOpen}
        onOpenChange={setDialogoOpen}
        codCliente={seleccionado?.cod_cliente ?? 0}
        documento={
          seleccionado
            ? {
                id_documento: seleccionado.id_documento,
                fecha: seleccionado.fecha,
                hora: seleccionado.hora,
                tipo_documento: seleccionado.tipo_documento,
                operacion: seleccionado.operacion,
                canal: seleccionado.canal,
                almacen: seleccionado.almacen,
                vendedor_linea: seleccionado.vendedor_linea,
                registrado_por: seleccionado.registrado_por,
                importe: seleccionado.importe,
                margen: seleccionado.margen,
                lineas: seleccionado.lineas,
              }
            : null
        }
        nombreCliente={seleccionado?.cliente}
        motivoAbono={seleccionado?.motivo_abono}
        idDocEnlazado={seleccionado?.id_doc_enlazado}
      />
    </div>
  );
}
