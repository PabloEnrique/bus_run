# 🚌 Bus Run - Master Development Plan (13 Sprints)

## 📋 Regla de Oro de Ejecución
**EL AGENTE NO DEBE EJECUTAR MÁS DE UN SPRINT A LA VEZ.** Este documento sirve como referencia de arquitectura. El agente debe esperar la instrucción explícita del usuario ("Inicia Sprint X") antes de modificar cualquier archivo. Al terminar cada sprint, se debe realizar un commit y push a la rama `develop`.

---

## 🏗️ Fase 1: Cimientos Web (Completado/En Progreso)
- **Sprint 1: Autenticación Simple.** Registro e inicio de sesión con Laravel Sail/Inertia.
- **Sprint 2: Garaje y Catálogo.** Especificaciones técnicas reales (Rosa, Coaster, Volare) en JSON/DB.
- **Sprint 3: Economía y Gasolinera.** Gestión de billetera y llenado de tanques con validación.

## ⚙️ Fase 2: Motor de Juego y Físicas (Estado Actual)
- **Sprint 4: Servidor Multijugador (Colyseus).** Sincronización de estados y API de integración.
- **Sprint 5: Cliente 3D (Three.js/Cannon-es).** Inicialización de escena y Raycast Vehicle básico.
- **Sprint 6: Tren Motriz Realista.** Curvas de torque, relaciones de marcha y RPM dinámicas.
- **Sprint 7: Handling y Cámara.** Fricción de llantas (subviraje), cámara de seguimiento y circuito.
- **Sprint 8: TDD y Refactor de Tracción.** Implementación de Vitest, inercia de motor y corrección de bugs.

## 🏁 Fase 3: Reglas de Juego (Próximamente)
- **Sprint 9: Colisiones y Autoridad del Servidor.** Validación de choques en Node.js (Anti-cheat).
- **Sprint 10: Lógica de Carrera.** Lobbies, semáforo, checkpoints, vueltas y leaderboard.

## 🛠️ Fase 4: Metajuego (Próximamente)
- **Sprint 11: Taller de Tuning.** Mejoras mecánicas (Turbo, Suspensión, Frenos) usando la billetera.

## 🎨 Fase 5: Estética y Audio (Próximamente)
- **Sprint 12: Modelos Reales y Audio.** Reemplazo de cajas por archivos GLB y sonido de motor diésel.

## 🚀 Fase 6: Despliegue (Próximamente)
- **Sprint 13: Producción.** Configuración de VPS, SSL, WebSockets seguros y CI/CD.