# Servidor de Juego (Colyseus)

## Descripción
Servidor WebSocket basado en Colyseus 0.16 que gestiona salas multijugador, sincronización de estado y matchmaking.

## Arquitectura
```
game-server/
├── src/
│   ├── index.ts          ← Entry point (Express + Colyseus Server)
│   └── rooms/
│       ├── RaceRoom.ts   ← Lógica de sala
│       └── schema/
│           └── RaceState.ts  ← Estado sincronizado
```

## Estado Sincronizado (Schema)

### RaceState
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `players` | MapSchema\<Player\> | Jugadores indexados por sessionId |
| `roomCode` | string | Código de 4 caracteres |
| `mapId` | string | Mapa seleccionado |
| `hostId` | string | SessionId del creador |

### Player
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | UserId de Laravel |
| `x, y, z` | number | Posición 3D |
| `rotation` | number | Rotación Y |
| `speed` | number | Velocidad actual |
| `torque` | number | Torque del motor |
| `weight` | number | Peso del vehículo |
| `paintHex` | string | Color del vehículo |
| `busModel` | string | Nombre del modelo |

## Configuración
- **Puerto**: `GAME_PORT` env var o 2567
- **Host**: `0.0.0.0` (todas las interfaces)
- **CORS**: habilitado para todos los orígenes
- **Monitor**: `/colyseus` (Colyseus Monitor dashboard)
- **Max clientes por sala**: 8

## Ciclo de Vida de una Sala
1. **onCreate**: genera roomCode, asigna hostId, configura metadata
2. **onJoin**: crea Player en el MapSchema, actualiza metadata con count
3. **onMessage('updatePosition')**: actualiza posición del player
4. **onLeave**: elimina Player, inicia grace period si sala queda vacía
5. **onDispose**: limpieza del timer de grace period

## Grace Period
- `autoDispose = false`
- Cuando la sala queda vacía, espera 30 segundos antes de destruirse
- Si un jugador se une durante el grace period, se cancela la destrucción
- Permite que Lobby cree la sala → deje la sala → Track.vue se una por código

## API del Cliente (NetworkManager)
```javascript
const $ = getStateCallbacks(room);   // Retorna función $()
const $state = $(room.state);         // Proxy del estado
$state.players.onAdd((player, id) => { ... });
$state.players.onRemove((_, id) => { ... });
$(player).onChange(() => { ... });
```

## Archivos Relacionados
- `game-server/src/index.ts`
- `game-server/src/rooms/RaceRoom.ts`
- `game-server/src/rooms/schema/RaceState.ts`
- `game-server/package.json`
- `resources/js/GameEngine/NetworkManager.js`
