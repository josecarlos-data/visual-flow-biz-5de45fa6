# Auditoría por tabla, perfil de cliente, registro de consultas y limpieza programada

## Comprobado antes de proponer
- **Tablas auditadas hoy:** `auditar_cambio` cubre visitas, clientes, objetivos y situaciones de cliente. Para esas tablas solo guarda la lista de campos cambiados, sin valores antes y después; `cliente_perfil_datos` no tiene trigger.
- **Conservación:** `auditoria_retencion_dias` existe y vale **90**, no 365. `purgar_auditoria()` borra lo que tiene más de N días y no está programada; la única tarea programada es la de avisos. El evento más antiguo es del 7 de septiembre, así que hoy no borraría nada.
- **Tamaño:** el registro de auditoría ocupa 688 kB con 797 eventos.
- **Ficha de cliente:** las pestañas se controlan desde la dirección de la página (`tab`): resumen, visitas, productos, documentos, perfil e IA. Ya existe la función `can_view_cliente(_user_id, _cod)`, que dice si un usuario puede ver un cliente.

## 1. Etiquetas por tabla y nombre del cliente (solo pantalla + un dato más en el trigger)
- **Tipo.** Sale de la operación y la tabla: «Alta de visita», «Cambio de cliente», «Baja de objetivo», «Cambio de situación de cliente», «Alta de perfil de cliente»… «… de ajuste» queda solo para la tabla de ajustes.
- **Cliente del registro.** `auditar_cambio` añade al detalle el código de cliente cuando el registro lo tiene (`cod_cliente`). En pantalla, Entidad muestra el nombre del cliente. Los nombres de cada página se resuelven con **una sola consulta**, no una por fila. Si no hay cliente, Entidad muestra «Visita», «Objetivo», etc.
- **Eventos antiguos.** No tienen el código de cliente guardado, así que se resuelven por el identificador del registro cuando aún existe; si no existe, «Visita (eliminada)».
- **Sin usuario.** `auditar_cambio` sigue ignorando los cambios sin usuario, como hasta ahora.

## 2. Auditar el perfil de cliente
- **Trigger.** `cliente_perfil_datos` pasa a tener trigger con `auditar_cambio`.
- **Detalle.** Para esta tabla el trigger guarda además el atributo y los valores antes y después (valor, estado y motivo de descarte).
- **Pantalla.** El detalle se lee como «Perfil · Número de mecánicos: 3 → 5» o «Estado: Pendiente → Confirmado», con el nombre del atributo tomado de su catálogo.
- No cambia cómo se guardan los perfiles.

## 3. Registro de consultas (tabla propia)
- **Tabla nueva `consultas_cliente`.** Campos: id, `ocurrido_en`, `user_id`, `cod_cliente` y pestaña.
  - Índices por (`user_id`, `ocurrido_en`) y (`cod_cliente`, `ocurrido_en`).
  - Seguridad de filas activada y ninguna política. Se revoca todo a anon y authenticated; nadie la lee ni la escribe directamente.
- **Escritura: `registrar_consulta(_cod, _pestana)`.** Función SECURITY DEFINER que solo pueden ejecutar los usuarios con sesión.
  - Toma el usuario de la sesión y comprueba que está aprobado.
  - No hace nada si el interruptor `registro_consultas_activo` no es `true`.
  - Solo registra si `can_view_cliente` lo permite y si la pestaña es una de las seis válidas.
  - No repite la misma consulta (mismo usuario, cliente y pestaña) en menos de 5 minutos.
- **Ficha del cliente.**
  - Llama a la función al abrir la ficha y en cada cambio de pestaña, sin esperar la respuesta y sin avisar si falla.
  - La llamada sale en paralelo y no retrasa ninguna de las cargas actuales.
  - Con el interruptor apagado, la función termina en la primera comprobación.
- **Interruptor.** El ajuste se crea en la migración apagado (`false`, sin sobrescribir si ya existe). Como es un ajuste, sus cambios quedan en Auditoría y generan aviso por correo: añado esta clave a las que vigila la tarea de avisos, con el nombre «Registro de consultas».
  - Esto toca `avisos-seguridad`, solo su lista de claves vigiladas y la regla que dice qué cuenta como relajar la seguridad (apagarlo cuenta como relajarla).
  - **Me detengo aquí para que lo apruebes expresamente.** Si prefieres no tocarla, el cambio queda en Auditoría pero no genera aviso.

## 4. Pestaña «Consultas» en Auditoría (solo administradores)
Funciones de consulta SECURITY DEFINER que exigen `is_admin`.
- **Por usuario y periodo: `consultas_por_usuario(_user_id, _desde, _hasta)`.** Una fila por cliente consultado.
  - Veces, días distintos, primera y última consulta, y pestañas vistas.
  - Su «media habitual» para ese cliente: veces por periodo de la misma duración en los 90 días anteriores al periodo.
  - Arriba, un resumen: clientes distintos consultados al día en el periodo frente a su media de los 90 días anteriores.
  - **Destacado, según una regla fija y explicada en pantalla:**
    - un cliente que no había consultado nunca en esos 90 días;
    - o que consulta al menos el triple que su media, y al menos 3 veces;
    - y la pestaña Documentos o Productos, si es la que más pesa en sus consultas de ese cliente.
