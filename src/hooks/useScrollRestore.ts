import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Guarda y restaura la posición de scroll de ventana de un listado.
 * La posición vive en sessionStorage: no sobrevive al cierre del navegador.
 */
export function useScrollRestore(key: string, ready: boolean) {
  const restored = useRef(false);
  const storageKey = `scroll:${key}`;

  // Guardado con throttle vía requestAnimationFrame
  useEffect(() => {
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        try {
          sessionStorage.setItem(storageKey, String(window.scrollY));
        } catch {
          /* almacenamiento no disponible */
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [storageKey]);

  // Restauración: una sola vez por montaje y solo cuando los datos están pintados
  useLayoutEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!saved) return;
    const y = Number(saved);
    if (!Number.isFinite(y) || y <= 0) return;
    window.scrollTo(0, y);
  }, [ready, storageKey]);
}
