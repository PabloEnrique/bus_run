#!/usr/bin/env bash
set -euo pipefail

VITE_PID=""
COLYSEUS_PID=""

cleanup() {
    echo ""
    echo "🛑 Apagando servicios..."

    if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
        echo "   Deteniendo Vite (PID $VITE_PID)..."
        kill "$VITE_PID" 2>/dev/null || true
    fi

    if [[ -n "$COLYSEUS_PID" ]] && kill -0 "$COLYSEUS_PID" 2>/dev/null; then
        echo "   Deteniendo Colyseus (PID $COLYSEUS_PID)..."
        kill "$COLYSEUS_PID" 2>/dev/null || true
    fi

    echo "   Apagando contenedores Docker (Sail)..."
    ./vendor/bin/sail down

    echo "✅ Todo apagado limpiamente."
}

trap cleanup SIGINT SIGTERM

cd "$(dirname "$0")"

echo "🚌 Hot Bus Drive — Iniciando entorno de desarrollo"
echo "=================================================="

# 1. Laravel Sail (Docker)
echo ""
echo "🐳 Levantando contenedores Docker (Sail)..."
./vendor/bin/sail up -d
echo "   ✅ Sail listo."

# 2. Colyseus game server
echo ""
echo "🎮 Iniciando servidor Colyseus..."
(cd game-server && npm start) &
COLYSEUS_PID=$!
echo "   ✅ Colyseus arrancado (PID $COLYSEUS_PID)."

# 3. Vite dev server (HMR)
echo ""
echo "⚡ Iniciando Vite (Hot Reload)..."
npm run dev &
VITE_PID=$!
echo "   ✅ Vite arrancado (PID $VITE_PID)."

echo ""
echo "=================================================="
echo "🟢 Entorno listo. Presiona Ctrl+C para apagar todo."
echo "=================================================="

wait
