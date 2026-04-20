# Lobby Multijugador

## Descripción
Sala de espera donde los usuarios configuran y crean/unen salas de juego multijugador.

## Actores
- **Usuario autenticado** con al menos una guagua

## Flujo: Crear Sala
1. El usuario navega a `/race` desde el Dashboard
2. Selecciona una guagua de su garaje
3. Selecciona un mapa (Ciudad, Autopista, Circuito Oval, Metrópoli, Montaña)
4. Presiona "Crear Sala"
5. El sistema conecta al servidor Colyseus y crea una room con código de 4 caracteres
6. Se navega a `/race/play` con parámetros: bus, map, room code

## Flujo: Unirse a Sala por Código
1. El usuario selecciona pestaña "Unirse a Sala"
2. Ingresa el código de 4 caracteres (A-Z, 0-9, sin caracteres confusos)
3. Presiona "Unirse"
4. El sistema busca la sala por código vía `getAvailableRooms()`
5. Se une por `joinById()` y navega a `/race/play`

## Flujo: Unirse desde Lista
1. En la pestaña "Unirse a Sala" se muestra una lista de salas disponibles
2. La lista se actualiza cada 5 segundos (polling)
3. Cada sala muestra: código, mapa, jugadores/max
4. El usuario hace clic en "Unirse" → mismo flujo que unirse por código

## Flujo: Conducir Solo
1. El usuario presiona "Conducir solo sin sala" al fondo de la página
2. Se navega a `/race/play` sin room code
3. El juego carga en modo offline (sin NetworkManager)

## Rutas
| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET | `/race` | `RaceController@index` | Lobby |
| GET | `/race/play` | `RaceController@play` | Juego (Track.vue) |

## Archivos Relacionados
- `app/Http/Controllers/RaceController.php`
- `resources/js/Pages/Race/Lobby.vue`
- `resources/js/GameEngine/NetworkManager.js`

## Protocolo de Red
- **Servidor**: Colyseus 0.16.5 en puerto 2567
- **Transporte**: WebSocket
- **URL dinámica**: `ws://{window.location.hostname}:2567` (auto-detecta LAN/localhost)
- **Max jugadores por sala**: 8
- **Grace period**: 30s antes de destruir sala vacía
- `autoDispose = false` — la sala persiste entre Lobby → Track

## Código de Sala
- 4 caracteres alfanuméricos (A-Z, 0-9)
- Excluye caracteres confusos: O, 0, I, 1, L (evitar confusiones visuales)
- Se genera en `RaceRoom.generateRoomCode()`
