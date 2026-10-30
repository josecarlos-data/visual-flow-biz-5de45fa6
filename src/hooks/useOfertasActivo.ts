import { useAppSetting } from "@/hooks/useCrm";
import { useAuth } from "@/hooks/useAuth";

/** Interruptor único de la sección Ofertas y Comunicaciones (ajuste ofertas_activo). Apagado si no se puede leer. */
export function useOfertasActivo(): boolean {
  const { user } = useAuth();
  const { data } = useAppSetting("ofertas_activo", "false");
  return !!user && data === "true";
}
