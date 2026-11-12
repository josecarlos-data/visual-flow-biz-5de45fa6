import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CompletarBloqueDialog } from "@/components/CompletarBloqueDialog";
import type { Motivo, VisitaBloque } from "@/hooks/useCrm";

/** «Completar datos» del comercial sobre sus bloques Pendiente / No correcto (completar_bloque). */
export function CompletarDatosVisita({ bloques, motivos }: { bloques: VisitaBloque[]; motivos: Motivo[] | undefined }) {
  const [abierto, setAbierto] = useState<VisitaBloque | null>(null);
  if (!bloques.length || !motivos) return null;
  const nombre = (b: VisitaBloque) => motivos.find((m) => m.key === b.motivo_key)?.nombre ?? "Bloque";
  const parar = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div onClick={parar} onKeyDown={(e) => e.stopPropagation()}>
      {bloques.length === 1 ? (
        <Button size="sm" variant="outline" onClick={() => setAbierto(bloques[0])}>
          <Pencil className="mr-1 h-3.5 w-3.5" />Completar datos
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"><Pencil className="mr-1 h-3.5 w-3.5" />Completar datos</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {bloques.map((b, i) => (
              <DropdownMenuItem key={b.id} onSelect={() => setAbierto(b)}>{nombre(b)} {bloques.length > 1 ? `(${i + 1})` : ""}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {abierto && (
        <CompletarBloqueDialog
          bloque={abierto}
          campos={motivos.find((m) => m.key === abierto.motivo_key)?.campos ?? []}
          titulo={nombre(abierto)}
          open={!!abierto}
          onOpenChange={(v) => !v && setAbierto(null)}
        />
      )}
    </div>
  );
}
