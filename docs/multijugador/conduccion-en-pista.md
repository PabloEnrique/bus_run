# Conducción en Pista (Track)

## Descripción
Vista principal del juego 3D donde el usuario conduce su guagua en tiempo real, solo o en multijugador.

## Actores
- **Usuario autenticado** que llegó desde el Lobby

## Flujo: Partida Multijugador
1. El usuario llega a `/race/play?bus=X&map=Y&room=CODE`
2. Se inicializan los subsistemas: Drivetrain, PhysicsWorld, SceneManager, AudioManager
3. Se conecta al servidor Colyseus por room code
4. Se registran callbacks: `onPlayerJoin`, `onPlayerLeave`, `onPlayerUpdate`
5. El game loop corre a 60 FPS con:
   - Input de teclado (acelerador, freno, dirección, cambios)
   - Simulación de física (Cannon-es RaycastVehicle)
   - Sincronización de posición al servidor (~15Hz)
   - Renderizado 3D (Three.js)
   - Interpolación de jugadores remotos
6. El HUD muestra: velocímetro, tacómetro, marcha, código de sala, jugadores conectados

## Flujo: Partida Solo
1. Mismo flujo pero sin conexión a Colyseus
2. Sin código de sala ni contador de jugadores en HUD

## Controles
| Tecla | Acción |
|-------|--------|
| W / ↑ | Acelerar |
| S / ↓ | Frenar / Reversa |
| A / ← | Girar izquierda |
| D / → | Girar derecha |
| Shift | Subir marcha |
| Ctrl | Bajar marcha |
| R | Reestablecer vehículo |
| Escape | Menú de pausa |

## Subsistemas

### PhysicsWorld
- Cannon-es con RaycastVehicle
- Heightfield terrain para mapas con colinas
- Materiales de contacto (asfalto, tierra)
- Hard-floor guarantee (excepto heightfield maps)

### Drivetrain
- Curvas de torque reales por modelo de guagua
- Caja de cambios manual con relaciones reales
- RPM, inercia de motor, drag aerodinámico

### SceneManager
- Renderizado Three.js con PBR materials
- Efectos de velocidad: FOV dinámico (60°→75°), niebla, camera shake
- Jugadores remotos con color personalizado
- Interpolación suave (lerp alpha=0.15)

### AudioManager
- Web Audio API con oscilador sawtooth
- Frecuencia reactiva al RPM del motor
- Mute/unmute disponible

### NetworkManager
- `getStateCallbacks(room)` → `$(room.state)` para schema v3
- Envío de posición a ~15Hz (throttled)
- Callbacks: `onPlayerJoin`, `onPlayerLeave`, `onPlayerUpdate`

## Archivos Relacionados
- `resources/js/Pages/Race/Track.vue`
- `resources/js/GameEngine/PhysicsWorld.js`
- `resources/js/GameEngine/Drivetrain.js`
- `resources/js/GameEngine/SceneManager.js`
- `resources/js/GameEngine/AudioManager.js`
- `resources/js/GameEngine/NetworkManager.js`
- `resources/js/Components/GaugeCluster.vue`

## Rutas
| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET | `/race/play` | `RaceController@play` | Carga el juego |

## Query Params
| Param | Tipo | Descripción |
|-------|------|-------------|
| `bus` | int | ID de la guagua del catálogo |
| `map` | string | ID del mapa |
| `room` | string | Código de sala (opcional) |
