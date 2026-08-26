import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogoMap, OpcionesDef } from "@/lib/motivoCampos";


export interface Cliente {
  cod_cliente: number;
  cliente: string;
  delegacion: string | null;
  localidad: string | null;
  provincia: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  vendedor: string | null;
  ruta: string | null;
  cod_tipo_cliente: string | null;
  observaciones_almacen: string | null;

  razon_social?: string | null;
  cif?: string | null;
  cod_vendedor?: string | null;
  ruta_comercial?: string | null;
  ruta_especial?: string | null;
  cod_delegacion?: string | null;
  grupo?: string | null;
  grupo_rappel?: string | null;
  tramos_rappel?: string | null;
  cod_postal?: string | null;
  telefono2?: string | null;
  persona_contacto?: string | null;
  web?: string | null;
  fecha_alta?: string | null;
  num_empleados_taller?: number | null;
  prohibicion_venta?: string | null;
  top_truck?: boolean | null;
}


export interface MotivoCampo {
  id: string;
  motivo_key: string;
  campo_key: string;
  label: string;
  ayuda: string | null;
  tipo: string;
  is_required: boolean;
  sort_order: number;
  opciones: OpcionesDef;
  placeholder: string | null;
  requerido_validacion?: boolean | null;
  is_active?: boolean;
  visibilidad?: string;
}


export interface Motivo {
  key: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  campos: MotivoCampo[];
}

export interface Visita {
  id: string;
  cod_cliente: number | null;
  cliente_externo: string | null;
  motivo_key: string | null;
  fecha: string;
  hora: string | null;
  tipo: string | null;
  validacion: string | null;
  nota_revision: string | null;
  revisado_por: string | null;
  revisado_en: string | null;
  latitud: number | null;
  longitud: number | null;
  ruta: string | null;
  zona: string | null;
  comercial_nombre: string | null;
  titulo: string | null;
  vendedor: string | null;
  user_id: string | null;
  transcripcion: string | null;
  observaciones: string | null;
  observaciones_original: string | null;
  campos: Record<string, unknown>;
  estado: string;
  origen: string;
  analisis_modelo: string | null;
  analisis_prompt_version: string | null;
  created_at: string;
}



export interface Planificada {
  id: string;
  user_id: string;
  cod_cliente: number;
  fecha: string;
  orden: number;
  estado: string;
  notas: string | null;
  visita_id: string | null;
}

/** Paginación en bloques de 1000 para saltar el límite de PostgREST. */
export async function fetchAll<T>(table: string, columns: string, order?: string): Promise<T[]> {
  const rows: T[] = [];
  const SIZE = 1000;
  for (let page = 0; page < 50; page++) {
    let q = supabase.from(table as never).select(columns).range(page * SIZE, page * SIZE + SIZE - 1);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < SIZE) break;
  }
  return rows;
}

export type OrdenClientes = "ventas" | "alfabetico";

export interface ClienteVisible extends Cliente {
  importe_actual: number;
  importe_anterior: number;
  ultima_compra: string | null;
  activo: boolean;
}

/** Listado de clientes visibles para el usuario, ordenado por ventas del año en curso. */
export function useClientes(soloActivos = true, orden: OrdenClientes = "ventas") {
  return useQuery({
    queryKey: ["crm_clientes", soloActivos],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const SIZE = 1000;
      const raw: Record<string, unknown>[] = [];
      for (let page = 0; page < 30; page++) {
        const { data, error } = await supabase
          .rpc("clientes_visibles" as never, { _solo_activos: soloActivos } as never)
          .range(page * SIZE, page * SIZE + SIZE - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as Record<string, unknown>[];
        raw.push(...batch);
        if (batch.length < SIZE) break;
      }
      return raw.map((r) => ({
        cod_cliente: Number(r.cod_cliente),
        cliente: String(r.cliente ?? ""),
        delegacion: (r.delegacion as string) ?? null,
        localidad: (r.localidad as string) ?? null,

        provincia: null,
        direccion: null,
        telefono: null,
        email: null,
        vendedor: (r.vendedor as string) ?? null,
        ruta: (r.ruta as string) ?? null,
        cod_tipo_cliente: null,
        observaciones_almacen: null,

        importe_actual: Number(r.importe_actual ?? 0),
        importe_anterior: Number(r.importe_anterior ?? 0),
        ultima_compra: (r.ultima_compra as string) ?? null,
        activo: Boolean(r.activo),
      })) as ClienteVisible[];
    },
    select: (rows) =>
      orden === "alfabetico"
        ? [...rows].sort((a, b) => a.cliente.localeCompare(b.cliente, "es"))
        : rows,
  });
}

/** Parámetros de configuración de la aplicación. */
export function useAppSetting(key: string, fallback: string) {
  return useQuery({
    queryKey: ["app_setting", key],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return ((data as { value?: string } | null)?.value ?? fallback) as string;
    },
  });
}


export function useCliente(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente", cod],
    enabled: cod != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("cod_cliente", cod!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Cliente | null;
    },
  });
}

