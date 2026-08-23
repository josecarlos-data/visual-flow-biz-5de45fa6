import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentoLineasDialog } from "@/components/DocumentoLineasDialog";
import { useDocumentosListado, usePuedeVerMargen, type DocumentoListado, eur, num, fechaCorta } from "@/hooks/useCrm";
import { supabase } from "@/integrations/supabase/client";
import { useScrollRestore } from "@/hooks/useScrollRestore";

const LIMITE = 50;
const UMBRAL_DEFAULT = 300;

export default function Documentos() {
  const [anio, setAnio] = useState<string>("");
  const anioInicializado = useRef(false);
  const [importeMin, setImporteMin] = useState<number>(UMBRAL_DEFAULT);
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<DocumentoListado | null>(null);
  const [dialogoOpen, setDialogoOpen] = useState(false);

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
  const { data, isLoading, error } = useDocumentosListado(anioNum, importeMin, pagina, LIMITE);
  const { data: verMargen } = usePuedeVerMargen();

  useScrollRestore("documentos", !isLoading && !!data);

  const totalPaginas = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, Math.ceil(data.total / LIMITE));
  }, [data]);

  useEffect(() => {
    setPagina(1);
  }, [anio, importeMin]);

  const abrirLineas = (doc: DocumentoListado) => {
    setSeleccionado(doc);
    setDialogoOpen(true);
  };

  const documentoParaDialog = seleccionado
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
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Documentos</h1>
        <p className="text-sm text-muted-foreground">Documentos de venta de tus clientes</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
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

        {importeMin > 0 ? (
          <Badge variant="secondary" className="h-9 gap-1 px-3 text-sm">
            Más de {eur(importeMin, 0)}
            <button
              type="button"
              onClick={() => setImporteMin(0)}
              className="ml-1 rounded-full p-0.5 hover:bg-muted"
              aria-label="Quitar filtro de importe mínimo"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ) : (
          <Badge variant="outline" className="h-9 px-3 text-sm text-muted-foreground">
            Todos los importes
          </Badge>
        )}
      </div>

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
                  <TableHead>Fecha</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo / Operación</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead className="text-right">Líneas</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
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
                      <TableCell className="whitespace-nowrap text-sm">
                        {d.operacion ?? d.tipo_documento ?? "—"}
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
        documento={documentoParaDialog}
        nombreCliente={seleccionado?.cliente}
      />
    </div>
  );
}
