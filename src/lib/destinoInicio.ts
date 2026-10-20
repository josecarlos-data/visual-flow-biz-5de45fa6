/**
 * Pantalla de inicio de un usuario: Ventas si la tiene; si no, el primer panel
 * permitido (los paneles ya llegan ordenados). null = ninguna sección asignada.
 */
export function destinoInicio(dashboards: { key: string; route: string }[]): string | null {
  if (dashboards.some((d) => d.key === "ventas")) return "/";
  return dashboards[0]?.route ?? null;
}
