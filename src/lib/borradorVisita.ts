/**
 * Borrador de «Registrar visita» en el móvil: un solo borrador por usuario, en localStorage.
 * Sobrevive a una recarga y a la expulsión por el control de sesión; se borra al guardar bien,
 * al descartar o al cerrar sesión a mano. Las fotos no se guardan, solo sus nombres.
 * Todo va en try/catch: un almacenamiento lleno o bloqueado nunca rompe la pantalla.
 */
export const CADUCIDAD_BORRADOR_MS = 3 * 24 * 60 * 60 * 1000;
const PREFIJO = "crm_borrador_visita:";

export interface BorradorVisita {
  version: 1;
  guardadoEn: number;
  visitaId: string;
  codCliente: string;
  clienteNombre: string;
  /** Nombre del cliente que no está en ISI (sin código). */
  clienteExterno?: string;
  fecha: string;
  tipo: string;
  resultado: string;
  transcripcion: string;
  textoAnalizado: string | null;
  observaciones: string;
  bloques: unknown[];
  analisis: { modelo: string | null; version: string | null };
  fotos: string[];
}

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const almacen = (s?: Almacen): Almacen | null => {
  try {
    return s ?? window.localStorage;
  } catch {
    return null;
  }
};

const clave = (userId: string) => `${PREFIJO}${userId}`;

export function guardarBorrador(
  userId: string,
  datos: Omit<BorradorVisita, "version" | "guardadoEn">,
  ahora = Date.now(),
  s?: Almacen,
): boolean {
  if (!userId) return false;
  try {
    almacen(s)?.setItem(clave(userId), JSON.stringify({ ...datos, version: 1, guardadoEn: ahora }));
    return true;
  } catch {
    return false;
  }
}

/** Devuelve el borrador vigente del usuario; si ha caducado o está dañado, lo borra y devuelve null. */
export function leerBorrador(userId: string, ahora = Date.now(), s?: Almacen): BorradorVisita | null {
  if (!userId) return null;
  try {
    const st = almacen(s);
    const raw = st?.getItem(clave(userId));
    if (!raw) return null;
    const b = JSON.parse(raw) as BorradorVisita;
    if (b?.version !== 1 || typeof b.guardadoEn !== "number" || !b.visitaId || ahora - b.guardadoEn > CADUCIDAD_BORRADOR_MS) {
      st?.removeItem(clave(userId));
      return null;
    }
    return b;
  } catch {
    try {
      almacen(s)?.removeItem(clave(userId));
    } catch {
      /* ignorado */
    }
    return null;
  }
}

export function borrarBorrador(userId: string, s?: Almacen): void {
  if (!userId) return;
  try {
    almacen(s)?.removeItem(clave(userId));
  } catch {
    /* ignorado */
  }
}
