# Objetivos v2 — Entrega 2 (con dos correcciones previas)

## 1. Jefe de zona solo ve a los comerciales de su delegación (migración 0037)
- Nueva función `delegacion_vendedor(_vendedor)`: si el comercial tiene usuario (perfil con ese código de vendedor), su `profiles.delegacion`; si no, la delegación donde está la mayoría de sus clientes (empate: la de más facturación del año anterior, luego orden alfabético).
- `puede_ver_asignacion_objetivo`: la rama del jefe pasa de «tiene algún cliente en mi delegación» a `delegacion_vendedor(_vendedor) = mi delegación`. Misma firma, `CREATE OR REPLACE`, sin DROP ni cambio de GRANT.
- Así el jefe ve el objetivo entero solo de sus comerciales y nada de los de fuera.
- Repetir la prueba del jefe de Málaga (identidad ficticia, transacción revertida) e informar cuántos objetivos ve y de quién.

## 2. Auditoría de la foto de cartera (misma migración 0037)
- `auditar_cambio()` en `objetivo_clientes` deja de anotar filas con `origen = 'foto_cartera'`.
- `objetivo_tomar_foto` añade una línea de resumen por objetivo: «foto de N clientes».
- Altas y bajas manuales de clientes se siguen anotando una a una.

## 3. Pantallas
- **Asistente (director y admin)** en `AdminObjetivos.tsx`: pasos tipo → periodo → atribución y comparación → meta de grupo → excepciones por comercial → clientes (con casilla «excluir de la cartera») → tramos (importe en euros opcional) → resumen y guardar/borrador. Aviso con los comerciales sin código de vendedor. Duplicar desde la lista.
- **Tarjetas del comercial** en `Objetivos.tsx`, pensadas para móvil: avance, lo que falta, proyección y tramo alcanzado. Sin borradores. Jefe y dirección ven la misma tarjeta por comercial con filtro.
- **Usuarios**: el selector actual de código de vendedor se mantiene y se añade aviso visible en las filas de comerciales/jefes sin código.
- **Retirar «Ruta especial»** de `AdminObjetivos`, `ClienteDetalle`, `AdminFunctions` y los hooks de pantalla; tabla y funciones viejas intactas.
- Acceso con la entrada «objetivos» existente de paneles; no se crea sección nueva.

## Detalles técnicos
- Todo cálculo sigue en las RPC `objetivos_v2_*`; el cliente no calcula avance.
- Hook nuevo `useObjetivosV2` sobre `objetivos_v2_avance/detalle/guardar/duplicar/propuesta/sin_codigo`.
- Pruebas de reglas (tramo alcanzado, lo que falta) en tests pequeños.
- Al final: lista de ficheros cambiados y migración (solo 0037). Si el SQL exige otro enfoque, me detengo y lo explico.