- **Por cliente: `consultas_por_cliente(_cod, _desde, _hasta)`.** Quién lo ha consultado: veces, primera y última, y pestañas.
- **Agregado.** Las dos vistas agrupan las consultas; no hay listado fila a fila.
- **Rastro.** Cada uso de estas funciones deja un evento `consulta_actividad` en el registro de auditoría con quién consultó, a quién o qué cliente y el periodo. Lo inserta la propia función y no se tocan las políticas ni los permisos del registro. La tarea de avisos no lo trata, porque no es una de sus categorías.
- **En móvil:** filtros apilados y resultados en tarjetas, sin desplazamiento horizontal.

## 5. Página Seguridad
Un bloque nuevo «Registro de consultas»:
- **Interruptor.** Apagado por defecto.
- **Explicación.** Qué registra (aperturas de ficha y pestañas), para qué sirve (solo investigar una posible fuga, nunca evaluar el rendimiento de nadie), cuánto ocupa (unas 500 consultas al día, 15–20 MB con 6 meses) y el aviso «Antes de activarlo, informa a la plantilla».
- **Conservación.** Dos campos: la de Auditoría (`auditoria_retencion_dias`) y la de consultas (`consultas_retencion_dias`, 180, creado en la migración sin sobrescribir). Admiten entre 30 y 3650 días y se guardan igual que el resto de ajustes.

## 6. Limpieza automática
- **Funciones.**
  - `purgar_consultas()`, nueva: borra las consultas con más días que `consultas_retencion_dias`.
  - `purgar_auditoria()`: no cambia su lógica.
  - Las dos solo puede ejecutarlas el rol del servidor.
- **Comprobación antes de programar.** Sin borrar nada, cuento cuántas filas tienen más días que la conservación en cada tabla y te enseño la cifra. Hoy debería salir 0 en las dos: el primer evento es del 7 de septiembre y la tabla de consultas está vacía.
- **Programación.** Una tarea diaria a las 03:30 UTC (05:30 en Madrid) que llama a las dos funciones. Es una sola ejecución al día, con coste despreciable.
  - La programación no puede ir en la migración. La intento con la herramienta de datos. Si me la rechaza, **me detengo** y te paso el bloque exacto para que lo ejecutes:
    ```sql
    SELECT cron.schedule('purgar-registros', '30 3 * * *',
      $$ SELECT public.purgar_auditoria(); SELECT public.purgar_consultas(); $$);
    ```

## Decisión pendiente: conservación de Auditoría
Hoy son 90 días. La migración no cambia ese valor. Si gerencia confirma 365, lo cambias desde Seguridad, o lo hago yo cuando me lo digas. Con 90, la primera limpieza borrará eventos a partir del 6 de diciembre.

## Prueba
1. Guardar una visita y cambiar un dato de perfil de un cliente de prueba (y devolverlo). Comprobar que salen «Alta o Cambio de visita» y «Cambio de perfil de cliente» con el nombre del cliente y antes → después.
2. Interruptor apagado: abrir una ficha no registra nada. Encendido: registra la apertura y las pestañas, y no repite dentro de 5 minutos. Lo enciendo y lo apago yo; solo uso la sesión interna de Bautista para abrir fichas, y al terminar borro sus filas de prueba y lo dejo **apagado**.
3. Bautista no puede leer la tabla ni llamar a las funciones de administración.
4. Comprobar las dos vistas de Consultas y que queda el evento `consulta_actividad`.
5. Medir el tiempo de apertura de la ficha con el registro encendido y apagado; no debe empeorar.
6. Revisar Auditoría y Seguridad en móvil sin desplazamiento horizontal.

## Detalles técnicos
- **Migración única** (`drizzle/migrations/`):
  - `CREATE OR REPLACE auditar_cambio`: añade `cod_cliente` al detalle y, para `cliente_perfil_datos`, el atributo y los valores antes y después; mantiene la exención sin usuario.
  - Trigger nuevo `auditar_cliente_perfil_datos`.
  - Tabla `consultas_cliente` con sus índices, permisos y RLS.
  - Funciones `registrar_consulta`, `consultas_por_usuario`, `consultas_por_cliente` y `purgar_consultas`.
  - Ajustes `registro_consultas_activo=false` y `consultas_retencion_dias=180` con `ON CONFLICT DO NOTHING`.
- **Fuera de la migración:** la tarea programada, que va con la herramienta de datos o la ejecutas tú.
- **Front:**
  - `ClienteDetalle.tsx`: llamada sin esperar respuesta.
  - `AdminAuditoria.tsx`: etiquetas por tabla, nombres de cliente y pestaña Consultas en un componente nuevo.
  - `SeguridadAccesoCard.tsx`: bloque nuevo.
  - `avisos-seguridad`: solo si lo apruebas.
- **No se tocan** las políticas ni los permisos del registro de auditoría, ni cómo se guardan las visitas, los clientes o los perfiles.
