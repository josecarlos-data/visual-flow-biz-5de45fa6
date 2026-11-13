# Tareas

- [x] Migración: sesiones por equipo en registrar_sesion, interruptor control_sesiones_activo en ambas funciones
- [x] Cliente: crm_sesion_id en localStorage, expulsión con cierre local, segunda pestaña termina en login con aviso
- [x] Panel: selector control_sesiones_activo con advertencia
- [x] Build y typecheck limpios; pendiente solo la prueba manual con dos pestañas normales del mismo equipo
- [x] Corrección carrera al iniciar sesión: verificar_sesion defiende fila ausente, useAuth espera a controlListo y salta el primer pathname

- [x] Rehacer useAuth con máquina de estados única (resolverAcceso, generación, límites de 8 s por paso, vigilante solo en activo)
- [x] Contraseñas: política 12, cambio voluntario/forzado/recuperación vía función cambiar-password (vía de usuario), panel restablecer/forzar
- [x] Estado de usuario, baja y nombre de usuario (migración 0004, is_admin/is_approved con estado, bloqueo en useAuth, panel)
- [x] Migración separada: proteger por estado las funciones sin comprobación (actividad_interna_*, cliente_top_productos, situaciones_activas)
- [x] Login por usuario vía iniciar-sesion, bloqueo escalonado, límite por IP, solo credenciales incorrectas cuentan
- [x] Verificar límite del servicio de autenticación (riesgo 3) — comprobado por el usuario
- [x] 2FA: migración (exige_2fa, modo, requiere_2fa, sesion_cumple_2fa, is_approved/is_admin)
- [x] 2FA: useAuth estados pide_2fa/alta_2fa con recarga de perfil y dashboards
- [x] 2FA: pantallas alta/verificación, eventos
- [x] 2FA: función admin-segundo-factor (admin + sesion_cumple_2fa) y panel
- [x] 2FA: EXPLAIN ANALYZE ventas_diarias comercial, modo desactivado vs activo (parar si >20 %)
- [ ] Pruebas 2FA 1–5 con cuenta Bautista (sesión interna)
- [ ] Esperar reseteo del usuario y comprobar alta_2fa (prueba 6)
- [ ] Limpieza: borrar factores, modo desactivado, exige_2fa false; informe con eventos
- [x] Caducidad de sesión (amr más antiguo, ajuste en migración) + auditoría de cambios en usuarios
- [x] Auditoría: recorrer el grupo 'seguridad' del detalle, traducir Operación/Origen y mostrar el nombre en la columna Entidad
- [x] Avisos de seguridad: construido y desplegado
- [x] Avisos: el usuario ejecuta el bloque SQL del secreto y yo verifico latido, correo y 401
- [x] Auditar cambios de app_settings sin usuario (función aparte) + título «CRM Rimosa»; prueba leyendo y restaurando el valor real
- [x] Auditoría legible + página Seguridad
- [x] Auditoría por tabla + perfil de cliente + registro de consultas + limpieza programada (pendiente: probar vistas de Consultas con sesión de administrador)

- [x] Ofertas Fase 3: envío por WhatsApp desde ficha y en tandas, confirmación, historial (pendiente: prueba real de envío por el usuario)
- [x] Ofertas Fase 5: recomendaciones (pendiente: prueba en pantalla con sesión real)
- [x] Ofertas Fase 4: Comunicaciones (listado, resúmenes, ventas ±30 días, exportar)

## Ofertas y Comunicaciones — construida, oculta (ofertas_activo = false), pendiente de revisión
- [x] Interruptor único ofertas_activo (Datos → tarjeta «Ofertas y Comunicaciones»), origen en Comunicaciones, resumen de recomendados por comercial
- [ ] Prueba completa en el móvil: crear, publicar con imagen, enviar al propio número, confirmar, verla en Comunicaciones y abrir el enlace sin sesión
- [ ] Texto legal del pie, pendiente de la asesoría
- [ ] Grupo de comparación de la Fase 4: hoy son todos los no receptores, no solo los que podían recibirla
- [ ] Asignar los paneles al usuario de marketing cuando exista
- [ ] Ningún cliente tiene móvil en el ERP: se escribirá a mano la primera vez
- [ ] Revisar con dirección el tope de 50 por tanda y los umbrales (6 meses, 7 días, 90 días)
- [ ] Al reconstruir en servidor propio: ejecutar docs/reconstruccion/ofertas_bucket.sql (tipos de archivo permitidos del bucket)
- [x] Ofertas Fase 6: seguimiento de compras por cliente (pestaña Resultados, compras por envío, estado en ficha). Pendiente: prueba con envíos reales y el interruptor encendido

## Visitas y Rutas
- [x] Fase A: listado de rutas, coordenadas propuestas, cierre automático de planificadas, revisión de visitas
- [ ] Fase B: «Mi día» y mejoras móviles del comercial (pendiente de aprobación)
- [ ] Fase C: panel «Análisis de rutas» y parámetros (pendiente de aprobación)
- [x] Revisión de visitas por bloque (nota y estado por bloque, filtro Comercial, comercial automático)
- [x] Prueba de la revisión por bloque con visita PRUEBA (borrada)
- [x] Conversación por bloque revisor ↔ comercial (Mis revisiones, contadores, ficha). Notas Gespromo pasadas como «Gespromo (importado)»
- [x] Las 9 notas de la app se quedan como histórico (eran pruebas)
- [x] Prueba de conversación con visita PRUEBA (borrada). Pendiente: probar las pantallas con sesión real
- [x] Arreglar conversación de revisión (llamadas, errores visibles, «Avisos de revisión» para todos, ficha con una sola consulta, cabecera, listado de pruebas a limpiar antes de publicar)
- [x] Limpiar mensajes, notas y validaciones de prueba antes de publicar (0033; CALEROTRUCKS de Fran conservada como mensaje)

