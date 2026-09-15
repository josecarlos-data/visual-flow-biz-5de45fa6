const CLAVE = "crm_dispositivo_id";
const CLAVE_SESION = "crm_sesion_id";

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // continuamos con el respaldo
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/** Identificador estable del equipo, persistido en el navegador. */
export function getDispositivoId(): string {
  try {
    const existente = localStorage.getItem(CLAVE);
    if (existente) return existente;
    const nuevo = uuid();
    localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    return uuid();
  }
}

/** Los 8 primeros caracteres, para que el usuario se los dicte al administrador. */
export function idEquipoCorto(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Identificador de la sesión del equipo. Vive en localStorage para que todas
 * las pestañas del mismo equipo compartan sesión y no se expulsen entre sí.
 */
export function getSesionId(): string {
  try {
    const existente = localStorage.getItem(CLAVE_SESION);
    if (existente) return existente;
    const nuevo = uuid();
    localStorage.setItem(CLAVE_SESION, nuevo);
    return nuevo;
  } catch {
    return uuid();
  }
}

export function limpiarSesionId() {
  try {
    localStorage.removeItem(CLAVE_SESION);
  } catch {
    // ignorado
  }
}
