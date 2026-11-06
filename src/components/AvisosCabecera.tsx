import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useContadoresMensajes } from "@/hooks/useVisitaMensajes";

/** Icono de mensajes en la cabecera, visible sin abrir el menú lateral. */
export function AvisosCabecera() {
  const { role, dashboards } = useAuth();
  const { data } = useContadoresMensajes();
  const tieneVisitas = dashboards.some((d) => d.key === "visitas");
  const puedeRevisar = role === "admin" || role === "director_comercial" || role === "jefe_de_zona";
  const avisos = tieneVisitas ? data?.mis_revisiones ?? 0 : 0;
  const respuestas = tieneVisitas && puedeRevisar ? data?.respuestas_nuevas ?? 0 : 0;
  if (!tieneVisitas) return null;

  const icono = (n: number) => (
    <span className="relative">
      <MessageSquare className="h-4 w-4" />
      {n > 0 && (
        <span className="absolute -right-2.5 -top-2 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">{n}</span>
      )}
    </span>
  );

  if (avisos > 0 && respuestas > 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mensajes de revisión">{icono(avisos + respuestas)}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/visitas/revisiones" className="flex w-full justify-between gap-4">Avisos de revisión <span className="font-semibold">{avisos}</span></Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/visitas/revision?respuestas=1" className="flex w-full justify-between gap-4">Respuestas nuevas <span className="font-semibold">{respuestas}</span></Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const destino = respuestas > 0 ? "/visitas/revision?respuestas=1" : "/visitas/revisiones";
  return (
    <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Mensajes de revisión">
      <Link to={destino}>{icono(avisos + respuestas)}</Link>
    </Button>
  );
}