export interface VentaMes {
  anio: number;
  mes: number;
  importe: number;
  margen: number;
  unidades: number;
  lineas: number;
}

/** Ventas mensuales del cliente desde el resumen de Maestro ISI. */
export function useClienteVentas(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente_ventas", cod],
    enabled: cod != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumen_cliente_mes")
        .select("anio, mes, importe, margen, unidades, lineas")
        .eq("cod_cliente", cod!)
        .order("anio")
        .order("mes");
      if (error) throw error;
      return (data ?? []) as unknown as VentaMes[];
    },
  });
}

export interface ClienteKpis {
  primera_compra: string | null;
  ultima_compra: string | null;
  dias_sin_comprar: number | null;
  num_referencias: number;
  num_lineas: number;
  importe_total: number;
  margen_total: number;
  importe_anio_actual: number;
  margen_anio_actual: number;
  importe_anio_anterior: number;
  margen_anio_anterior: number;
  importe_anio_anterior_ytd: number;
  num_documentos_actual: number;
  num_documentos_anterior: number;
  ticket_medio_actual: number;
  ticket_medio_anterior: number;
  lineas_por_documento: number;
  frecuencia_compra_dias: number | null;
  num_abonos: number;
  importe_abonos: number;
  canal_principal: string | null;
}

export interface DocumentoCliente {
  id_documento: string;
  fecha: string;
  hora: string | null;
  tipo_documento: string | null;
  operacion: string | null;
  canal: string | null;
  almacen: string | null;
  vendedor_linea: string | null;
  registrado_por: string | null;
  importe: number;
  margen: number;
  lineas: number;
  cod_cliente?: number;
  cliente?: string | null;
}

export interface DocumentoListado {
  id_documento: string;
  fecha: string;
  hora: string | null;
  tipo_documento: string | null;
  operacion: string | null;
  canal: string | null;
  almacen: string | null;
  vendedor_linea: string | null;
  registrado_por: string | null;
  motivo_abono: string | null;
  id_doc_enlazado: string | null;
  importe: number;
  margen: number;
  lineas: number;
  cod_cliente: number;
  cliente: string;
  total_filas: number;
}

export type DocumentosOrden =
  | "fecha"
  | "importe"
  | "lineas"
  | "cliente"
  | "operacion"
  | "almacen"
  | "registrado_por";

export interface DocumentosFiltros {
  anio: number | null;
  pagina: number;
  limite?: number;
  importeMin: number;
  importeMax?: number | null;
  buscar?: string | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  canal?: string | null;
  almacen?: string | null;
  registradoPor?: string | null;
  operacion?: string | null;
  motivoAbono?: string | null;
  delegacion?: string | null;
  vendedor?: string | null;
  orden?: DocumentosOrden;
  dir?: "asc" | "desc";
}

const vacio = (v: string | null | undefined) => (v && v.trim() !== "" ? v : null);

export function useDocumentosListado(f: DocumentosFiltros) {
  const limite = f.limite ?? 50;
  return useQuery({
    queryKey: ["crm_documentos_listado", { ...f, limite }],
    enabled: f.anio != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("documentos_listado" as never, {
        _anio: f.anio,
        _importe_min: f.importeMin,
        _limite: limite,
        _offset: (f.pagina - 1) * limite,
        _buscar: vacio(f.buscar),
        _importe_max: f.importeMax ?? null,
        _fecha_desde: vacio(f.fechaDesde),
        _fecha_hasta: vacio(f.fechaHasta),
        _canal: vacio(f.canal),
        _almacen: vacio(f.almacen),
        _registrado_por: vacio(f.registradoPor),
        _operacion: vacio(f.operacion),
        _motivo_abono: vacio(f.motivoAbono),
        _delegacion: vacio(f.delegacion),
        _vendedor: vacio(f.vendedor),
        _orden: f.orden ?? "fecha",
        _dir: f.dir ?? "desc",
      } as never);
      if (error) throw error;
      const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id_documento: String(r.id_documento ?? ""),
        fecha: String(r.fecha ?? ""),
        hora: (r.hora as string) ?? null,
        tipo_documento: (r.tipo_documento as string) ?? null,
        operacion: (r.operacion as string) ?? null,
        canal: (r.canal as string) ?? null,
        almacen: (r.almacen as string) ?? null,
        vendedor_linea: (r.vendedor_linea as string) ?? null,
        registrado_por: (r.registrado_por as string) ?? null,
        motivo_abono: (r.motivo_abono as string) ?? null,
        id_doc_enlazado: (r.id_doc_enlazado as string) ?? null,
        importe: Number(r.importe ?? 0),
        margen: Number(r.margen ?? 0),
        lineas: Number(r.lineas ?? 0),
        cod_cliente: Number(r.cod_cliente ?? 0),
        cliente: String(r.cliente ?? ""),
        total_filas: Number(r.total_filas ?? 0),
      })) as DocumentoListado[];
      return { rows, total: rows[0]?.total_filas ?? 0 };
    },
  });
}