- [x] 0035: proteger validación de visitas y bloques en servidor (firma, autovalidación, bloqueos)

## Objetivos v2
- [x] Entrega 1: migración 0036 (tablas, catálogo, cálculo, permisos, auditoría, migración de los 19 objetivos de 2026), cuadre 19/19 y pruebas de permisos
- [ ] Entrega 2 (espera «adelante»): asistente director/admin, tarjetas móviles del comercial, quitar «Ruta especial» de la pantalla, aviso de comerciales sin código
- [ ] Más adelante: retirar tabla y funciones viejas cuando la pantalla nueva esté validada

## Objetivos v2
- [x] Entrega 1 (0036) y entrega 2 (0037 + pantallas)
- [ ] Prueba en pantalla por el usuario con cuentas de prueba

## Recarga del Maestro ISI
- [x] Carga por tabla de espera con identificador, aviso del 95 %, «Aplicar de todas formas», auditoría (migración 0038)
- [x] Fechas/horas locales, lectura completa de hojas (nodim), filas descartadas por hoja con ejemplos
- [ ] Carga real del Excel (la hace el usuario) y confirmar que el límite de 10 min se aplica desde la app

- [x] Modelos IA: transcripción gpt-transcribe, extracción gpt-6-luna, temperatura por modelo, informe gpt-6.1-sol (sin terra), lista única, visión sustituta de gemini-3.6-flash
- [x] Gespromo: carga repetible sin borrar (función, bloque+veredicto, mensajes, recuentos, fechas locales); informar llamadas a repartir_observaciones_gespromo

- [x] Registro de visitas fiable (0042): función registrar_visita, trigger fecha/alta directa (ajuste apagado), NuevaVisita, ajustes, pruebas
- [x] Análisis IA del cliente: incluir bloques de visitas anteriores

## Revisión de visitas: análisis IA y corrección de bloques
- [x] A: análisis IA agrupa visitas Gespromo, observaciones app, perfil sin duplicar, «(sin confirmar)»
- [x] B: editar_bloque_revision + auditoría de bloques (0043) + botón «Editar datos»
- Nota: tras una corrección del revisor, el dato del perfil queda con fuente «voz», que no es exacta (se deja así)
- [x] cliente-insights: bloques Gespromo vacíos no se escriben; observaciones por fila sin bloques con contenido, una línea al final del grupo

## Registrar visita: dictar → corregir → crear bloques (fase4.5)
- [x] Crear bloques solo con botón; Actualizar bloques si cambia el texto; aviso al guardar
- [x] Añadir/Sustituir al volver a dictar; micrófono también en no efectiva
- [x] IA propone resultado sin cambiarlo; aviso «Registrar como no efectiva / Volver» si hay bloques de documento/manuales
- [x] Borrador único por usuario (3 días); preguntar si el enlace trae otro cliente; borrar solo en logout manual
- [x] fecha_visita en extracción; prompt fase4.5 sin bloques si no se trató nada
- [x] Tests utilidades + 2 narraciones en banco
- [x] Extracción en narraciones cortas devuelve a menudo 0 bloques → resuelto en fase4.6 (prompt).

## Extracción fiable en dictados cortos (fase4.6)
- [x] Regla general «Vale si… no es requisito» en el prompt; banco 11 casos × 5
- [x] Si no llega al 100 %, frase fija de Promoción y medir mejora
- [x] Guardar casos cortos y criterio de bloques esperados en scripts/bench-visita-voz

## Decimales en bloques
- [x] normalizarNumero respeta el punto decimal sin coma; pruebas
- [x] CompletarBloqueDialog normaliza números antes de guardar
- [x] Etiquetas legibles para marca/familia/descripción de referencia

## Modelo de extracción
- [x] Volver a openai/gpt-5.6-luna solo en extracción (visión sigue en gpt-6-luna); banco repetido

## Cierre módulo visitas (versión estable para Rafael)
- [x] Listado: motivos en línea agrupados, resultado/llamada, Incompleta, estado, sin marca interna
- [x] Ficha: cabecera con comercial/resultado/estado; observaciones también con bloques
- [x] Completar datos desde listado y ficha (propias, Pendiente/No correcto)
- [x] Buscador: inactivos bajo demanda y «Cliente que no está en ISI»
- [x] Permisos (0045; la 0044 quedó vacía por error): comercial no modifica/borra; solo admin borra; no admin solo origen app; revisor no corrige lo suyo
- [ ] Pendiente (aplazado por decisión): visitas con cliente_externo visibles para el jefe de zona de la delegación del autor

- [x] Revisión de visitas paginada: migraciones 0046, 0047 y 0048 aplicadas (no habrá más migraciones de rendimiento en esta entrega); pantalla paginada terminada (lista, contadores y filtros en servidor, paginador, «Guardar y siguiente» con cursor tras guardar). Solo comprobado que compila; sin probar en pantalla.
- [ ] Revisión: búsqueda lenta por nombre de comercial (≈7 s medido con «jose carlos», admin/director, con la 0047; sin medición limpia con la 0048). Otros tiempos parciales por encima de 2 s: motivo como jefe de zona 2,5 s (0047), dudas como director 2,5 s (0048).
- [ ] Revisión: comparación visita a visita 0046 frente a 0048 (motivo, dudas, búsqueda por cliente/externo/comercial/motivo con y sin acentos, motivo+dudas, motivo+dudas+búsqueda; admin, director y jefe de zona) sin completar. Solo hay coincidencias parciales.
