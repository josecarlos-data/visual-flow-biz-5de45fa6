# Visitas y Rutas: diagnóstico y mejoras

## Situación actual (datos reales)
- 21.506 visitas en total; 14.623 en el último año sobre 1.202 clientes distintos. 488 visitas no tienen cliente asociado.
- 63 % de las visitas tienen GPS, pero solo 1.366 de 11.592 clientes (12 %) tienen coordenadas.
- 6.572 clientes tienen ruta asignada, repartidos en 262 rutas (unos 25 clientes por ruta). La tabla de rutas está vacía: las rutas solo existen como texto en la ficha del cliente.
- 947 visitas planificadas, de las que solo 14 aparecen como realizadas: la planificación casi no se cierra con una visita real.
- Hay una visita fechada el 03/12/2026, en el futuro: hay que revisarla.

## Fase A: arreglar la base de datos de rutas (rápido)
1. Rellenar la tabla de rutas a partir de las 262 rutas de los clientes (código, comercial, delegación).
2. Rellenar las coordenadas que faltan en los clientes usando la posición media de sus visitas con GPS (solo cuando las visitas estén agrupadas, a menos de 300 m entre sí). Lo propuesto queda pendiente hasta que se valide.
3. Enlazar de forma automática la planificación con la visita: al guardar una visita de un cliente planificado ese día, se marca como realizada.
4. Lista para revisar: visitas sin cliente o con fecha futura.

## Fase B: el comercial en el día a día (móvil)
- «Mi día»: la agenda de hoy ordenada por cercanía (GPS), con botones para navegar, llamar y empezar la visita con el cliente ya rellenado.
- Visita rápida: el último motivo usado y el borrador se guardan automáticamente si se pierde la cobertura.
- Ficha previa a la visita: días sin comprar, última visita, alertas, ofertas recomendadas y situaciones activas, todo en una tarjeta.
- Sugerencias al planificar: clientes de la ruta pendientes («hace X días sin visita», «compra a la baja», «potencial sin explotar»).
- Rendimiento: carga por páginas en Visitas, consultas solo de las columnas necesarias y caché de la ficha del cliente.

## Fase C: panel aparte «Análisis de rutas» (dirección / jefe de zona)
Indicadores por ruta y por comercial:
- Cobertura: % de clientes de la ruta visitados en 30, 90 y 365 días.
- Frecuencia real frente a frecuencia objetivo por tipo de cliente (AA, A, B, C, D).
- Ventas, margen y evolución anual de la ruta; ventas por visita.
- Clientes con buenas compras pero pocas visitas, y al revés (visitas sin retorno).
- Distancia y dispersión de la ruta (cuando haya coordenadas).

Propuestas de ruta, explicadas con reglas y sin IA:
- Prioridad de cada cliente = potencial (tipo + ventas) × días sin visita / frecuencia objetivo × tendencia.
- Proponer que un cliente cambie de ruta cuando su posición está más cerca del centro de otra ruta del mismo comercial.
- Señalar rutas sobrecargadas o infrautilizadas frente a la capacidad semanal de visitas.
- Las propuestas son solo sugerencias: dirección las acepta o descarta y nada cambia de forma automática.

## Parámetros que hay que decidir (editables por el administrador)
- Frecuencia objetivo de visitas por tipo de cliente (propuesta: AA cada 7 días, A cada 14, B cada 30, C cada 60, D cada 90).
- Capacidad de visitas al día por comercial (propuesta: 8).
- Pesos de la puntuación (potencial, recencia, tendencia).
- Distancia máxima para dar por buena una coordenada.

## Detalles técnicos
- Una migración por fase con funciones del servidor que filtran por los permisos de clientes ya existentes. La función que propone coordenadas escribe en una columna aparte hasta que se validan.
- Nueva tabla de parámetros de rutas en los ajustes de la aplicación y un panel nuevo, asignable desde la gestión de usuarios.
- Se mide la velocidad con la sesión de Bautista antes y después de los cambios; el objetivo es menos de 2 s por pantalla.

## Orden propuesto
Fase A, después B y después C, cada una con su propia aprobación.
