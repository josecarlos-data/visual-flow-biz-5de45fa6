import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentoLineas, type DocumentoCliente } from "@/hooks/useCrm";
import { eur, num, fechaCorta } from "@/lib/format";

interface DocumentoLineasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codCliente: number;
  documento: DocumentoCliente | null;
  nombreCliente?: string;
  motivoAbono?: string | null;
  idDocEnlazado?: string | null;
}

export function DocumentoLineasDialog({
  open,
  onOpenChange,
  codCliente,
  documento,
  nombreCliente,
  motivoAbono,
  idDocEnlazado,
}: DocumentoLineasDialogProps) {
  const idDocumento = documento?.id_documento ?? null;
  const { data: lineas, isLoading, error } = useDocumentoLineas(codCliente, idDocumento);

  const total = (lineas ?? []).reduce((acc, l) => acc + l.importe, 0);
  const unidadesTotales = (lineas ?? []).reduce((acc, l) => acc + l.unidades, 0);

  const tipoLabel = documento?.operacion ?? documento?.tipo_documento ?? "—";
  const esNegativo = documento ? documento.importe < 0 : false;
  const badgeVariant = tipoLabel === "—" ? "secondary" : esNegativo ? "destructive" : "default";


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="font-mono text-lg">
              {documento?.id_documento ?? "—"}
            </DialogTitle>
            <Badge variant={badgeVariant}>{tipoLabel}</Badge>
            {motivoAbono && <Badge variant="outline">{motivoAbono}</Badge>}
          </div>

          <DialogDescription>
            {documento?.fecha ? (
              <>
                {fechaCorta(documento.fecha)}
                {documento.hora ? ` ${documento.hora.slice(0, 5)}` : ""} · {documento.canal ?? "—"} · {documento.almacen ?? "—"}
              </>
            ) : (
              "—"
            )}
          </DialogDescription>
          <DialogDescription>
            {nombreCliente ? (
              <>
                {nombreCliente} · Emitido por {documento?.registrado_por ?? "—"}
              </>
            ) : (
              <>Emitido por {documento?.registrado_por ?? "—"} · comercial del cliente: {documento?.vendedor_linea ?? "—"}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No se han podido cargar las líneas del documento.
            </p>
          ) : (lineas ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin líneas para este documento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Uds.</TableHead>
                  <TableHead className="text-right">Precio ud.</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas!.map((l, i) => {
                  const precioUd = l.unidades ? l.importe / l.unidades : null;
                  const lineaNegativa = l.importe < 0;
                  return (
                    <TableRow key={`${l.referencia}-${i}`}>
                      <TableCell className="font-mono text-xs">{l.referencia}</TableCell>
                      <TableCell>
                        <div className="max-w-[260px] truncate text-sm">{l.descripcion ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.marca ?? "Sin marca"} · {l.familia ?? "Sin familia"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(l.unidades)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {precioUd != null ? eur(precioUd, 2) : "—"}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${lineaNegativa ? "text-destructive" : ""}`}>
                        {eur(l.importe, 2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4 text-sm">
          <span className="text-muted-foreground">
            {lineas?.length ?? 0} líneas · {num(unidadesTotales)} unidades
          </span>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total documento</span>
              <span className={`text-lg font-semibold tabular-nums ${esNegativo ? "text-destructive" : ""}`}>
                {eur(total, 2)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Importes sin IVA (base imponible)</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
