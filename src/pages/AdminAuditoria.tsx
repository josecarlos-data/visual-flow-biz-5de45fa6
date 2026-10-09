import React, { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface EventoRow {
  id: string;
  ocurrido_en: string;
  user_id: string | null;
  email: string | null;
  tipo: string;
  resultado: string;
  entidad: string | null;
  entidad_id: string | null;
  ruta: string | null;
  detalle: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  dispositivo_id: string | null;
  full_name: string | null;
  total_filas: number;
}

const TIPOS: { value: string; label: string }[] = [
  { value: "login", label: "Inicio de sesión" },
  { value: "logout", label: "Cierre de sesión" },
  { value: "acceso_denegado", label: "Acceso denegado" },
  { value: "dato_cambio", label: "Cambio de ajuste" },
  { value: "dato_alta", label: "Alta de ajuste" },
  { value: "dato_baja", label: "Baja de ajuste" },
  { value: "usuario_alta", label: "Alta de usuario" },
  { value: "usuario_cambio", label: "Cambio de usuario" },
  { value: "usuario_baja", label: "Baja de datos de usuario" },
  { value: "cambio_estado_usuario", label: "Cambio de estado de usuario" },
  { value: "cambio_username", label: "Cambio de nombre de usuario" },
  { value: "baja_usuario", label: "Baja de usuario" },
  { value: "suspension_automatica", label: "Suspensión automática" },
  { value: "fin_suspension", label: "Fin de suspensión" },
  { value: "cambio_config_seguridad", label: "Cambio de configuración de seguridad" },
  { value: "dispositivo_alta", label: "Equipo autorizado" },
  { value: "dispositivo_denegado", label: "Equipo denegado" },
  { value: "codigo_generado", label: "Código de alta generado" },
  { value: "codigo_usado", label: "Código de alta usado" },
  { value: "codigo_invalido", label: "Código de alta no válido" },
  { value: "sesion_expulsada", label: "Sesión expulsada" },
  { value: "password_cambiada", label: "Contraseña cambiada" },
  { value: "password_restablecer_enviado", label: "Enlace de restablecimiento enviado" },
  { value: "password_cambio_forzado", label: "Cambio de contraseña forzado" },
  { value: "2fa_alta", label: "Alta de segundo factor" },
  { value: "2fa_verificado", label: "Segundo factor verificado" },
  { value: "2fa_fallido", label: "Segundo factor fallido" },
  { value: "2fa_reseteado", label: "Segundo factor restablecido" },
  { value: "aviso_seguridad", label: "Aviso de seguridad" },
  { value: "cambio_rol", label: "Cambio de rol" },
  { value: "aprobacion_usuario", label: "Aprobación de usuario" },
  { value: "cambio_ver_margen", label: "Cambio de visibilidad de margen" },
  { value: "consulta_actividad", label: "Consulta del registro de consultas" },
];

/** Nombre en singular de cada tabla auditada, para «Alta de visita», «Cambio de perfil de cliente»… */
const TABLAS: Record<string, string> = {
  visitas: "visita",
  clientes: "cliente",
  objetivos: "objetivo",
  situaciones_cliente: "situación de cliente",
  cliente_perfil_datos: "perfil de cliente",
  app_settings: "ajuste",
};
const OPERACION_DATO: Record<string, string> = { dato_alta: "Alta", dato_cambio: "Cambio", dato_baja: "Baja" };

/** Nombres de atributos del perfil de cliente, cargados una vez al abrir la pantalla. */
const ATRIBUTOS: Record<string, string> = {};

const RESULTADOS: { value: string; label: string }[] = [
  { value: "ok", label: "Correcto" },
  { value: "denegado", label: "Denegado" },
  { value: "fallo", label: "Fallo" },
];

const PAGE_SIZE = 50;
const TODOS = "__todos__";

const TABLAS_USUARIO = new Set(["usuario", "profiles", "user_roles", "user_dashboard_access"]);

const etiquetaTipo = (t: string) => TIPOS.find((x) => x.value === t)?.label ?? null;

/** Nombre técnico sin traducción: en gris y monoespaciado, para que se note. */
const Tecnico = ({ children }: { children: string }) => (
  <span className="font-mono text-muted-foreground">{children}</span>
);

const NOMBRES_AJUSTE: Record<string, string> = {
  control_acceso_modo: "Modo de control de acceso",
  alta_dispositivo_modo: "Alta de equipos nuevos",
  control_sesiones_activo: "Sesiones simultáneas",
  acceso_permite_correo: "Permitir acceso con correo",
  segundo_factor_modo: "Segundo factor",
  sesion_duracion_horas: "Duración máxima de sesión (horas)",
  avisos_seguridad_activo: "Avisos de seguridad",
  avisos_seguridad_email: "Destinatario de avisos",
  anios_cliente_activo: "Años para considerar activo a un cliente",
  registro_consultas_activo: "Registro de consultas",
  auditoria_retencion_dias: "Conservación de Auditoría (días)",
  consultas_retencion_dias: "Conservación de consultas (días)",
};

const VALORES: Record<string, Record<string, string>> = {
  ajuste: {
    true: "Sí", false: "No", observacion: "Observación", bloqueo: "Bloqueo", auto: "Automática",
    codigo: "Con código", desactivado: "Desactivado", marcados: "Solo usuarios marcados",
    activo: "Marcados y todos los administradores",
  },
  categoria: {
    suspension: "Suspensiones", limite_ip: "Límite de intentos por conexión", configuracion: "Configuración de seguridad",
    nuevo_admin: "Nuevo administrador", segundo_factor: "Segundo factor restablecido", baja: "Bajas de usuario",
  },
  via: { "iniciar-sesion": "Pantalla de acceso", "cambiar-password": "Cambio de contraseña" },
  role: { admin: "Administrador", director_comercial: "Director comercial", jefe_de_zona: "Jefe de zona", comercial: "Comercial" },
  estado: {
    activo: "Activo", suspendido_temporal: "Suspendido temporalmente", bloqueado_intentos: "Bloqueado por intentos",
    bloqueado_admin: "Bloqueado por un administrador", baja: "Baja",
    pendiente: "Pendiente", confirmado: "Confirmado", descartado: "Descartado",
  },
  vista: { por_usuario: "Por usuario", por_cliente: "Por cliente" },
  accion: { autorizar: "Autorizar", bloquear: "Bloquear", desbloquear: "Desbloquear", renombrar: "Renombrar", eliminar: "Eliminar" },
  operacion: { INSERT: "Alta", UPDATE: "Modificación", DELETE: "Baja" },
  origen: { usuario: "Usuario", sistema: "Sistema" },
  resultado: { ok: "Correcto", denegado: "Denegado", fallo: "Fallo" },
  codigo: { sin_destinatario: "Sin destinatario", destinatario_dado_de_baja: "Destinatario dado de baja", error_envio: "Error de envío" },
  motivo: { error_servicio: "Error del servicio de acceso", invalid_credentials: "Contraseña incorrecta" },
};

const variantResultado = (r: string): "default" | "secondary" | "destructive" =>
  r === "ok" ? "secondary" : r === "denegado" ? "destructive" : "destructive";

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });

