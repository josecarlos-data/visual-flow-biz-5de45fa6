export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _diag_p1: {
        Row: {
          creado: string | null
          filas: number | null
          fn: string | null
          ms: number | null
          nota: string | null
          paso: string | null
        }
        Insert: {
          creado?: string | null
          filas?: number | null
          fn?: string | null
          ms?: number | null
          nota?: string | null
          paso?: string | null
        }
        Update: {
          creado?: string | null
          filas?: number | null
          fn?: string | null
          ms?: number | null
          nota?: string | null
          paso?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      catalogos_opciones: {
        Row: {
          clave: string
          created_at: string
          id: string
          is_active: boolean
          nota: string | null
          orden: number
          updated_at: string
          valor: string
        }
        Insert: {
          clave: string
          created_at?: string
          id?: string
          is_active?: boolean
          nota?: string | null
          orden?: number
          updated_at?: string
          valor: string
        }
        Update: {
          clave?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nota?: string | null
          orden?: number
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      cliente_insights: {
        Row: {
          alertas: Json
          argumentario: Json
          cod_cliente: number
          created_at: string
          generado_en: string
          id: string
          oportunidades: Json
          resumen: string | null
          updated_at: string
        }
        Insert: {
          alertas?: Json
          argumentario?: Json
          cod_cliente: number
          created_at?: string
          generado_en?: string
          id?: string
          oportunidades?: Json
          resumen?: string | null
          updated_at?: string
        }
        Update: {
          alertas?: Json
          argumentario?: Json
          cod_cliente?: number
          created_at?: string
          generado_en?: string
          id?: string
          oportunidades?: Json
          resumen?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cliente_kpis: {
        Row: {
          actualizado_en: string
          canal_principal: string | null
          cod_cliente: number
          dias_activos_ultimo_ano: number | null
          dias_sin_comprar: number | null
          frecuencia_compra_dias: number | null
          importe_abonos: number
          importe_anio_actual: number
          importe_anio_anterior: number
          importe_anio_anterior_ytd: number
          importe_total: number
          lineas_por_documento: number
          margen_anio_actual: number
          margen_anio_anterior: number
          margen_total: number
          num_abonos: number
          num_documentos_actual: number
          num_documentos_anterior: number
          num_lineas: number
          num_referencias: number
          primera_compra: string | null
          ticket_medio_actual: number
          ticket_medio_anterior: number
          ultima_compra: string | null
        }
        Insert: {
          actualizado_en?: string
          canal_principal?: string | null
          cod_cliente: number
          dias_activos_ultimo_ano?: number | null
          dias_sin_comprar?: number | null
          frecuencia_compra_dias?: number | null
          importe_abonos?: number
          importe_anio_actual?: number
          importe_anio_anterior?: number
          importe_anio_anterior_ytd?: number
          importe_total?: number
          lineas_por_documento?: number
          margen_anio_actual?: number
          margen_anio_anterior?: number
          margen_total?: number
          num_abonos?: number
          num_documentos_actual?: number
          num_documentos_anterior?: number
          num_lineas?: number
          num_referencias?: number
          primera_compra?: string | null
          ticket_medio_actual?: number
          ticket_medio_anterior?: number
          ultima_compra?: string | null
        }
        Update: {
          actualizado_en?: string
          canal_principal?: string | null
          cod_cliente?: number
          dias_activos_ultimo_ano?: number | null
          dias_sin_comprar?: number | null
          frecuencia_compra_dias?: number | null
          importe_abonos?: number
          importe_anio_actual?: number
          importe_anio_anterior?: number
          importe_anio_anterior_ytd?: number
          importe_total?: number
          lineas_por_documento?: number
          margen_anio_actual?: number
          margen_anio_anterior?: number
          margen_total?: number
          num_abonos?: number
          num_documentos_actual?: number
          num_documentos_anterior?: number
          num_lineas?: number
          num_referencias?: number
          primera_compra?: string | null
          ticket_medio_actual?: number
          ticket_medio_anterior?: number
          ultima_compra?: string | null
        }
        Relationships: []
      }
      cliente_perfil_datos: {
        Row: {
          atributo_key: string
          bloque_id: string | null
          cita: string | null
          cod_cliente: number
          comercial_nombre: string | null
          confianza: string | null
          confirmado_en: string | null
          confirmado_por: string | null
          created_at: string
          descartado_en: string | null
          descartado_por: string | null
          estado: string
          fuente: string
          id: string
          motivo_descarte: string | null
          observado_en: string
          updated_at: string
          user_id: string | null
          valor_num: number | null
          valor_texto: string
          visita_id: string | null
        }
        Insert: {
          atributo_key: string
          bloque_id?: string | null
          cita?: string | null
          cod_cliente: number
          comercial_nombre?: string | null
          confianza?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          created_at?: string
          descartado_en?: string | null
          descartado_por?: string | null
          estado?: string
          fuente?: string
          id?: string
          motivo_descarte?: string | null
          observado_en: string
          updated_at?: string
          user_id?: string | null
          valor_num?: number | null
          valor_texto: string
          visita_id?: string | null
        }
        Update: {
          atributo_key?: string
          bloque_id?: string | null
          cita?: string | null
          cod_cliente?: number
          comercial_nombre?: string | null
          confianza?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          created_at?: string
          descartado_en?: string | null
          descartado_por?: string | null
          estado?: string
          fuente?: string
          id?: string
          motivo_descarte?: string | null
          observado_en?: string
          updated_at?: string
          user_id?: string | null
          valor_num?: number | null
          valor_texto?: string
          visita_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_perfil_datos_atributo_key_fkey"
            columns: ["atributo_key"]
            isOneToOne: false
            referencedRelation: "perfil_atributos"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "visita_bloques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_cod_cliente_fkey"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cif: string | null
          cliente: string
          cod_cliente: number
          cod_delegacion: string | null
          cod_postal: string | null
          cod_prohibicion_venta: string | null
          cod_rappel: string | null
          cod_tipo_cliente: string | null
          cod_vendedor: string | null
          created_at: string
          crecimiento_previsto: number | null
          delegacion: string | null
          direccion: string | null
          email: string | null
          extra: Json
          fecha_alta: string | null
          grupo: string | null
          grupo_rappel: string | null
          gsmart_comercial: string | null
          gsmart_delegacion: string | null
          id: string
          latitud: number | null
          localidad: string | null
          longitud: number | null
          num_empleados_taller: number | null
          observaciones_almacen: string | null
          persona_contacto: string | null
          prohibicion_venta: string | null
          provincia: string | null
          proyeccion_2026: number | null
          razon_social: string | null
          ruta: string | null
          ruta_comercial: string | null
          ruta_especial: string | null
          telefono: string | null
          telefono2: string | null
          tipo_cliente: string | null
          top_truck: boolean
          tramos_rappel: string | null
          transporte: number | null
          updated_at: string
          vendedor: string | null
          web: string | null
        }
        Insert: {
          cif?: string | null
          cliente: string
          cod_cliente: number
          cod_delegacion?: string | null
          cod_postal?: string | null
          cod_prohibicion_venta?: string | null
          cod_rappel?: string | null
          cod_tipo_cliente?: string | null
          cod_vendedor?: string | null
          created_at?: string
          crecimiento_previsto?: number | null
          delegacion?: string | null
          direccion?: string | null
          email?: string | null
          extra?: Json
          fecha_alta?: string | null
          grupo?: string | null
          grupo_rappel?: string | null
          gsmart_comercial?: string | null
          gsmart_delegacion?: string | null
          id?: string
          latitud?: number | null
          localidad?: string | null
          longitud?: number | null
          num_empleados_taller?: number | null
          observaciones_almacen?: string | null
          persona_contacto?: string | null
          prohibicion_venta?: string | null
          provincia?: string | null
          proyeccion_2026?: number | null
          razon_social?: string | null
          ruta?: string | null
          ruta_comercial?: string | null
          ruta_especial?: string | null
          telefono?: string | null
          telefono2?: string | null
          tipo_cliente?: string | null
          top_truck?: boolean
          tramos_rappel?: string | null
          transporte?: number | null
          updated_at?: string
          vendedor?: string | null
          web?: string | null
        }
        Update: {
          cif?: string | null
          cliente?: string
          cod_cliente?: number
          cod_delegacion?: string | null
          cod_postal?: string | null
          cod_prohibicion_venta?: string | null
          cod_rappel?: string | null
          cod_tipo_cliente?: string | null
          cod_vendedor?: string | null
          created_at?: string
          crecimiento_previsto?: number | null
          delegacion?: string | null
          direccion?: string | null
          email?: string | null
          extra?: Json
          fecha_alta?: string | null
          grupo?: string | null
          grupo_rappel?: string | null
          gsmart_comercial?: string | null
          gsmart_delegacion?: string | null
          id?: string
          latitud?: number | null
          localidad?: string | null
          longitud?: number | null
          num_empleados_taller?: number | null
          observaciones_almacen?: string | null
          persona_contacto?: string | null
          prohibicion_venta?: string | null
          provincia?: string | null
          proyeccion_2026?: number | null
          razon_social?: string | null
          ruta?: string | null
          ruta_comercial?: string | null
          ruta_especial?: string | null
          telefono?: string | null
          telefono2?: string | null
          tipo_cliente?: string | null
          top_truck?: boolean
          tramos_rappel?: string | null
          transporte?: number | null
          updated_at?: string
          vendedor?: string | null
          web?: string | null
        }
        Relationships: []
      }
      compras: {
        Row: {
          categoria: string | null
          created_at: string
          fecha: string
          id: string
          importe: number
          proveedor: string
          referencia: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          fecha: string
          id?: string
          importe?: number
          proveedor: string
          referencia: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          fecha?: string
          id?: string
          importe?: number
          proveedor?: string
          referencia?: string
          updated_at?: string
        }
        Relationships: []
      }
      dashboards: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          is_active: boolean
          key: string
          name: string
          route: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          is_active?: boolean
          key: string
          name: string
          route: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          is_active?: boolean
          key?: string
          name?: string
          route?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      motivo_campos: {
        Row: {
          ayuda: string | null
          campo_key: string
          created_at: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          motivo_key: string
          opciones: Json
          perfil_atributo_key: string | null
          placeholder: string | null
          requerido_validacion: boolean
          sort_order: number
          tipo: string
          updated_at: string
          visibilidad: string
        }
        Insert: {
          ayuda?: string | null
          campo_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          motivo_key: string
          opciones?: Json
          perfil_atributo_key?: string | null
          placeholder?: string | null
          requerido_validacion?: boolean
          sort_order?: number
          tipo?: string
          updated_at?: string
          visibilidad?: string
        }
        Update: {
          ayuda?: string | null
          campo_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          motivo_key?: string
          opciones?: Json
          perfil_atributo_key?: string | null
          placeholder?: string | null
          requerido_validacion?: boolean
          sort_order?: number
          tipo?: string
          updated_at?: string
          visibilidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "motivo_campos_motivo_key_fkey"
            columns: ["motivo_key"]
            isOneToOne: false
            referencedRelation: "motivos_visita"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "motivo_campos_perfil_atributo_key_fkey"
            columns: ["perfil_atributo_key"]
            isOneToOne: false
            referencedRelation: "perfil_atributos"
            referencedColumns: ["key"]
          },
        ]
      }
      motivos_visita: {
        Row: {
          color: string | null
          created_at: string
          descripcion: string | null
          is_active: boolean
          key: string
          nombre: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          descripcion?: string | null
          is_active?: boolean
          key: string
          nombre: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          descripcion?: string | null
          is_active?: boolean
          key?: string
          nombre?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      objetivos: {
        Row: {
          activo: boolean
          anio: number
          base_anio_anterior: number
          cod_vendedor: string | null
          created_at: string
          created_by: string | null
          id: string
          importe_objetivo: number
          nota: string | null
          porcentaje: number
          ruta: string | null
          tipo: string
          updated_at: string
          vendedor: string
        }
        Insert: {
          activo?: boolean
          anio: number
          base_anio_anterior?: number
          cod_vendedor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          importe_objetivo?: number
          nota?: string | null
          porcentaje?: number
          ruta?: string | null
          tipo?: string
          updated_at?: string
          vendedor: string
        }
        Update: {
          activo?: boolean
          anio?: number
          base_anio_anterior?: number
          cod_vendedor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          importe_objetivo?: number
          nota?: string | null
          porcentaje?: number
          ruta?: string | null
          tipo?: string
          updated_at?: string
          vendedor?: string
        }
        Relationships: []
      }
      perfil_atributos: {
        Row: {
          caduca_dias: number | null
          created_at: string
          descripcion: string | null
          grupo: string
          is_active: boolean
          key: string
          nombre: string
          opciones: Json
          sort_order: number
          tipo: string
          unidad: string | null
          updated_at: string
        }
        Insert: {
          caduca_dias?: number | null
          created_at?: string
          descripcion?: string | null
          grupo?: string
          is_active?: boolean
          key: string
          nombre: string
          opciones?: Json
          sort_order?: number
          tipo?: string
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          caduca_dias?: number | null
          created_at?: string
          descripcion?: string | null
          grupo?: string
          is_active?: boolean
          key?: string
          nombre?: string
          opciones?: Json
          sort_order?: number
          tipo?: string
          unidad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      productos: {
        Row: {
          cod_proveedor: string | null
          created_at: string
          descripcion: string | null
          estado: string | null
          familia: string | null
          familia_marca: string | null
          familia_nombre: string | null
          id: string
          importe_periodo: number | null
          marca: string | null
          marca_nombre: string | null
          observaciones: string | null
          precio: number | null
          primera_venta: string | null
          proveedor: string | null
          referencia: string
          sustituida_por: string | null
          sustituye_a: string | null
          ultima_venta: string | null
          unidades_periodo: number | null
          updated_at: string
        }
        Insert: {
          cod_proveedor?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string | null
          familia?: string | null
          familia_marca?: string | null
          familia_nombre?: string | null
          id?: string
          importe_periodo?: number | null
          marca?: string | null
          marca_nombre?: string | null
          observaciones?: string | null
          precio?: number | null
          primera_venta?: string | null
          proveedor?: string | null
          referencia: string
          sustituida_por?: string | null
          sustituye_a?: string | null
          ultima_venta?: string | null
          unidades_periodo?: number | null
          updated_at?: string
        }
        Update: {
          cod_proveedor?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string | null
          familia?: string | null
          familia_marca?: string | null
          familia_nombre?: string | null
          id?: string
          importe_periodo?: number | null
          marca?: string | null
          marca_nombre?: string | null
          observaciones?: string | null
          precio?: number | null
          primera_venta?: string | null
          proveedor?: string | null
          referencia?: string
          sustituida_por?: string | null
          sustituye_a?: string | null
          ultima_venta?: string | null
          unidades_periodo?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          delegacion: string | null
          email: string | null
          employee_code: string | null
          full_name: string | null
          id: string
          is_approved: boolean
          updated_at: string
          user_id: string
          ver_margen: boolean
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          delegacion?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean
          updated_at?: string
          user_id: string
          ver_margen?: boolean
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          delegacion?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean
          updated_at?: string
          user_id?: string
          ver_margen?: boolean
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      resumen_cliente_familia: {
        Row: {
          anio: number
          cod_cliente: number
          familia: string
          importe: number
          margen: number
          ultima_compra: string | null
          unidades: number
        }
        Insert: {
          anio: number
          cod_cliente: number
          familia: string
          importe?: number
          margen?: number
          ultima_compra?: string | null
          unidades?: number
        }
        Update: {
          anio?: number
          cod_cliente?: number
          familia?: string
          importe?: number
          margen?: number
          ultima_compra?: string | null
          unidades?: number
        }
        Relationships: []
      }
      resumen_cliente_marca: {
        Row: {
          anio: number
          cod_cliente: number
          importe: number
          marca: string
          margen: number
          unidades: number
        }
        Insert: {
          anio: number
          cod_cliente: number
          importe?: number
          marca: string
          margen?: number
          unidades?: number
        }
        Update: {
          anio?: number
          cod_cliente?: number
          importe?: number
          marca?: string
          margen?: number
          unidades?: number
        }
        Relationships: []
      }
      resumen_cliente_mes: {
        Row: {
          anio: number
          cod_cliente: number
          importe: number
          lineas: number
          margen: number
          mes: number
          unidades: number
        }
        Insert: {
          anio: number
          cod_cliente: number
          importe?: number
          lineas?: number
          margen?: number
          mes: number
          unidades?: number
        }
        Update: {
          anio?: number
          cod_cliente?: number
          importe?: number
          lineas?: number
          margen?: number
          mes?: number
          unidades?: number
        }
        Relationships: []
      }
      resumen_documentos: {
        Row: {
          abonos: number
          anio: number
          canal: string
          cod_cliente: number
          documentos: number
          importe: number
          importe_abonos: number
          lineas: number
          margen: number
          mes: number
          unidades: number
        }
        Insert: {
          abonos?: number
          anio: number
          canal?: string
          cod_cliente: number
          documentos?: number
          importe?: number
          importe_abonos?: number
          lineas?: number
          margen?: number
          mes: number
          unidades?: number
        }
        Update: {
          abonos?: number
          anio?: number
          canal?: string
          cod_cliente?: number
          documentos?: number
          importe?: number
          importe_abonos?: number
          lineas?: number
          margen?: number
          mes?: number
          unidades?: number
        }
        Relationships: []
      }
      rutas: {
        Row: {
          codigo: string
          created_at: string
          delegacion: string | null
          id: string
          nombre: string
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          delegacion?: string | null
          id?: string
          nombre: string
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          delegacion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      situaciones_cliente: {
        Row: {
          activo: boolean
          categoria: string
          cod_cliente: number
          created_at: string
          created_by: string | null
          desde: string
          efecto: string
          etiqueta: string
          hasta: string | null
          id: string
          nota: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria?: string
          cod_cliente: number
          created_at?: string
          created_by?: string | null
          desde?: string
          efecto?: string
          etiqueta: string
          hasta?: string | null
          id?: string
          nota?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          cod_cliente?: number
          created_at?: string
          created_by?: string | null
          desde?: string
          efecto?: string
          etiqueta?: string
          hasta?: string | null
          id?: string
          nota?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "situaciones_cliente_cod_cliente_fkey"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
        ]
      }
      sync_config: {
        Row: {
          created_at: string
          dataset_key: string
          file_url: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_message: string | null
          last_sync_status: string | null
          sheet_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dataset_key: string
          file_url?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          sheet_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dataset_key?: string
          file_url?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          sheet_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          created_at: string
          dataset_key: string
          id: string
          message: string | null
          rows_processed: number
          status: string
        }
        Insert: {
          created_at?: string
          dataset_key: string
          id?: string
          message?: string | null
          rows_processed?: number
          status: string
        }
        Update: {
          created_at?: string
          dataset_key?: string
          id?: string
          message?: string | null
          rows_processed?: number
          status?: string
        }
        Relationships: []
      }
      system_functions: {
        Row: {
          description: string | null
          excel_equivalent: string | null
          formula: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          excel_equivalent?: string | null
          formula: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          excel_equivalent?: string | null
          formula?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_dashboard_access: {
        Row: {
          created_at: string
          dashboard_key: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dashboard_key: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dashboard_key?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dashboard_access_dashboard_key_fkey"
            columns: ["dashboard_key"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["key"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ventas_diarias: {
        Row: {
          almacen: string | null
          canal: string | null
          cod_almacen: string | null
          cod_cliente: number
          cod_vendedor_linea: string | null
          created_at: string
          descripcion_linea: string | null
          ejercicio: number | null
          familia: string | null
          fecha: string
          hora: string | null
          id: number
          id_doc_enlazado: string | null
          id_documento: string | null
          importe: number
          linea: number | null
          marca: string | null
          margen: number
          motivo_abono: string | null
          num_documento: number | null
          operacion: string | null
          referencia: string
          registrado_por: string | null
          tipo_documento: string | null
          unidades: number
          vendedor_linea: string | null
        }
        Insert: {
          almacen?: string | null
          canal?: string | null
          cod_almacen?: string | null
          cod_cliente: number
          cod_vendedor_linea?: string | null
          created_at?: string
          descripcion_linea?: string | null
          ejercicio?: number | null
          familia?: string | null
          fecha: string
          hora?: string | null
          id?: never
          id_doc_enlazado?: string | null
          id_documento?: string | null
          importe?: number
          linea?: number | null
          marca?: string | null
          margen?: number
          motivo_abono?: string | null
          num_documento?: number | null
          operacion?: string | null
          referencia: string
          registrado_por?: string | null
          tipo_documento?: string | null
          unidades?: number
          vendedor_linea?: string | null
        }
        Update: {
          almacen?: string | null
          canal?: string | null
          cod_almacen?: string | null
          cod_cliente?: number
          cod_vendedor_linea?: string | null
          created_at?: string
          descripcion_linea?: string | null
          ejercicio?: number | null
          familia?: string | null
          fecha?: string
          hora?: string | null
          id?: never
          id_doc_enlazado?: string | null
          id_documento?: string | null
          importe?: number
          linea?: number | null
          marca?: string | null
          margen?: number
          motivo_abono?: string | null
          num_documento?: number | null
          operacion?: string | null
          referencia?: string
          registrado_por?: string | null
          tipo_documento?: string | null
          unidades?: number
          vendedor_linea?: string | null
        }
        Relationships: []
      }
      visita_bloques: {
        Row: {
          campos: Json
          campos_meta: Json
          completo: boolean
          created_at: string
          id: string
          motivo_key: string | null
          nota_revision: string | null
          orden: number
          revisado_en: string | null
          revisado_por: string | null
          updated_at: string
          validacion: string
          visita_id: string
        }
        Insert: {
          campos?: Json
          campos_meta?: Json
          completo?: boolean
          created_at?: string
          id?: string
          motivo_key?: string | null
          nota_revision?: string | null
          orden?: number
          revisado_en?: string | null
          revisado_por?: string | null
          updated_at?: string
          validacion?: string
          visita_id: string
        }
        Update: {
          campos?: Json
          campos_meta?: Json
          completo?: boolean
          created_at?: string
          id?: string
          motivo_key?: string | null
          nota_revision?: string | null
          orden?: number
          revisado_en?: string | null
          revisado_por?: string | null
          updated_at?: string
          validacion?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visita_bloques_motivo_key_fkey"
            columns: ["motivo_key"]
            isOneToOne: false
            referencedRelation: "motivos_visita"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "visita_bloques_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visita_bloques_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visita_bloques_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visita_bloques_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visita_bloques_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          analisis_modelo: string | null
          analisis_prompt_version: string | null
          campos: Json
          cliente_externo: string | null
          cod_cliente: number | null
          comercial_nombre: string | null
          created_at: string
          estado: string
          fecha: string
          fecha_registro: string
          hora: string | null
          id: string
          latitud: number | null
          longitud: number | null
          motivo_key: string | null
          nota_revision: string | null
          observaciones: string | null
          observaciones_original: string | null
          observaciones_repartidas: boolean
          origen: string
          resultado_visita: string
          revisado_en: string | null
          revisado_por: string | null
          ruta: string | null
          tipo: string
          titulo: string | null
          transcripcion: string | null
          updated_at: string
          user_id: string | null
          validacion: string | null
          vendedor: string | null
          visita_origen_id: string | null
          zona: string | null
        }
        Insert: {
          analisis_modelo?: string | null
          analisis_prompt_version?: string | null
          campos?: Json
          cliente_externo?: string | null
          cod_cliente?: number | null
          comercial_nombre?: string | null
          created_at?: string
          estado?: string
          fecha?: string
          fecha_registro?: string
          hora?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          motivo_key?: string | null
          nota_revision?: string | null
          observaciones?: string | null
          observaciones_original?: string | null
          observaciones_repartidas?: boolean
          origen?: string
          resultado_visita?: string
          revisado_en?: string | null
          revisado_por?: string | null
          ruta?: string | null
          tipo?: string
          titulo?: string | null
          transcripcion?: string | null
          updated_at?: string
          user_id?: string | null
          validacion?: string | null
          vendedor?: string | null
          visita_origen_id?: string | null
          zona?: string | null
        }
        Update: {
          analisis_modelo?: string | null
          analisis_prompt_version?: string | null
          campos?: Json
          cliente_externo?: string | null
          cod_cliente?: number | null
          comercial_nombre?: string | null
          created_at?: string
          estado?: string
          fecha?: string
          fecha_registro?: string
          hora?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          motivo_key?: string | null
          nota_revision?: string | null
          observaciones?: string | null
          observaciones_original?: string | null
          observaciones_repartidas?: boolean
          origen?: string
          resultado_visita?: string
          revisado_en?: string | null
          revisado_por?: string | null
          ruta?: string | null
          tipo?: string
          titulo?: string | null
          transcripcion?: string | null
          updated_at?: string
          user_id?: string | null
          validacion?: string | null
          vendedor?: string | null
          visita_origen_id?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_cod_cliente_fk"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
          {
            foreignKeyName: "visitas_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas_planificadas: {
        Row: {
          cod_cliente: number
          created_at: string
          estado: string
          fecha: string
          id: string
          notas: string | null
          orden: number
          updated_at: string
          user_id: string
          visita_id: string | null
        }
        Insert: {
          cod_cliente: number
          created_at?: string
          estado?: string
          fecha: string
          id?: string
          notas?: string | null
          orden?: number
          updated_at?: string
          user_id: string
          visita_id?: string | null
        }
        Update: {
          cod_cliente?: number
          created_at?: string
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          orden?: number
          updated_at?: string
          user_id?: string
          visita_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_planificadas_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_planificadas_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_planificadas_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_planificadas_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "visitas_planificadas_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_cliente_perfil_vigente: {
        Row: {
          atributo_key: string | null
          bloque_id: string | null
          cita: string | null
          cod_cliente: number | null
          comercial_nombre: string | null
          confianza: string | null
          confirmado_en: string | null
          confirmado_por: string | null
          created_at: string | null
          descartado_en: string | null
          descartado_por: string | null
          estado: string | null
          fuente: string | null
          id: string | null
          motivo_descarte: string | null
          observado_en: string | null
          updated_at: string | null
          user_id: string | null
          valor_num: number | null
          valor_texto: string | null
          visita_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_perfil_datos_atributo_key_fkey"
            columns: ["atributo_key"]
            isOneToOne: false
            referencedRelation: "perfil_atributos"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["bloque_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_bloque_id_fkey"
            columns: ["bloque_id"]
            isOneToOne: false
            referencedRelation: "visita_bloques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_cod_cliente_fkey"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_accion_pendiente"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_bloques_campos"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_competencia"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "v_visita_oferta"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "cliente_perfil_datos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ficha_flota_actual: {
        Row: {
          cod_cliente: number | null
          fecha_ultima_actualizacion: string | null
          marcas_vehiculo: string | null
          num_mecanicos: number | null
          num_vehiculos: number | null
          observaciones: string | null
          persona_contacto: string | null
          potencial_estimado: number | null
          referencias_consumo: string | null
          tipo_ejes: string | null
          tipo_trabajo: string | null
          visita_id_origen: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_cod_cliente_fk"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
        ]
      }
      v_visita_accion_pendiente: {
        Row: {
          bloque_id: string | null
          cliente: string | null
          cod_cliente: number | null
          created_at: string | null
          fecha: string | null
          fecha_accion: string | null
          motivo_key: string | null
          proxima_accion: string | null
          ruta: string | null
          validacion: string | null
          vendedor: string | null
          visita_id: string | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visita_bloques_motivo_key_fkey"
            columns: ["motivo_key"]
            isOneToOne: false
            referencedRelation: "motivos_visita"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "visitas_cod_cliente_fk"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
        ]
      }
      v_visita_bloques_campos: {
        Row: {
          bloque_created_at: string | null
          bloque_id: string | null
          bloque_orden: number | null
          campo_key: string | null
          cita: string | null
          cod_cliente: number | null
          completo: boolean | null
          confianza: string | null
          estado: string | null
          fecha: string | null
          hora: string | null
          motivo_key: string | null
          nota_revision: string | null
          origen: string | null
          ruta: string | null
          tipo: string | null
          validacion: string | null
          valor_fecha: string | null
          valor_num: number | null
          valor_texto: string | null
          vendedor: string | null
          visita_id: string | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visita_bloques_motivo_key_fkey"
            columns: ["motivo_key"]
            isOneToOne: false
            referencedRelation: "motivos_visita"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "visitas_cod_cliente_fk"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
        ]
      }
      v_visita_competencia: {
        Row: {
          bloque_id: string | null
          cod_cliente: number | null
          competidor: string | null
          completo: boolean | null
          conclusion: string | null
          created_at: string | null
          fecha: string | null
          gap_eur: number | null
          gap_pct: number | null
          marca_competencia: string | null
          nota_revision: string | null
          origen: string | null
          precio_competencia: number | null
          precio_rimosa: number | null
          referencia_competencia: string | null
          resultado_venta: string | null
          ruta: string | null
          validacion: string | null
          vendedor: string | null
          visita_id: string | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_cod_cliente_fk"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
        ]
      }
      v_visita_oferta: {
        Row: {
          bloque_id: string | null
          canal_envio: string | null
          cantidad: number | null
          cod_cliente: number | null
          completo: boolean | null
          created_at: string | null
          fecha: string | null
          fuera_de_plazo: boolean | null
          importe_estimado: number | null
          motivo_fuera_plazo: string | null
          nota_revision: string | null
          origen: string | null
          precio_ofertado: number | null
          producto: string | null
          proxima_accion: string | null
          referencia: string | null
          respuesta_cliente: string | null
          ruta: string | null
          validacion: string | null
          vendedor: string | null
          visita_id: string | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_cod_cliente_fk"
            columns: ["cod_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["cod_cliente"]
          },
        ]
      }
    }
    Functions: {
      buscar_productos: {
        Args: { _limite?: number; _q: string }
        Returns: {
          descripcion: string
          familia: string
          marca: string
          referencia: string
        }[]
      }
      can_view_cliente: {
        Args: { _cod: number; _user_id: string }
        Returns: boolean
      }
      cliente_documento_lineas: {
        Args: { _cod: number; _id_documento: string }
        Returns: {
          descripcion: string
          familia: string
          importe: number
          marca: string
          margen: number
          referencia: string
          unidades: number
        }[]
      }
      cliente_documentos: {
        Args: { _cod: number; _limite?: number }
        Returns: {
          almacen: string
          canal: string
          fecha: string
          hora: string
          id_documento: string
          importe: number
          lineas: number
          margen: number
          operacion: string
          registrado_por: string
          tipo_documento: string
          vendedor_linea: string
        }[]
      }
      cliente_top_productos: {
        Args: { _anio?: number; _cod: number }
        Returns: {
          descripcion: string
          familia: string
          importe: number
          marca: string
          margen: number
          referencia: string
          ultima_compra: string
          unidades: number
        }[]
      }
      clientes_permitidos: {
        Args: { _user_id: string }
        Returns: {
          cod_cliente: number
        }[]
      }
      clientes_visibles: {
        Args: { _anios?: number; _solo_activos?: boolean }
        Returns: {
          activo: boolean
          cliente: string
          cod_cliente: number
          delegacion: string
          importe_actual: number
          importe_anterior: number
          localidad: string
          ruta: string
          ultima_compra: string
          vendedor: string
        }[]
      }
      fecha_corte_datos: { Args: never; Returns: string }
      get_distinct_delegaciones: {
        Args: never
        Returns: {
          delegacion: string
        }[]
      }
      get_distinct_vendedores: {
        Args: never
        Returns: {
          vendedor: string
        }[]
      }
      get_user_delegacion: { Args: { _user_id: string }; Returns: string }
      get_user_employee_code: { Args: { _user_id: string }; Returns: string }
      get_user_zone_id: { Args: { _user_id: string }; Returns: string }
      has_dashboard_access: {
        Args: { _dashboard_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importar_visitas_historicas: {
        Args: { _reset?: boolean; _rows: Json }
        Returns: number
      }
      insertar_ventas_diarias: {
        Args: { _reset?: boolean; _rows: Json }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      objetivos_propuesta: {
        Args: { _anio: number; _pct?: number }
        Returns: {
          base_anio_anterior: number
          cod_vendedor: string
          importe_sugerido: number
          ruta: string
          tipo: string
          vendedor: string
        }[]
      }
      objetivos_seguimiento: {
        Args: { _anio: number }
        Returns: {
          activo: boolean
          cod_vendedor: string
          fecha_corte: string
          id: string
          importe_objetivo: number
          nota: string
          quincena_corte: number
          ruta: string
          series: Json
          tipo: string
          total_anterior: number
          vendedor: string
          vendido: number
          vendido_anterior_ytd: number
        }[]
      }
      panel_alertas: {
        Args: { _incluir_excluidos?: boolean; _limite?: number }
        Returns: {
          cliente: string
          cod_cliente: number
          dias: number
          etiqueta: string
          situacion_categoria: string
          situacion_efecto: string
          tipo: string
          valor: number
          valor_ref: number
          vendedor: string
        }[]
      }
      panel_canales: {
        Args: { _anio: number }
        Returns: {
          canal: string
          clientes: number
          documentos: number
          importe: number
          margen: number
          ticket_medio: number
        }[]
      }
      panel_devoluciones: {
        Args: { _anio: number; _limite?: number }
        Returns: {
          etiqueta: string
          importe: number
          lineas: number
          tipo: string
        }[]
      }
      panel_dormidos: {
        Args: { _incluir_excluidos?: boolean; _limite?: number }
        Returns: {
          cliente: string
          cod_cliente: number
          etiqueta: string
          importe_total: number
          situacion_efecto: string
          ultima_compra: string
          vendedor: string
        }[]
      }
      panel_top_clientes: {
        Args: { _anio: number; _limite?: number }
        Returns: {
          cliente: string
          cod_cliente: number
          importe: number
          margen: number
          vendedor: string
        }[]
      }
      panel_top_familias: {
        Args: { _anio: number; _limite?: number }
        Returns: {
          familia: string
          importe: number
          margen: number
        }[]
      }
      panel_top_marcas: {
        Args: { _anio: number; _limite?: number }
        Returns: {
          importe: number
          marca: string
          margen: number
        }[]
      }
      panel_ventas_kpis: {
        Args: never
        Returns: {
          abonos: number
          anio: number
          clientes: number
          documentos: number
          importe: number
          importe_abonos: number
          lineas: number
          margen: number
          ticket_medio: number
          unidades: number
        }[]
      }
      panel_ventas_mensual: {
        Args: never
        Returns: {
          anio: number
          documentos: number
          importe: number
          margen: number
          mes: number
          ticket_medio: number
          unidades: number
        }[]
      }
      puede_editar_bloque: { Args: { _visita_id: string }; Returns: boolean }
      puede_revisar_visitas: { Args: { _user_id: string }; Returns: boolean }
      puede_ver_bloque: { Args: { _visita_id: string }; Returns: boolean }
      puede_ver_margen: { Args: { _user_id: string }; Returns: boolean }
      quincena_corte: { Args: { _anio: number }; Returns: number }
      quincena_de: { Args: { _f: string }; Returns: number }
      refrescar_resumenes_admin: { Args: never; Returns: undefined }
      refrescar_resumenes_ventas: { Args: never; Returns: undefined }
      registrar_geo_cliente: {
        Args: { _cod: number; _lat: number; _lng: number }
        Returns: boolean
      }
      repartir_observaciones_gespromo: {
        Args: { _forzar?: boolean }
        Returns: Json
      }
      reprocesar_historico_a_bloques: {
        Args: { _limite?: number }
        Returns: number
      }
      reset_maestro_isi_data: { Args: never; Returns: undefined }
      ruta_clientes: {
        Args: { _ruta: string; _solo_activos?: boolean }
        Returns: {
          activo: boolean
          cliente: string
          cod_cliente: number
          dias_sin_comprar: number
          importe_actual: number
          importe_anterior_ytd: number
          latitud: number
          localidad: string
          longitud: number
          situacion_categoria: string
          situacion_efecto: string
          situacion_etiqueta: string
          telefono: string
          ultima_compra: string
          ultima_visita: string
          vendedor: string
        }[]
      }
      rutas_visibles: {
        Args: never
        Returns: {
          clientes: number
          clientes_activos: number
          con_geo: number
          importe_actual: number
          importe_anterior_ytd: number
          ruta: string
          sin_visitar: number
          ultima_visita: string
        }[]
      }
      sembrar_geo_clientes: { Args: never; Returns: number }
      situaciones_activas: {
        Args: never
        Returns: {
          categoria: string
          cod_cliente: number
          efecto: string
          etiqueta: string
          nota: string
        }[]
      }
      to_date_visita: { Args: { _v: string }; Returns: string }
      to_num_visita: { Args: { _v: string }; Returns: number }
      upsert_clientes_maestro: { Args: { _rows: Json }; Returns: number }
      upsert_productos_maestro: { Args: { _rows: Json }; Returns: number }
      vendedores_objetivos: {
        Args: never
        Returns: {
          clientes: number
          cod_vendedor: string
          ruta_especial: string
          vendedor: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "director_comercial" | "jefe_de_zona" | "comercial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "director_comercial", "jefe_de_zona", "comercial"],
    },
  },
} as const
