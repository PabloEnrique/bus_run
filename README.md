# 🚌 Hot Bus Drive

Multiplayer bus racing game inspired by Caribbean public transport culture. Race real-world bus models through chaotic urban circuits — drift, draft, and dominate.

## Tech Stack

- **Backend:** Laravel 11 · PHP 8.3 · MySQL 8.4
- **Frontend:** Vue 3.4 · Inertia.js 3 · TailwindCSS 4
- **Infra:** Docker via Laravel Sail · Vite 8

## Setup

```bash
# Clone repo
git clone git@github.com:PabloEnrique/bus_run.git
cd bus_run

# Start all services (instala dependencias automáticamente si es necesario)
./start.sh
```

`start.sh` detecta y ejecuta automáticamente lo que haga falta:
- Instala dependencias PHP vía Docker si `vendor/` no existe
- Crea `.env` desde `.env.example` si no existe
- Instala dependencias frontend (`npm install`) si `node_modules/` no existe
- Instala y compila el game server Colyseus si `game-server/node_modules/` no existe
- Genera `APP_KEY` si no está configurada
- Levanta Sail (Docker), Vite (HMR) y Colyseus

App runs at **http://localhost**. Vite HMR at port 5173. Colyseus game server at port 2567.

## Game Features (In Progress)

- **Auth:** Minimal name + password registration
- **Garage:** Browse and inspect your bus collection with real specs
- **Lobby:** *(coming soon)* Create/join race rooms
- **Race:** *(coming soon)* Real-time multiplayer physics racing

## Bus Catalog

9 buses across 3 real-world models with authentic specs:

| Model | Generations | Weight Range | Torque Range |
|-------|------------|-------------|-------------|
| Mitsubishi Rosa | BE4 / BE6 / BE7 | 3,250–3,650 kg | 285–530 Nm |
| Toyota Coaster | B20 / B40-50 / B60-70 | 3,100–3,550 kg | 240–420 Nm |
| Marcopolo Volare | A-Series / W-Series / Fly-V | 4,200–4,800 kg | 430–600 Nm |

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
