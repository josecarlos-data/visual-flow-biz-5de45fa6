# Objetivos v2: motor común + objetivos de venta (fase 1)

## 1. Diagnóstico propio (código y datos actuales)

- Hay 19 objetivos de 2026: 13 de cartera (13,03 M€) y 6 de «ruta especial» (DM2026, JAB2026, MAG2026, MS2026, MV2026, RC2026) que en total cubren 15 clientes.
- `objetivos_seguimiento` asigna cada venta al comercial **actual** de la ficha del cliente (`clientes.vendedor`), no al que hizo la venta. Si un cliente cambia de comercial, también se le va con él su historial del año anterior. En 2026, 18.824 de 91.340 líneas (20 %) tienen un comercial de línea distinto del comercial actual de la ficha. Esto hay que decidirlo de forma explícita (ver punto 4.1).
- El objetivo se une al comercial **por nombre** (`objetivos.vendedor = employee_code`): es frágil. Solo 3 perfiles tienen ese código, así que la mayoría de los comerciales no verían hoy sus objetivos.
- La cartera excluye a los clientes de ruta especial solo si existe un objetivo de esa ruta. Es justo el «traspaso» que no se quería: el cliente sale de una cartera para entrar en otra.
- El año anterior se compara hasta la quincena de corte (no hasta el día exacto de corte), y el periodo siempre es el año natural. No admite periodos como abril–marzo.
- El jefe de zona no ve nada de su delegación: solo ve todo el admin o el director, o cada uno lo suyo.
- Las devoluciones ya restan, porque el importe es negativo en `ventas_diarias`. Se mantiene igual.

## 2. Propuesta propia

Modelo en cuatro piezas, todas genéricas:

- **objetivos** (cabecera): nombre, tipo (`cartera`, `clientes`, `cliente`; más adelante `actividad`, `rappel`, `campana`), desde–hasta, medida (`importe`, `margen`, `unidades`; más adelante `visitas_validadas`…), referencia de comparación (`mismo_periodo_anterior` o `importe_fijo`), meta por defecto (tipo `pct` o `importe`, y valor), modo de cálculo en listas (`conjunto` o `por_cliente`), tramos (jsonb `[{pct:100, etiqueta, importe_eur?}]`), `mostrar_importe`, `estado` (borrador/activo/cerrado/archivado), `parametros` jsonb para los tipos futuros (motivos, filtros de referencia, escala de rappel, condiciones de campaña), creado_por.
- **objetivo_asignaciones**: objetivo + comercial identificado por **user_id** (y su `cod_vendedor` para el cálculo), con meta propia opcional que sustituye a la del grupo. «Para todos» = una fila por comercial, generada al crear el objetivo.
- **objetivo_clientes**: objetivo + cliente (+ asignación opcional) + meta propia opcional + `contar_aunque_ajeno` y de qué comercial es en ese momento (foto del titular al añadirlo).
- **tipos_objetivo** (catálogo): clave, nombre, `visible` y `disponible`. Así se pueden crear tipos que no se enseñan al director sin tocar código. En esta fase solo se activan los tres de venta; actividad, rappel y campaña existen en el catálogo pero ocultos.

Cálculo, siempre en el servidor:
- `objetivos_avance(_desde, _hasta, _user?)` devuelve, por asignación: meta resuelta, real, base del año anterior hasta la **fecha de corte exacta** (no por quincena), % de avance, lo que falta, proyección y tramo alcanzado. La proyección es estacional: usa el reparto del año anterior en el resto del periodo, igual que el motor de proyecciones que ya existe; si no hay año anterior, es lineal.
- `objetivo_detalle(_id)`: serie por mes y desglose por cliente.
- Permisos dentro de la función: admin y director ven todo; jefe de zona, los comerciales de su delegación (recomendable); el comercial, solo sus asignaciones.
- Comparativa adicional: avance del periodo frente al **mismo tramo** del año anterior, para que el comercial sepa si va por delante.

Otros tipos habituales en CRM comerciales que conviene prever (solo en el catálogo, ocultos): captación de clientes nuevos o recuperación de dormidos (número de clientes que vuelven a comprar), cobertura de mix (clientes que compran la familia o marca X), venta por marca o familia en cartera, margen %, ticket medio y frecuencia, y conversión de ofertas (enlaza con lo que ya mide Comunicaciones). Todos caben con `medida` + `parametros`.

## 3. Comparación con la propuesta de Claude

