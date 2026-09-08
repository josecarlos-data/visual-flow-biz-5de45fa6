import { lazy, type ComponentType } from "react";

const MARCA = "crm_recarga_chunk";

/**
 * React.lazy tolerante a despliegues: si el módulo ya no existe porque los
 * ficheros han cambiado de nombre, recarga la página UNA sola vez.
 */
export function lazyConRecarga<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const modulo = await cargar();
      try {
        sessionStorage.removeItem(MARCA);
      } catch {
        // ignorado
      }
      return modulo;
    } catch (err) {
      let yaRecargado = false;
      try {
        yaRecargado = sessionStorage.getItem(MARCA) === "1";
        if (!yaRecargado) sessionStorage.setItem(MARCA, "1");
      } catch {
        yaRecargado = true;
      }
      if (!yaRecargado) {
        window.location.reload();
        // Devolvemos una promesa que nunca resuelve: la página se está recargando.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