const NOMBRES_CAMPO: Record<string, string> = {
  is_approved: "Aprobado",
  categoria: "Categoría",
  recuento: "Recuento",
  destinatario: "Destinatario",
  estado: "Estado",
  exige_2fa: "Exigir segundo factor",
  sesiones_max: "Sesiones simultáneas",
  dispositivos_max: "Máximo de equipos",
  debe_cambiar_password: "Cambio de contraseña pendiente",
  ver_margen: "Ver margen",
  username: "Nombre de usuario",
  marcada_sospechosa: "Sospechosa",
  role: "Rol",
  full_name: "Nombre",
  motivo: "Motivo",
  origen: "Origen",
  operacion: "Operación",
  modo: "Modo",
  dispositivo_id: "Identificador de equipo",
  codigo: "Código",
  factores_borrados: "Factores borrados",
  via: "Vía",
  accion: "Acción",
  dashboard_key: "Panel",
  estado_motivo: "Motivo del estado",
  ciclo: "Ciclo",
  key: "Ajuste",
  value: "Valor",
  estado_nuevo: "Estado nuevo",
  estado_anterior: "Estado anterior",
  usuario: "Usuario",
  factor_id: "Identificador del factor",
  hasta: "Hasta",
  bloqueado_hasta: "Bloqueado hasta",
  employee_code: "Vendedor",
  delegacion: "Delegación",
  email: "Correo",
  is_active: "Activo",
  cod_cliente: "Código de cliente",
  atributo: "Atributo del perfil",
  valor_texto: "Valor",
  motivo_descarte: "Motivo de descarte",
  vista: "Vista",
  desde: "Desde",
  hasta: "Hasta",
};