export interface DocumentosOpciones {
  canales: string[];
  almacenes: string[];
  registrados_por: string[];
  operaciones: string[];
  motivos_abono: string[];
  delegaciones: string[];
  vendedores: string[];
}

export function useDocumentosFiltrosOpciones(anio: number | null) {
  return useQuery({
    queryKey: ["crm_documentos_filtros_opciones", anio],
    enabled: anio != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DocumentosOpciones> => {
      const { data, error } = await supabase.rpc("documentos_filtros_opciones" as never, {
        _anio: anio,
      } as never);
      if (error) throw error;
      const r = (((data ?? []) as unknown as Record<string, unknown>[])[0] ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => ((v as string[]) ?? []).filter(Boolean);
      return {
        canales: arr(r.canales),
        almacenes: arr(r.almacenes),
        registrados_por: arr(r.registrados_por),
        operaciones: arr(r.operaciones),
        motivos_abono: arr(r.motivos_abono),
        delegaciones: arr(r.delegaciones),
        vendedores: arr(r.vendedores),
      };
    },
  });
}


export function useClienteDocumentos(cod: number | null, limite = 100) {
  return useQuery({
    queryKey: ["crm_cliente_documentos", cod, limite],
    enabled: cod != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cliente_documentos" as never, {
        _cod: cod!,
        _limite: limite,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id_documento: String(r.id_documento ?? ""),
        fecha: String(r.fecha ?? ""),
        hora: (r.hora as string) ?? null,
        tipo_documento: (r.tipo_documento as string) ?? null,
        operacion: (r.operacion as string) ?? null,
        canal: (r.canal as string) ?? null,
        almacen: (r.almacen as string) ?? null,
        vendedor_linea: (r.vendedor_linea as string) ?? null,
        registrado_por: (r.registrado_por as string) ?? null,
        importe: Number(r.importe ?? 0),
        margen: Number(r.margen ?? 0),
        lineas: Number(r.lineas ?? 0),
      })) as DocumentoCliente[];
    },
  });
}

export interface LineaDocumento {
  referencia: string;
  descripcion: string | null;
  marca: string | null;
  familia: string | null;
  unidades: number;
  importe: number;
  margen: number;
}

export function useDocumentoLineas(cod: number | null, idDocumento: string | null) {
  return useQuery({
    queryKey: ["crm_documento_lineas", cod, idDocumento],
    enabled: cod != null && !!idDocumento,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cliente_documento_lineas" as never, {
        _cod: cod!,
        _id_documento: idDocumento!,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        referencia: String(r.referencia ?? ""),
        descripcion: (r.descripcion as string) ?? null,
        marca: (r.marca as string) ?? null,
        familia: (r.familia as string) ?? null,
        unidades: Number(r.unidades ?? 0),
        importe: Number(r.importe ?? 0),
        margen: Number(r.margen ?? 0),
      })) as LineaDocumento[];
    },
  });
}


export function useClienteKpis(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente_kpis", cod],
    enabled: cod != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cliente_kpis")
        .select("*")
        .eq("cod_cliente", cod!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClienteKpis) ?? null;
    },
  });
}

export interface ProductoCliente {
  referencia: string;
  descripcion: string | null;
  familia: string | null;
  marca: string | null;
  unidades: number;
  importe: number;
  margen: number;
  ultima_compra: string | null;
}

export function useClienteProductos(cod: number | null, anio: number | null = null) {
  return useQuery({
    queryKey: ["crm_cliente_productos", cod, anio],
    enabled: cod != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cliente_top_productos" as never, {
        _cod: cod!,
        _anio: anio,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        referencia: String(r.referencia ?? ""),
        descripcion: (r.descripcion as string) ?? null,
        familia: (r.familia as string) ?? null,
        marca: (r.marca as string) ?? null,
        unidades: Number(r.unidades ?? 0),
        importe: Number(r.importe ?? 0),
        margen: Number(r.margen ?? 0),
        ultima_compra: (r.ultima_compra as string) ?? null,
      })) as ProductoCliente[];
    },
  });
}

/** Reparto por familia y por marca del cliente. */
export function useClienteMix(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente_mix", cod],
    enabled: cod != null,
    queryFn: async () => {
      const [fRes, mRes] = await Promise.all([
        supabase.from("resumen_cliente_familia").select("anio, familia, importe, unidades").eq("cod_cliente", cod!),
        supabase.from("resumen_cliente_marca").select("anio, marca, importe, unidades").eq("cod_cliente", cod!),
      ]);
      if (fRes.error) throw fRes.error;
      if (mRes.error) throw mRes.error;
      return {
        familias: (fRes.data ?? []) as unknown as { anio: number; familia: string; importe: number }[],
        marcas: (mRes.data ?? []) as unknown as { anio: number; marca: string; importe: number }[],
      };
    },
  });
}

