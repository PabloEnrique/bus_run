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

# Kill stale processes on required ports
for port in 5173 2567; do
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo "⚠️  Puerto $port ocupado. Matando procesos: $pids"
        kill $pids 2>/dev/null || true
        sleep 0.5
    fi
done

echo "🚌 Hot Bus Drive — Iniciando entorno de desarrollo"
echo "=================================================="

# 0. Instalar dependencias si es necesario
if [[ ! -f vendor/bin/sail ]]; then
    echo ""
    echo "📦 vendor/ no encontrado. Instalando dependencias PHP..."
    docker run --rm \
        -u "$(id -u):$(id -g)" \
        -v "$(pwd):/var/www/html" \
        -w /var/www/html \
        laravelsail/php83-composer:latest \
        composer install --ignore-platform-reqs
    echo "   ✅ Dependencias PHP instaladas."
fi

if [[ ! -f .env ]]; then
    echo ""
    echo "📄 .env no encontrado. Creando desde .env.example..."
    cp .env.example .env
    echo "   ✅ .env creado."
fi

if [[ ! -d node_modules ]]; then
    echo ""
    echo "📦 node_modules/ no encontrado. Instalando dependencias frontend..."
    npm install
    echo "   ✅ Dependencias frontend instaladas."
fi

if [[ ! -d game-server/node_modules ]]; then
    echo ""
    echo "📦 game-server/node_modules/ no encontrado. Instalando dependencias Colyseus..."
    (cd game-server && npm install && npm run build)
    echo "   ✅ Dependencias Colyseus instaladas y compiladas."
fi

# 1. Laravel Sail (Docker)
echo ""
echo "🐳 Levantando contenedores Docker (Sail)..."
./vendor/bin/sail up -d
echo "   ✅ Sail listo."

if ! grep -qE '^APP_KEY=.+' .env; then
    echo ""
    echo "🔑 Generando APP_KEY..."
    ./vendor/bin/sail artisan key:generate
    echo "   ✅ APP_KEY generada."
fi

# 2. Colyseus game server
echo ""
echo "🎮 Iniciando servidor Colyseus..."
(cd game-server && npm run dev) &
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