const CAMPOS_OCULTOS = new Set(["x_forwarded_for", "cf_connecting_ip", "autenticado"]);


/** Valor legible; null si no hay traducción para un texto técnico conocido. */
const valorDeClave = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.map((x) => valorDeClave(k, x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  const t = String(v);
  if (k === "atributo") return ATRIBUTOS[t] ?? t;
  if ((k === "desde" || k === "hasta") && /^\d{4}-\d{2}-\d{2}T/.test(t)) return fechaLarga(t);
  return VALORES[k]?.[t] ?? t;
};

interface LineaDetalle {
  clave: string;
  etiqueta: string;
  antes?: unknown;
  despues?: unknown;
  valor?: unknown;
  /** Clave sin traducción conocida: se muestra en gris con su nombre técnico. */
  tecnico?: boolean;
}

const etiqueta = (k: string): { etiqueta: string; tecnico: boolean } =>
  NOMBRES_CAMPO[k] ? { etiqueta: NOMBRES_CAMPO[k], tecnico: false } : { etiqueta: k, tecnico: true };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const esPar = (v: unknown): v is { antes: unknown; despues: unknown } =>
  esObjeto(v) && ("antes" in v || "despues" in v);

function lineasDetalle(r: Pick<EventoRow, "detalle" | "entidad" | "entidad_id">): LineaDetalle[] {
  const detalle = r.detalle;
  if (!esObjeto(detalle)) return [];
  const cabecera: LineaDetalle[] = [];
  const pares: LineaDetalle[] = [];
  const sueltos: LineaDetalle[] = [];
  const esAjuste = r.entidad === "app_settings";
  const linea = (k: string, extra: Partial<LineaDetalle>): LineaDetalle => ({ clave: k, ...etiqueta(k), ...extra });

  if (esAjuste && ("antes" in detalle || "despues" in detalle) && !esObjeto(detalle.antes) && !esObjeto(detalle.despues)) {
    // Ajuste: «Nombre del ajuste: antes → después», sin «Campos modificados: value».
    const k = r.entidad_id ?? "";
    pares.push({
      clave: "ajuste",
      etiqueta: NOMBRES_AJUSTE[k] ?? k,
      tecnico: !NOMBRES_AJUSTE[k],
      antes: "antes" in detalle ? detalle.antes : undefined,
      despues: "despues" in detalle ? detalle.despues : undefined,
    });
  } else {
    const campos = detalle.campos;
    if (Array.isArray(campos) && campos.length > 0) {
      cabecera.push({ clave: "campos", etiqueta: "Campos modificados", valor: campos.map((c) => NOMBRES_CAMPO[String(c)] ?? String(c)).join(", ") });
    }
  }
  const antesSuelto = esObjeto(detalle.antes) ? detalle.antes : null;
  const despuesSuelto = esObjeto(detalle.despues) ? detalle.despues : null;
  for (const [k, v] of Object.entries(detalle)) {
    if (CAMPOS_OCULTOS.has(k) || k === "campos" || k === "antes" || k === "despues") continue;
    if (k === "key" && typeof v === "string") {
      sueltos.push({ clave: "key", etiqueta: "Ajuste", valor: NOMBRES_AJUSTE[v] ?? v });
      continue;
    }
    if (esPar(v)) {
      pares.push(linea(k, { antes: v.antes, despues: v.despues }));
    } else if (esObjeto(v)) {
      // Grupo anidado (p. ej. 'seguridad'): se recorren sus entradas sin mostrar el nombre del grupo.
      for (const [k2, v2] of Object.entries(v)) {
        if (CAMPOS_OCULTOS.has(k2)) continue;
        if (esPar(v2)) pares.push(linea(k2, { antes: v2.antes, despues: v2.despues }));
        else if (!esObjeto(v2)) sueltos.push(linea(k2, { valor: v2 }));
      }
    } else {
      sueltos.push(linea(k, { valor: v }));
    }
  }
  if (antesSuelto || despuesSuelto) {
    const claves = new Set([...Object.keys(antesSuelto ?? {}), ...Object.keys(despuesSuelto ?? {})]);
    for (const k of claves) {
      if (CAMPOS_OCULTOS.has(k)) continue;
      pares.push(linea(k, { antes: antesSuelto?.[k], despues: despuesSuelto?.[k] }));
    }
  }
  return [...cabecera, ...pares, ...sueltos];
}

function DetalleEvento({ evento }: { evento: EventoRow }) {
  const lineas = lineasDetalle(evento);
  if (lineas.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin detalle adicional.</p>;
  }
  const valores = (l: LineaDetalle) => (l.clave === "ajuste" ? "ajuste" : l.clave);
  return (
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
      {lineas.map((l, i) => (
        <div key={i} className="flex min-w-0 flex-wrap gap-1">
          <dt className="font-medium">{l.tecnico ? <Tecnico>{l.etiqueta}</Tecnico> : l.etiqueta}:</dt>
          <dd className="min-w-0 break-words text-muted-foreground">
            {l.antes !== undefined || l.despues !== undefined
              ? `${valorDeClave(valores(l), l.antes)} → ${valorDeClave(valores(l), l.despues)}`
              : valorDeClave(valores(l), l.valor)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminAuditoria() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<EventoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [nombresCliente, setNombresCliente] = useState<Record<number, string>>({});
  const [codPorVisita, setCodPorVisita] = useState<Record<string, number>>({});
  const [codPorClienteId, setCodPorClienteId] = useState<Record<string, number>>({});
  const [, setAtributosListos] = useState(0);

  const codClienteDe = (r: EventoRow): number | null => {
    const d = r.detalle as Record<string, unknown> | null;
    if (d && d.cod_cliente != null && Number.isFinite(Number(d.cod_cliente))) return Number(d.cod_cliente);
    if (r.entidad === "cliente" && r.entidad_id) return Number(r.entidad_id);
    if (r.entidad === "visitas" && r.entidad_id && codPorVisita[r.entidad_id] != null) return codPorVisita[r.entidad_id];
    if (r.entidad === "clientes" && r.entidad_id && codPorClienteId[r.entidad_id] != null) return codPorClienteId[r.entidad_id];
    return null;
  };

  /** Resuelve nombres de cliente de la página con pocas consultas agrupadas, no una por fila. */
  const resolverClientes = async (list: EventoRow[]) => {
    const ids = (ent: string) => [...new Set(list.filter((r) => r.entidad === ent && r.entidad_id && !(r.detalle as any)?.cod_cliente).map((r) => r.entidad_id!))];
    const visIds = ids("visitas");
    const cliIds = ids("clientes");
    const [vis, cli] = await Promise.all([
      visIds.length ? supabase.from("visitas").select("id, cod_cliente").in("id", visIds) : Promise.resolve({ data: [] as any[] }),
      cliIds.length ? supabase.from("clientes").select("id, cod_cliente").in("id", cliIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const mv: Record<string, number> = {};
    ((vis.data as any[]) ?? []).forEach((v) => { if (v.cod_cliente != null) mv[v.id] = v.cod_cliente; });
    const mc: Record<string, number> = {};
    ((cli.data as any[]) ?? []).forEach((c) => { mc[c.id] = c.cod_cliente; });
    setCodPorVisita(mv);
    setCodPorClienteId(mc);
    const cods = new Set<number>([...Object.values(mv), ...Object.values(mc)]);
    list.forEach((r) => {
      const d = r.detalle as any;
      if (d?.cod_cliente != null) cods.add(Number(d.cod_cliente));
      if (r.entidad === "cliente" && r.entidad_id) cods.add(Number(r.entidad_id));
    });
    const lista = [...cods].filter((c) => Number.isFinite(c));
    if (!lista.length) return;
    const { data } = await supabase.from("clientes").select("cod_cliente, cliente").in("cod_cliente", lista);
    const m: Record<number, string> = {};
    ((data as any[]) ?? []).forEach((c) => { m[c.cod_cliente] = c.cliente; });
    setNombresCliente((prev) => ({ ...prev, ...m }));
  };
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [usuario, setUsuario] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [resultado, setResultado] = useState(TODOS);

  const fetchUsuarios = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(300);
    setUsuarios((data as any[]) ?? []);
  };

  const fetchData = async (pagina = page) => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("auditoria_listado", {
      _desde: desde ? new Date(desde).toISOString() : null,
      _hasta: hasta ? new Date(hasta).toISOString() : null,
      _user_id: usuario === TODOS ? null : usuario,
      _tipo: tipo === TODOS ? null : tipo,
      _resultado: resultado === TODOS ? null : resultado,
      _limit: PAGE_SIZE,
      _offset: pagina * PAGE_SIZE,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setRows([]);
      setTotal(0);
    } else {
      const list = ((data as any[]) ?? []) as EventoRow[];
      setRows(list);
      void resolverClientes(list);
      setTotal(list.length ? Number(list[0].total_filas) : 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
    fetchData(0);
    void supabase.from("perfil_atributos").select("key, nombre").then(({ data }) => {
      ((data as any[]) ?? []).forEach((a) => { ATRIBUTOS[a.key] = a.nombre; });
      setAtributosListos((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicar = () => {
    setPage(0);
    fetchData(0);
  };

  const limpiar = () => {
    setDesde("");
    setHasta("");
    setUsuario(TODOS);
    setTipo(TODOS);
    setResultado(TODOS);
    setPage(0);
    setTimeout(() => fetchData(0), 0);
  };

  const cambiarPagina = (delta: number) => {
    const nueva = Math.max(0, page + delta);
    setPage(nueva);
    fetchData(nueva);
  };

  const totalPaginas = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const nombreUsuario = (r: EventoRow) => r.full_name || r.email || (r.user_id ? "—" : "Sistema");

  const tipoLegible = (r: EventoRow) => {
    const op = OPERACION_DATO[r.tipo];
    if (op && r.entidad) {
      const tabla = TABLAS[r.entidad];
      return tabla ? `${op} de ${tabla}` : <>{op} de <Tecnico>{r.entidad}</Tecnico></>;
    }
    return etiquetaTipo(r.tipo) ?? <Tecnico>{r.tipo}</Tecnico>;
  };
  const resultadoLegible = (x: string) => VALORES.resultado[x] ?? x;

  const nombreEntidad = (r: EventoRow): React.ReactNode => {
    if (!r.entidad) return "—";
    if (r.entidad_id && TABLAS_USUARIO.has(r.entidad)) {
      const u = usuarios.find((x) => x.user_id === r.entidad_id);
      if (u) return u.full_name || u.email || r.entidad_id;
    }
    if (r.entidad === "app_settings" || r.entidad === "ajuste") {
      const k = r.entidad_id ?? "";
      return NOMBRES_AJUSTE[k] ?? <Tecnico>{k}</Tecnico>;
    }
    const cod = codClienteDe(r);
    if (cod != null) return nombresCliente[cod] ?? `Cliente ${cod}`;
    if (r.entidad && TABLAS[r.entidad]) {
      const t = TABLAS[r.entidad];
      return t.charAt(0).toUpperCase() + t.slice(1) + (r.entidad === "visitas" ? " (eliminada)" : "");
    }
    if (r.entidad === "dispositivo") return "Equipo";
    if (r.entidad === "aviso") return "Aviso";
    if (TABLAS_USUARIO.has(r.entidad)) return "Usuario";
    return <Tecnico>{r.entidad_id ? `${r.entidad}: ${r.entidad_id}` : r.entidad}</Tecnico>;
  };

  const alternarExpandido = (id: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Auditoría de seguridad</h1>
        <p className="text-sm text-muted-foreground">
          Registro inmutable de accesos, denegaciones y cambios sobre usuarios.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="desde" className="text-xs">Desde</Label>
              <Input id="desde" type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta" className="text-xs">Hasta</Label>
              <Input id="hasta" type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Usuario</Label>
              <Select value={usuario} onValueChange={setUsuario}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email || u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resultado</Label>
              <Select value={resultado} onValueChange={setResultado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {RESULTADOS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={aplicar} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Aplicar
            </Button>
            <Button size="sm" variant="outline" onClick={limpiar} disabled={loading}>Limpiar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Eventos {total > 0 ? `(${total.toLocaleString("es-ES")})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay eventos para estos filtros.</p>
          ) : isMobile ? (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="cursor-pointer rounded-lg border p-3 text-sm"
                  onClick={() => alternarExpandido(r.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{tipoLegible(r)}</span>
                    <span className="flex items-center gap-1">
                      <Badge variant={variantResultado(r.resultado)}>{resultadoLegible(r.resultado)}</Badge>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${expandidos.has(r.id) ? "rotate-180" : ""}`}
                      />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{fechaLarga(r.ocurrido_en)}</p>
                  <p className="mt-1 break-words">{nombreUsuario(r)}</p>
                  {r.email && <p className="break-words text-xs text-muted-foreground">{r.email}</p>}
                  {r.ruta && <p className="break-words text-xs text-muted-foreground">Ruta: {r.ruta}</p>}
                  {r.entidad && (
                    <p className="break-words text-xs text-muted-foreground">
                      {nombreEntidad(r)}
                    </p>
                  )}
                  {r.ip && <p className="text-xs text-muted-foreground">IP: {r.ip}</p>}
                  {expandidos.has(r.id) && (
                    <div className="mt-2 border-t pt-2">
                      <DetalleEvento evento={r} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => alternarExpandido(r.id)}
                      >
                        <TableCell className="whitespace-nowrap text-xs">{fechaLarga(r.ocurrido_en)}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate">{nombreUsuario(r)}</div>
                          {r.email && <div className="truncate text-xs text-muted-foreground">{r.email}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{tipoLegible(r)}</TableCell>
                        <TableCell><Badge variant={variantResultado(r.resultado)}>{resultadoLegible(r.resultado)}</Badge></TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">{r.ruta ?? "—"}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">{nombreEntidad(r)}</TableCell>
                        <TableCell className="text-xs">{r.ip ?? "—"}</TableCell>
                        <TableCell>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${expandidos.has(r.id) ? "rotate-180" : ""}`}
                          />
                        </TableCell>
                      </TableRow>
                      {expandidos.has(r.id) && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <DetalleEvento evento={r} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => cambiarPagina(-1)} disabled={page === 0 || loading}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cambiarPagina(1)}
                disabled={loading || page + 1 >= totalPaginas}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