| Punto | Claude | Mío | Valoración |
|---|---|---|---|
| Tres tablas (cabecera, asignaciones, clientes) | Sí | Sí | Coincidimos |
| Tramos en jsonb, mostrar importe, oculto | `oculto` por objetivo | Catálogo de tipos con visible/disponible + estado por objetivo | Mejor el catálogo: el requisito es ocultar **tipos**, no objetivos sueltos |
| Identificar al comercial | No lo concreta | Por user_id | Con el nombre actual se rompe: Claude se queda corto |
| A quién se atribuye la venta | No lo trata | Decisión explícita (4.1) | Omisión importante de Claude: un 20 % de las líneas difiere |
| Comparación con el año anterior | Mismo periodo | Hasta la fecha de corte exacta + proyección estacional | Afinado |
| Una RPC por pantalla, nunca consultas directas | Sí | Sí | Coincidimos |
| Migración sin perder datos y retirada posterior | Sí | Sí, y además cuadrar 2026 antes de retirar | Coincidimos |
| Fila en `user_dashboard_access` | Sí | Se reutiliza la entrada «objetivos» que ya existe; no hace falta una nueva | La de Claude solo aplicaría si fuera una sección nueva |
| Jefe de zona | No | Ve su delegación | Lo pongo como recomendable |
| Parámetros para tipos futuros | Implícito | `medida` + `parametros` jsonb | Más explícito |

## 4. Decisiones abiertas para debatir

1. **A quién cuenta la venta en cartera.** Opciones: A) cliente actual de la ficha, como hoy (simple, pero un traspaso se lleva el histórico); B) comercial de la línea de venta (refleja quién vendió, pero el año anterior queda incompleto si cambió la cartera); C) **foto de la cartera al crear el objetivo**, con los mismos clientes en los dos años. Recomiendo C: es justo y estable, y los clientes que entren o salgan se gestionan a mano.
2. **«Contar aunque el cliente sea de otro comercial».** El cálculo lo hace el servidor, así que **no hace falta abrir la ficha del cliente**: el comercial ve el nombre del cliente, su avance y de quién es, sin entrar en la ficha. Coste bajo, así que entra en esta fase. Abrir la ficha ajena sí afectaría a `can_view_cliente` y a todas las políticas de acceso: se deja fuera.
3. Meta de lista «conjunta»: la base es la suma del año anterior de los clientes de la lista. Si un cliente no tuvo ventas el año anterior, la meta por cliente necesita un importe fijo.

## 5. Plan final

### Imprescindible (migración 0036)
1. Tablas `tipos_objetivo`, `objetivos_v2` (nueva, para no romper la actual), `objetivo_asignaciones` y `objetivo_clientes`, con GRANT, RLS y la auditoría de cambios `auditar_cambio()`. Escritura solo para admin y director aprobados.
2. Catálogo: cartera, clientes y cliente visibles; actividad, rappel y campaña ocultos.
3. RPC `objetivos_avance`, `objetivo_detalle` y `objetivo_guardar` (crea la cabecera, las asignaciones de grupo, las excepciones y los clientes en un único paso) y `objetivo_propuesta` (base del año anterior por comercial).
4. Migración de datos: cada cartera de 2026 pasa a un objetivo «Cartera 2026» con su asignación y su importe como meta propia; las 6 rutas especiales pasan a «Sprint Primavera» (tipo lista) con sus 15 clientes y la meta conjunta actual por comercial. La tabla vieja no se toca.
5. Pantallas nuevas, sustituyendo el contenido de Objetivos y Admin Objetivos: un asistente para crear objetivos (tipo → periodo → meta de grupo → excepciones → clientes → tramos) y, para el comercial, tarjetas con avance, lo que falta, la proyección y el tramo, pensadas para móvil.
6. Desaparece «Ruta especial».

### Recomendable
- Visibilidad del jefe de zona sobre su delegación.
- Proyección estacional (si no, lineal).
- Duplicar un objetivo para el periodo siguiente.

### Después (no ahora)
- Retirar la tabla y las funciones viejas una vez validado (con DROP de firma exacta).
- Tipos actividad, rappel y campaña.

## Pruebas
- En una transacción que se deshace, con identidades simuladas (comercial, jefe, director y admin): cada uno ve solo lo que le toca; el comercial no escribe; las excepciones sustituyen a la meta del grupo; la meta conjunta y la meta por cliente se calculan bien; el cliente ajeno cuenta sin dar acceso a su ficha.
- Cuadre: el importe real y el del año anterior de cada cartera de 2026 en la versión nueva deben coincidir con `objetivos_seguimiento` usando el criterio A. Si se elige C, se informa de la diferencia por comercial.
- Sin cuentas reales ni datos que se queden guardados.

## Detalles técnicos
- Migración `drizzle/migrations/0036_objetivos_v2.sql`. Las funciones nuevas no cambian ninguna firma existente.
- Si alguna función existente se recrea con otra firma: DROP con la firma exacta y se restaura el GRANT EXECUTE.
- Si hay que apartarse del plan en el SQL: detenerse y explicarlo.
