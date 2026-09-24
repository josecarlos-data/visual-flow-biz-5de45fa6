# Tareas

- [x] Migración: sesiones por equipo en registrar_sesion, interruptor control_sesiones_activo en ambas funciones
- [x] Cliente: crm_sesion_id en localStorage, expulsión con cierre local, segunda pestaña termina en login con aviso
- [x] Panel: selector control_sesiones_activo con advertencia
- [x] Build y typecheck limpios; pendiente solo la prueba manual con dos pestañas normales del mismo equipo
- [x] Corrección carrera al iniciar sesión: verificar_sesion defiende fila ausente, useAuth espera a controlListo y salta el primer pathname

- [x] Rehacer useAuth con máquina de estados única (resolverAcceso, generación, límites de 8 s por paso, vigilante solo en activo)
