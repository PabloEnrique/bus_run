# Conexión en Red Local (LAN)

## Descripción
Configuración para que otros dispositivos en la misma red local accedan al entorno de desarrollo.

## Contexto Técnico
El entorno corre en WSL2 sobre Windows. WSL2 tiene su propia interfaz de red virtual, lo que requiere port forwarding para exponer servicios a la LAN.

## Configuración

### Vite (Puerto 5173)
- `server.host: '0.0.0.0'` — escucha en todas las interfaces
- `server.cors: true`
- HMR host auto-detectado desde interfaces de red
- `VITE_HMR_HOST` en `.env` para override manual

### Game Server (Puerto 2567)
- Express binds a `0.0.0.0:2567`
- CORS habilitado para todos los orígenes
- URL del cliente generada dinámicamente: `ws://{window.location.hostname}:2567`

### Port Forwarding (Windows → WSL2)
```powershell
# Obtener IP de WSL2
$wslIp = wsl hostname -I | ForEach-Object { $_.Trim().Split(' ')[0] }

# Forward Vite
netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=$wslIp

# Forward Game Server
netsh interface portproxy add v4tov4 listenport=2567 listenaddress=0.0.0.0 connectport=2567 connectaddress=$wslIp
```

### Firewall Windows
```powershell
New-NetFirewallRule -DisplayName "Vite Dev" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Colyseus Dev" -Direction Inbound -LocalPort 2567 -Protocol TCP -Action Allow
```

## Auto-Detección de IP LAN (vite.config.js)
```javascript
function detectLanHost() {
    const nets = require('os').networkInterfaces();
    for (const iface of Object.values(nets).flat()) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
    return 'localhost';
}
```

## Variables de Entorno
| Variable | Valor | Descripción |
|----------|-------|-------------|
| `VITE_HMR_HOST` | IP de Windows LAN | Host para Hot Module Replacement |
| `VITE_GAME_SERVER_PORT` | 2567 | Puerto del servidor de juego |

## Archivos Relacionados
- `vite.config.js` — detectLanHost(), server config, proxy
- `resources/js/GameEngine/NetworkManager.js` — resolveGameServerUrl()
- `game-server/src/index.ts` — bind 0.0.0.0
- `.env` — VITE_HMR_HOST, VITE_GAME_SERVER_PORT
- `start.sh` — script de arranque

## Troubleshooting
- **HMR no conecta desde LAN**: Verificar `VITE_HMR_HOST` apunta a IP Windows (no WSL)
- **Game server unreachable**: Verificar port forwarding con `netsh interface portproxy show all`
- **`public/hot` tiene IP incorrecta**: Borrar y reiniciar Vite