/** ¿El usuario actual puede ver márgenes? */
export function usePuedeVerMargen() {
  return useQuery({
    queryKey: ["puede_ver_margen"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return false;
      const { data, error } = await supabase
        .from("profiles")
        .select("ver_margen")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) return false;
      return Boolean((data as { ver_margen?: boolean } | null)?.ver_margen);
    },
  });
}


export function useClienteVisitas(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente_visitas", cod],
    enabled: cod != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas")
        .select("*")
        .eq("cod_cliente", cod!)
        .order("fecha", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Visita[];
    },
  });
}

export function useVisitas(limit = 200) {
  return useQuery({
    queryKey: ["crm_visitas", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Visita[];
    },
  });
}

/** Visitas registradas por comerciales pendientes de revisar o ya validadas. */
/**
 * Visitas para la pantalla de revisión.
 * `origen`: "app" (registradas en la app), "gespromo" (importadas) o "todas".
 * El filtro se aplica en la consulta para que el límite no se coma resultados.
 */
export function useVisitasRevision(origen: "app" | "gespromo" | "todas" = "app", limit = 1000) {
  return useQuery({
    queryKey: ["crm_visitas_revision", origen, limit],
    queryFn: async () => {
      let query = supabase.from("visitas").select("*");
      if (origen !== "todas") query = query.eq("origen", origen);
      const { data, error } = await query.order("fecha", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Visita[];
    },
  });
}

/** Validación y edición de visitas por el jefe comercial. */
export function useRevisionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm_visitas_revision"] });
    qc.invalidateQueries({ queryKey: ["crm_visitas"] });
    qc.invalidateQueries({ queryKey: ["crm_visita_bloques"] });
  };

  const revisar = useMutation({
    mutationFn: async (v: { id: string; validacion: string; nota_revision?: string | null; observaciones?: string | null; campos?: Record<string, unknown> }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { id, ...rest } = v;
      const { error } = await supabase
        .from("visitas")
        .update({ ...rest, revisado_por: auth?.user?.id ?? null, revisado_en: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { revisar };
}

/* ---------- Bloques de visita (una visita puede llevar varias plantillas) ---------- */

export interface VisitaBloque {
  id: string;
  visita_id: string;
  motivo_key: string | null;
  /** SOLO valores planos: { clave: valor }. La trazabilidad de la IA va en campos_meta. */
  campos: Record<string, unknown>;
  campos_meta: Record<string, unknown>;
  completo: boolean;
  validacion: string;
  nota_revision: string | null;
  revisado_por: string | null;
  revisado_en: string | null;
  orden: number;
  created_at: string;
}

/** Bloques de un conjunto de visitas, agrupados por visita_id. */
export function useVisitaBloques(visitaIds: string[]) {
  const ids = [...visitaIds].sort();
  return useQuery({
    queryKey: ["crm_visita_bloques", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const mapa = new Map<string, VisitaBloque[]>();
      for (let i = 0; i < ids.length; i += 300) {
        const { data, error } = await supabase
          .from("visita_bloques")
          .select("*")
          .in("visita_id", ids.slice(i, i + 300))
          .order("orden");
        if (error) throw error;
        for (const b of (data ?? []) as unknown as VisitaBloque[]) {
          const arr = mapa.get(b.visita_id) ?? [];
          arr.push(b);
          mapa.set(b.visita_id, arr);
        }
      }
      return mapa;
    },
  });
}

/** Revisión bloque a bloque. visitas.validacion la deriva el trigger de la base de datos. */
export function useBloqueMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm_visita_bloques"] });
    qc.invalidateQueries({ queryKey: ["crm_visitas_revision"] });
    qc.invalidateQueries({ queryKey: ["crm_visitas"] });
    qc.invalidateQueries({ queryKey: ["crm_cliente_visitas"] });
  };

  const revisarBloque = useMutation({
    mutationFn: async (b: { id: string; validacion: string; nota_revision?: string | null; campos?: Record<string, unknown> }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { id, ...rest } = b;
      const { error } = await supabase
        .from("visita_bloques")
        .update({ ...rest, revisado_por: auth?.user?.id ?? null, revisado_en: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { revisarBloque };
}

/** Crea los bloques de una visita recién guardada. */
export async function crearBloques(
  visitaId: string,
  bloques: {
    motivo_key: string;
    campos: Record<string, unknown>;
    campos_meta?: Record<string, unknown>;
    completo?: boolean;
  }[],
) {
  if (!bloques.length) return;
  const { error } = await supabase.from("visita_bloques").insert(
    bloques.map((b, i) => ({
      visita_id: visitaId,
      motivo_key: b.motivo_key,
      campos: b.campos,
      campos_meta: b.campos_meta ?? {},
      ...(b.completo === undefined ? {} : { completo: b.completo }),
      orden: i,
    })) as never,
  );
  if (error) throw error;
}

/**
 * Relanza el análisis sobre la transcripción YA guardada: no vuelve a transcribir.
 * Sustituye los bloques de la visita por los nuevos y anota modelo y versión de prompt.
 */
export function useReanalizarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; transcripcion: string; cliente_nombre?: string }) => {
      const { data, error } = await supabase.functions.invoke("visita-voz", {
        body: { transcripcion: v.transcripcion, cliente_nombre: v.cliente_nombre ?? "" },
      });
      if (error) throw new Error(error.message);
      const res = data as {
        bloques?: { motivo_key: string; campos: Record<string, unknown>; campos_meta?: Record<string, unknown> }[];
        resultado_visita?: string;
        analisis_modelo?: string;
        analisis_prompt_version?: string;
        error?: string;
      };
      if (res.error) throw new Error(res.error);
      const bloques = res.bloques ?? [];
      if (!bloques.length) throw new Error("El análisis no ha propuesto ningún bloque; se dejan los actuales.");

      const { error: delErr } = await supabase.from("visita_bloques").delete().eq("visita_id", v.id);
      if (delErr) throw delErr;
      await crearBloques(v.id, bloques.map((b) => ({ motivo_key: b.motivo_key, campos: b.campos, campos_meta: b.campos_meta })));

      const { error: upErr } = await supabase
        .from("visitas")
        .update({
          analisis_modelo: res.analisis_modelo ?? null,
          analisis_prompt_version: res.analisis_prompt_version ?? null,
        } as never)
        .eq("id", v.id);
      if (upErr) throw upErr;
      return bloques.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_visita_bloques"] });
      qc.invalidateQueries({ queryKey: ["crm_visitas_revision"] });
      qc.invalidateQueries({ queryKey: ["crm_visitas"] });
      qc.invalidateQueries({ queryKey: ["crm_cliente_visitas"] });
    },
  });
}

export function useMotivos() {
  return useQuery({
    queryKey: ["crm_motivos"],
    queryFn: async () => {
      const [mRes, cRes] = await Promise.all([
        supabase.from("motivos_visita").select("*").order("sort_order"),
        supabase.from("motivo_campos").select("*").order("sort_order"),
      ]);
      if (mRes.error) throw mRes.error;
      if (cRes.error) throw cRes.error;
      const campos = (cRes.data ?? []) as unknown as MotivoCampo[];
      return ((mRes.data ?? []) as unknown as Omit<Motivo, "campos">[]).map((m) => ({
        ...m,
        campos: campos.filter((c) => c.motivo_key === m.key),
      })) as Motivo[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Catálogos cerrados de opciones (competidores, canales de envío…). */
export function useCatalogos() {
  return useQuery({
    queryKey: ["crm_catalogos"],
    queryFn: async (): Promise<CatalogoMap> => {
      const { data, error } = await supabase
        .from("catalogos_opciones")
        .select("clave, valor, orden, is_active")
        .eq("is_active", true)
        .order("orden");
      if (error) throw error;
      const map: CatalogoMap = {};
      for (const row of (data ?? []) as { clave: string; valor: string }[]) {
        (map[row.clave] ??= []).push(row.valor);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}


/** Alta, edición y borrado de plantillas de visita (solo administración). */
export function useMotivosAdmin() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm_motivos"] });

  const guardarMotivo = useMutation({
    mutationFn: async (m: Partial<Motivo> & { key: string }) => {
      const { campos: _campos, ...row } = m as Motivo;
      const { error } = await supabase.from("motivos_visita").upsert(row as never, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const borrarMotivo = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from("motivos_visita").delete().eq("key", key);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const guardarCampo = useMutation({
    mutationFn: async (c: Partial<MotivoCampo> & { motivo_key: string; campo_key: string; label: string }) => {
      const { id, ...rest } = c as MotivoCampo;
      const { error } = id
        ? await supabase.from("motivo_campos").update(rest as never).eq("id", id)
        : await supabase.from("motivo_campos").insert(rest as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const borrarCampo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("motivo_campos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { guardarMotivo, borrarMotivo, guardarCampo, borrarCampo };
}


export function useAgenda(desde: string, hasta: string) {
  return useQuery({
    queryKey: ["crm_agenda", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas_planificadas")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("orden");
      if (error) throw error;
      return (data ?? []) as unknown as Planificada[];
    },
  });
}

export function useAgendaMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm_agenda"] });

  const add = useMutation({
    mutationFn: async (p: { user_id: string; cod_cliente: number; fecha: string; orden: number }) => {
      const { error } = await supabase.from("visitas_planificadas").insert(p);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Planificada>) => {
      const { error } = await supabase.from("visitas_planificadas").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visitas_planificadas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, update, remove };
}

export { eur, num, eurK, pct } from "@/lib/format";

export const fechaCorta = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });


export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------------------------------------------------------------------------
 * Situaciones especiales de cliente (concurso, cierre, licitación perdida…)
 * Solo filtran alertas y listados de gestión: nunca afectan a las ventas.
 * ------------------------------------------------------------------------- */

export interface SituacionCliente {
  id: string;
  cod_cliente: number;
  categoria: string;
  etiqueta: string;
  nota: string | null;
  activo: boolean;
  efecto: string;
  desde: string;
  hasta: string | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORIAS_SITUACION: { key: string; label: string }[] = [
  { key: "cierre", label: "Cierre / cese de actividad" },
  { key: "concurso", label: "Concurso de acreedores" },
  { key: "licitacion", label: "Pérdida de contrato o licitación" },
  { key: "venta_prohibida", label: "Venta prohibida / solo contado" },
  { key: "absorbido", label: "Cliente absorbido o fusionado" },
  { key: "temporal", label: "Bajada temporal conocida" },
  { key: "perdida_cliente_final", label: "Pérdida de un cliente final" },
  { key: "reduccion_flota", label: "Reducción de flota o actividad" },
  { key: "obra_finalizada", label: "Obra o proyecto finalizado" },
  { key: "estacionalidad", label: "Estacionalidad conocida" },
  { key: "otros", label: "Otros" },
];

export const EFECTOS_SITUACION: { key: string; label: string; ayuda: string }[] = [
  { key: "ocultar", label: "Ocultar de alertas", ayuda: "No aparece en Atención: no requiere acción comercial." },
  { key: "justificada", label: "Caída justificada", ayuda: "Sigue apareciendo, pero con el motivo de la bajada." },
  { key: "informativa", label: "Solo informativa", ayuda: "Solo etiqueta en ficha y listado; no toca las alertas." },
];

export const etiquetaEfecto = (key: string) =>
  EFECTOS_SITUACION.find((e) => e.key === key)?.label ?? key;

export const etiquetaCategoria = (key: string) =>
  CATEGORIAS_SITUACION.find((c) => c.key === key)?.label ?? key;

const esSituacionVigente = (s: SituacionCliente) => {
  const hoy = hoyISO();
  return s.activo && s.desde <= hoy && (!s.hasta || s.hasta >= hoy);
};

/** Todas las situaciones registradas visibles para el usuario. */
export function useSituaciones() {
  return useQuery({
    queryKey: ["crm_situaciones"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("situaciones_cliente" as never)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SituacionCliente[];
    },
  });
}

/** Mapa cod_cliente → situación vigente, para pintar etiquetas. */
export function useSituacionesVigentes() {
  const q = useSituaciones();
  const mapa = new Map<number, SituacionCliente>();
  for (const s of q.data ?? []) {
    if (esSituacionVigente(s) && !mapa.has(s.cod_cliente)) mapa.set(s.cod_cliente, s);
  }
  return { ...q, mapa };
}

export function useSituacionesMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm_situaciones"] });

  const guardar = useMutation({
    mutationFn: async (s: Partial<SituacionCliente> & { cod_cliente: number; etiqueta: string }) => {
      const { id, created_at, updated_at, ...rest } = s as SituacionCliente;
      if (id) {
        const { error } = await supabase.from("situaciones_cliente" as never).update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("situaciones_cliente" as never)
          .insert({ ...rest, created_by: auth?.user?.id ?? null } as never);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("situaciones_cliente" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { guardar, borrar };
}

/* ---------------------------------------------------------------------------
 * Rutas comerciales
 * ------------------------------------------------------------------------- */

export interface RutaResumen {
  ruta: string;
  clientes: number;
  clientes_activos: number;
  con_geo: number;
  importe_actual: number;
  importe_anterior_ytd: number;
  sin_visitar: number;
  ultima_visita: string | null;
}

export interface RutaCliente {
  cod_cliente: number;
  cliente: string;
  vendedor: string | null;
  telefono: string | null;
  localidad: string | null;
  latitud: number | null;
  longitud: number | null;
  importe_actual: number;
  importe_anterior_ytd: number;
  dias_sin_comprar: number | null;
  ultima_compra: string | null;
  ultima_visita: string | null;
  situacion_etiqueta: string | null;
  situacion_categoria: string | null;
  situacion_efecto: string | null;
  activo: boolean;
}

/** Rutas comerciales visibles para el usuario, con sus indicadores. */
export function useRutas() {
  return useQuery({
    queryKey: ["crm_rutas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rutas_visibles" as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        ruta: String(r.ruta ?? ""),
        clientes: Number(r.clientes ?? 0),
        clientes_activos: Number(r.clientes_activos ?? 0),
        con_geo: Number(r.con_geo ?? 0),
        importe_actual: Number(r.importe_actual ?? 0),
        importe_anterior_ytd: Number(r.importe_anterior_ytd ?? 0),
        sin_visitar: Number(r.sin_visitar ?? 0),
        ultima_visita: (r.ultima_visita as string) ?? null,
      })) as RutaResumen[];
    },
  });
}

/** Clientes que pertenecen a una ruta concreta (por defecto solo los activos). */
export function useRutaClientes(ruta: string | undefined, soloActivos = true) {
  return useQuery({
    queryKey: ["crm_ruta_clientes", ruta, soloActivos],
    enabled: !!ruta,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ruta_clientes" as never, {
        _ruta: ruta,
        _solo_activos: soloActivos,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        cod_cliente: Number(r.cod_cliente),
        cliente: String(r.cliente ?? ""),
        vendedor: (r.vendedor as string) ?? null,
        telefono: (r.telefono as string) ?? null,
        localidad: (r.localidad as string) ?? null,
        latitud: r.latitud == null ? null : Number(r.latitud),
        longitud: r.longitud == null ? null : Number(r.longitud),
        importe_actual: Number(r.importe_actual ?? 0),
        importe_anterior_ytd: Number(r.importe_anterior_ytd ?? 0),
        dias_sin_comprar: r.dias_sin_comprar == null ? null : Number(r.dias_sin_comprar),
        ultima_compra: (r.ultima_compra as string) ?? null,
        ultima_visita: (r.ultima_visita as string) ?? null,
        situacion_etiqueta: (r.situacion_etiqueta as string) ?? null,
        situacion_categoria: (r.situacion_categoria as string) ?? null,
        situacion_efecto: (r.situacion_efecto as string) ?? null,
        activo: Boolean(r.activo),
      })) as RutaCliente[];
    },
  });
}

/** Coordenadas de un conjunto de clientes (para optimizar recorridos). */
export function useCoordsClientes(codigos: number[]) {
  const key = [...codigos].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["crm_coords_clientes", key],
    enabled: codigos.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("cod_cliente,cliente,latitud,longitud")
        .in("cod_cliente", codigos);
      if (error) throw error;
      const m = new Map<number, { latitud: number | null; longitud: number | null }>();
      for (const r of data ?? []) {
        m.set(Number(r.cod_cliente), {
          latitud: r.latitud == null ? null : Number(r.latitud),
          longitud: r.longitud == null ? null : Number(r.longitud),
        });
      }
      return m;
    },
  });
}

/** Reordena las visitas planificadas de un día. */
export function useReordenarAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; orden: number }[]) => {
      for (const it of items) {
        const { error } = await supabase
          .from("visitas_planificadas")
          .update({ orden: it.orden })
          .eq("id", it.id);
        if (error) throw error;
      }
      return items.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_agenda"] }),
  });
}


/** Vuelca los clientes seleccionados de una ruta a la agenda de un día. */
export function usePlanificarRuta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ruta,
      fecha,
      codigos,
    }: {
      userId: string;
      ruta: string;
      fecha: string;
      codigos: number[];
    }) => {
      const { data: existentes, error: errExist } = await supabase
        .from("visitas_planificadas")
        .select("cod_cliente,orden")
        .eq("user_id", userId)
        .eq("fecha", fecha);
      if (errExist) throw errExist;
      const yaPlanificados = new Set((existentes ?? []).map((e) => Number(e.cod_cliente)));
      const desde = (existentes ?? []).reduce((m, e) => Math.max(m, Number(e.orden ?? 0)), 0);
      const nuevos = codigos.filter((c) => !yaPlanificados.has(c));
      if (nuevos.length === 0) return 0;
      const { error } = await supabase.from("visitas_planificadas").insert(
        nuevos.map((cod, i) => ({
          user_id: userId,
          cod_cliente: cod,
          fecha,
          orden: desde + i + 1,
          notas: `Ruta ${ruta}`,
        })),
      );
      if (error) throw error;
      return nuevos.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_agenda"] }),
  });
}

/** Tendencia de ventas del cliente: crece, estable o baja (umbral ±5 %). */
export function tendencia(actual: number, anterior: number): "sube" | "baja" | "estable" | "nuevo" {
  if (anterior <= 0) return actual > 0 ? "nuevo" : "estable";
  const v = (actual - anterior) / anterior;
  if (v > 0.05) return "sube";
  if (v < -0.05) return "baja";
  return "estable";
}

/* ---------------------------------------------------------------------------
 * Perfil comercial del cliente (modelo de hechos).
 * El valor vigente no se almacena: se deriva del hecho más reciente no
 * descartado. Editar un valor es SIEMPRE un INSERT nuevo, nunca un UPDATE.
 * ------------------------------------------------------------------------- */

export interface PerfilAtributo {
  key: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  opciones: OpcionesDef;
  unidad: string | null;
  grupo: string;
  sort_order: number;
}

export interface PerfilHecho {
  id: string;
  cod_cliente: number;
  atributo_key: string;
  valor_texto: string;
  valor_num: number | null;
  visita_id: string | null;
  bloque_id: string | null;
  comercial_nombre: string | null;
  observado_en: string;
  confianza: string | null;
  cita: string | null;
  fuente: string;
  estado: string;
}

/** Catálogo de atributos de perfil activos, ordenados por grupo y posición. */
export function usePerfilAtributos() {
  return useQuery({
    queryKey: ["crm_perfil_atributos"],
    queryFn: async (): Promise<PerfilAtributo[]> => {
      const { data, error } = await supabase
        .from("perfil_atributos")
        .select("key, nombre, descripcion, tipo, opciones, unidad, grupo, sort_order")
        .eq("is_active", true)
        .order("grupo")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as PerfilAtributo[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Valor vigente de cada atributo para un cliente. */
export function useClientePerfil(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente_perfil", cod],
    enabled: cod != null,
    queryFn: async (): Promise<PerfilHecho[]> => {
      const { data, error } = await supabase
        .from("v_cliente_perfil_vigente")
        .select(
          "id, cod_cliente, atributo_key, valor_texto, valor_num, visita_id, bloque_id, comercial_nombre, observado_en, confianza, cita, fuente, estado",
        )
        .eq("cod_cliente", cod!);
      if (error) throw error;
      return (data ?? []) as unknown as PerfilHecho[];
    },
  });
}

/** Historial de hechos no descartados de un cliente, ordenado por reciente primero. */
export interface PerfilHechoHistorico extends PerfilHecho {
  created_at: string;
}

export function useClientePerfilHistorico(cod: number | null) {
  return useQuery({
    queryKey: ["crm_cliente_perfil_historico", cod],
    enabled: cod != null,
    queryFn: async (): Promise<PerfilHechoHistorico[]> => {
      const { data, error } = await supabase
        .from("cliente_perfil_datos")
        .select(
          "id, cod_cliente, atributo_key, valor_texto, valor_num, visita_id, bloque_id, comercial_nombre, observado_en, confianza, cita, fuente, estado, created_at",
        )
        .eq("cod_cliente", cod!)
        .neq("estado", "descartado")
        .order("observado_en", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PerfilHechoHistorico[];
    },
  });
}

export interface NuevoHechoPerfil {
  cod_cliente: number;
  atributo_key: string;
  valor_texto: string;
  valor_num: number | null;
}

/** Confirmar un hecho existente y registrar hechos nuevos (fuente manual). */
export function usePerfilMutations(cod: number | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm_cliente_perfil", cod] });
    qc.invalidateQueries({ queryKey: ["crm_cliente_perfil_historico", cod] });
  };

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cliente_perfil_datos")
        .update({
          estado: "confirmado",
          confirmado_por: auth.user?.id ?? null,
          confirmado_en: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const guardarValor = useMutation({
    mutationFn: async (h: NuevoHechoPerfil) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      let nombre: string | null = null;
      if (userId) {
        const { data: perfil } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle();
        nombre = perfil?.full_name || auth.user?.email || null;
      }
      const { error } = await supabase.from("cliente_perfil_datos").insert({
        cod_cliente: h.cod_cliente,
        atributo_key: h.atributo_key,
        valor_texto: h.valor_texto,
        valor_num: h.valor_num,
        visita_id: null,
        bloque_id: null,
        user_id: userId,
        comercial_nombre: nombre,
        observado_en: hoyISO(),
        fuente: "manual",
        estado: "confirmado",
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { confirmar, guardarValor };
}

// ---------------------------------------------------------------------------
// Actividad interna (solo gerencia)
// ---------------------------------------------------------------------------

export interface ActividadUsuario {
  registrado_por: string;
  almacen_principal: string | null;
  n_almacenes: number;
  importe_vendido: number;
  docs_venta: number;
  n_abonos: number;
  importe_abonado: number;
  abonos_ajenos: number;
  abonos_atribuidos: number;
  importe_atribuido: number;
  importe_neto: number;
  clientes_distintos: number;
  ticket_medio: number | null;
  pct_abonos: number | null;
  pct_importe_abonado: number | null;
}

export interface ActividadAlmacen {
  almacen: string;
  importe_vendido: number;
  docs_venta: number;
  n_abonos: number;
  importe_abonado: number;
  abonos_atribuidos: number;
  importe_atribuido: number;
  importe_neto: number;
  clientes_distintos: number;
  ticket_medio: number | null;
  pct_abonos: number | null;
  pct_importe_abonado: number | null;
  n_usuarios: number;
}

export function useActividadFiltros() {
  return useQuery({
    queryKey: ["actividad_interna_filtros"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ anios: number[]; almacenes: string[] }> => {
      const { data, error } = await supabase.rpc("actividad_interna_filtros" as never);
      if (error) throw error;
      const r = (((data ?? []) as unknown as Record<string, unknown>[])[0] ?? {}) as Record<string, unknown>;
      return {
        anios: ((r.anios as number[]) ?? []).filter((v) => v != null),
        almacenes: ((r.almacenes as string[]) ?? []).filter(Boolean),
      };
    },
  });
}

export function useActividadUsuarios(anio: number | null, almacen: string | null) {
  return useQuery({
    queryKey: ["actividad_interna_usuarios", anio, almacen],
    enabled: anio != null,
    queryFn: async (): Promise<ActividadUsuario[]> => {
      const { data, error } = await supabase.rpc("actividad_interna_usuarios" as never, {
        _anio: anio,
        _almacen: almacen,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as ActividadUsuario[]);
    },
  });
}

export function useActividadAlmacenes(anio: number | null) {
  return useQuery({
    queryKey: ["actividad_interna_almacenes", anio],
    enabled: anio != null,
    queryFn: async (): Promise<ActividadAlmacen[]> => {
      const { data, error } = await supabase.rpc("actividad_interna_almacenes" as never, {
        _anio: anio,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as ActividadAlmacen[]);
    },
  });
}
