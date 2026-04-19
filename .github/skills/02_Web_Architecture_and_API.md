# 02 — Web Architecture & API: Hot Bus Drive

| Field            | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| **Project**      | Hot Bus Drive                                                 |
| **Stack**        | PHP 8.3+ · Laravel 11 · Vue 3.4+ · InertiaJS 2.x · Vite 6   |
| **Database**     | MySQL 8.0+ **or** PostgreSQL 16+                              |
| **CSS**          | TailwindCSS 4                                                 |
| **Auth**         | Laravel Breeze (session-based)                                |
| **Revision**     | 1.0.0                                                         |
| **Date**         | 2026-04-18                                                    |

---

## Table of Contents

1. [Tech Stack & Version Pinning](#1-tech-stack--version-pinning)
2. [Directory Structure Conventions](#2-directory-structure-conventions)
3. [Database Schema](#3-database-schema)
4. [Eloquent Models & Relationships](#4-eloquent-models--relationships)
5. [Inertia Route Contracts](#5-inertia-route-contracts)
6. [Authentication & WebSocket Token Handoff](#6-authentication--websocket-token-handoff)
7. [Shared Inertia Data](#7-shared-inertia-data)
8. [Coding Standards](#8-coding-standards)
9. [Environment & Configuration](#9-environment--configuration)

---

## 1. Tech Stack & Version Pinning

| Dependency           | Minimum Version | Notes                                           |
| -------------------- | --------------- | ----------------------------------------------- |
| PHP                  | 8.3             | `declare(strict_types=1)` in every file.        |
| Laravel              | 11.x           | Latest LTS-track release.                       |
| Vue                  | 3.4+            | Composition API + `<script setup>` exclusively. |
| InertiaJS (Laravel)  | 2.x             | `@inertiajs/vue3` client adapter.               |
| Vite                 | 6.x             | Laravel Vite plugin.                            |
| TailwindCSS          | 4.x             | Utility-first; no custom CSS unless necessary.  |
| TypeScript           | 5.4+            | **Recommended** for all `.vue` and `.ts` files. |
| Node.js (build)      | 22 LTS          | For Vite dev server and build pipeline.         |
| MySQL **or** PostgreSQL | 8.0 / 16     | Choose one per environment; schema is dialect-neutral. |

---

## 2. Directory Structure Conventions

```
hot-bus-drive/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Auth/               ← Breeze-generated auth controllers
│   │   │   ├── DashboardController.php
│   │   │   ├── GarageController.php
│   │   │   ├── ShopController.php
│   │   │   ├── LobbyController.php
│   │   │   └── RaceResultController.php
│   │   ├── Middleware/
│   │   │   └── HandleInertiaRequests.php
│   │   └── Requests/
│   │       ├── PurchaseVehicleRequest.php
│   │       ├── CreateRoomRequest.php
│   │       └── JoinRoomRequest.php
│   ├── Models/
│   │   ├── User.php
│   │   ├── Vehicle.php
│   │   ├── VehicleSpec.php
│   │   ├── UserVehicle.php
│   │   ├── Track.php
│   │   └── RaceResult.php
│   ├── Services/
│   │   ├── GarageService.php       ← Business logic: purchase, equip
│   │   ├── LobbyService.php        ← Room creation, token generation
│   │   └── WebSocketTokenService.php
│   └── Enums/
│       └── RaceStatus.php          ← waiting, countdown, racing, finished
├── database/
│   ├── migrations/
│   ├── seeders/
│   │   ├── VehicleSeeder.php       ← Seed the 3 launch vehicles + specs
│   │   └── TrackSeeder.php         ← Seed the 3 launch tracks
│   └── factories/
├── resources/
│   ├── js/
│   │   ├── app.ts                  ← Inertia + Vue bootstrap
│   │   ├── Pages/
│   │   │   ├── Auth/
│   │   │   │   ├── Login.vue
│   │   │   │   └── Register.vue
│   │   │   ├── Dashboard.vue
│   │   │   ├── Garage/
│   │   │   │   ├── Index.vue       ← Vehicle grid
│   │   │   │   └── Show.vue        ← Single vehicle detail
│   │   │   ├── Shop/
│   │   │   │   └── Index.vue       ← Purchasable vehicles
│   │   │   ├── Lobby/
│   │   │   │   ├── Index.vue       ← Room list
│   │   │   │   └── Room.vue        ← Inside a room: map vote, ready check
│   │   │   └── Race/
│   │   │       └── Results.vue     ← Post-race scoreboard
│   │   ├── Components/
│   │   │   ├── UI/                 ← Button, Modal, Card, Badge…
│   │   │   ├── Vehicle/            ← VehicleCard, SpecTable…
│   │   │   └── Race/               ← Minimap, FuelGauge, Speedometer…
│   │   ├── Layouts/
│   │   │   └── AppLayout.vue       ← Sidebar/nav + slot
│   │   ├── Composables/            ← useAuth, useWebSocket, useLobby…
│   │   └── types/
│   │       └── index.d.ts          ← Shared TypeScript interfaces
│   └── views/
│       └── app.blade.php           ← Root Blade template (Inertia mount point)
├── routes/
│   ├── web.php                     ← All Inertia routes
│   └── api.php                     ← Internal API (Colyseus → Laravel callbacks)
├── colyseus-server/                ← Separate Node.js project (see 03)
├── public/
├── tests/
│   ├── Feature/
│   └── Unit/
├── .env.example
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Rules:**

1. **One controller per resource.** No "God controllers".
2. **No business logic in controllers.** Controllers validate (via FormRequest), delegate to a Service class, and return an Inertia response.
3. **Vue pages live under `resources/js/Pages/`**, mirroring the URL structure.
4. **Reusable UI components** go in `Components/UI/`. Domain-specific components go in `Components/<Domain>/`.

---

## 3. Database Schema

All column names use **snake_case**. All foreign keys use `<table>_id` convention. Timestamps are `created_at` / `updated_at` (Laravel default).

### 3.1 `users`

> Generated by Laravel Breeze with extensions.

```sql
CREATE TABLE users (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    email_verified_at TIMESTAMP     NULL,
    password        VARCHAR(255)    NOT NULL,
    xp              INT UNSIGNED    NOT NULL DEFAULT 0,
    currency        INT UNSIGNED    NOT NULL DEFAULT 0,
    remember_token  VARCHAR(100)    NULL,
    created_at      TIMESTAMP       NULL,
    updated_at      TIMESTAMP       NULL,

    INDEX idx_users_email (email)
);
```

### 3.2 `vehicles`

> Master catalogue of all bus models available in the game.

```sql
CREATE TABLE vehicles (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug            VARCHAR(64)     NOT NULL UNIQUE,
    name            VARCHAR(128)    NOT NULL,
    manufacturer    VARCHAR(128)    NOT NULL,
    year            SMALLINT UNSIGNED NOT NULL,
    base_price      INT UNSIGNED    NOT NULL DEFAULT 0,   -- 0 = free starter
    thumbnail_url   VARCHAR(512)    NULL,
    created_at      TIMESTAMP       NULL,
    updated_at      TIMESTAMP       NULL,

    INDEX idx_vehicles_slug (slug)
);
```

### 3.3 `vehicle_specs`

> One-to-one with `vehicles`. Contains every physical parameter required by the physics engine (see `01_Game_Design_Document.md` §3 and §6).

```sql
CREATE TABLE vehicle_specs (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    vehicle_id          BIGINT UNSIGNED NOT NULL UNIQUE,
    max_hp              SMALLINT UNSIGNED NOT NULL,
    max_torque_nm       SMALLINT UNSIGNED NOT NULL,
    torque_curve_json   JSON            NOT NULL,   -- [[RPM, Nm], ...]
    weight_kg           INT UNSIGNED    NOT NULL,
    cd                  DECIMAL(4,3)    NOT NULL,   -- drag coefficient
    frontal_area_m2     DECIMAL(4,2)    NOT NULL,
    wheelbase_m         DECIMAL(4,2)    NOT NULL,
    track_width_m       DECIMAL(4,2)    NOT NULL,
    wheel_radius_m      DECIMAL(4,3)    NOT NULL,
    gear_ratios_json    JSON            NOT NULL,   -- [3.6, 2.1, 1.4, 1.0]
    final_drive_ratio   DECIMAL(4,2)    NOT NULL,
    fuel_tank_liters    SMALLINT UNSIGNED NOT NULL,
    bsfc_map_json       JSON            NOT NULL,   -- 2D lookup (see GDD §6.2)
    suspension_k        INT UNSIGNED    NOT NULL,   -- spring stiffness N/m
    suspension_c        INT UNSIGNED    NOT NULL,   -- damping coeff N·s/m
    cg_height_m         DECIMAL(4,3)    NOT NULL,   -- centre of gravity height
    created_at          TIMESTAMP       NULL,
    updated_at          TIMESTAMP       NULL,

    CONSTRAINT fk_vehicle_specs_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);
```

**Column-to-GDD mapping:**

| Column              | GDD Reference          | Physics Formula Symbol |
| ------------------- | ---------------------- | ---------------------- |
| `max_torque_nm`     | §3.1.1 Torque Curve    | `T_engine` peak       |
| `torque_curve_json` | §6.2 Torque Curve      | `T_engine(RPM)`       |
| `weight_kg`         | §3.4 Rolling Resistance | `m`                   |
| `cd`                | §3.3 Aerodynamic Drag  | `C_d`                 |
| `frontal_area_m2`   | §3.3 Aerodynamic Drag  | `A`                   |
| `wheelbase_m`       | §3.5.1 Weight Transfer | `L`                   |
| `track_width_m`     | §3.5.2 Weight Transfer | `t`                   |
| `wheel_radius_m`    | §3.1.2 Wheel Force     | `r_wheel`             |
| `gear_ratios_json`  | §3.1.2 Wheel Force     | `G_current`           |
| `final_drive_ratio` | §3.1.2 Wheel Force     | `G_final`             |
| `fuel_tank_liters`  | §4.2 Fuel Tank         | `max_fuel`            |
| `bsfc_map_json`     | §4.1 BSFC              | `BSFC(RPM, load)`     |
| `suspension_k`      | §3.6 Suspension        | `K`                   |
| `suspension_c`      | §3.6 Suspension        | `C_damp`              |
| `cg_height_m`       | §3.5, §3.7             | `h_cg`                |

### 3.4 `user_vehicles`

> Many-to-many pivot between users and vehicles. Represents the player's garage.

```sql
CREATE TABLE user_vehicles (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,
    vehicle_id      BIGINT UNSIGNED NOT NULL,
    nickname        VARCHAR(64)     NULL,
    paint_hex       CHAR(7)         NOT NULL DEFAULT '#FFFFFF',
    acquired_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP       NULL,
    updated_at      TIMESTAMP       NULL,

    CONSTRAINT fk_uv_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_uv_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_uv_unique (user_id, vehicle_id)
);
```

### 3.5 `tracks`

> Master catalogue of racing tracks.

```sql
CREATE TABLE tracks (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug            VARCHAR(64)     NOT NULL UNIQUE,
    name            VARCHAR(128)    NOT NULL,
    description     TEXT            NULL,
    laps            TINYINT UNSIGNED NOT NULL DEFAULT 3,
    has_pit_stop    BOOLEAN         NOT NULL DEFAULT FALSE,
    thumbnail_url   VARCHAR(512)    NULL,
    track_data_json JSON            NOT NULL,    -- see GDD §5.2 for schema
    created_at      TIMESTAMP       NULL,
    updated_at      TIMESTAMP       NULL,

    INDEX idx_tracks_slug (slug)
);
```

### 3.6 `race_results`

> One row per player per completed race.

```sql
CREATE TABLE race_results (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    track_id            BIGINT UNSIGNED NOT NULL,
    vehicle_id          BIGINT UNSIGNED NOT NULL,
    position            TINYINT UNSIGNED NOT NULL,   -- 1–4 or 0 for DNF
    total_time_ms       INT UNSIGNED    NULL,        -- NULL if DNF
    fuel_used_liters    DECIMAL(6,2)    NOT NULL DEFAULT 0,
    xp_earned           INT UNSIGNED    NOT NULL DEFAULT 0,
    currency_earned     INT UNSIGNED    NOT NULL DEFAULT 0,
    raced_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP       NULL,
    updated_at          TIMESTAMP       NULL,

    CONSTRAINT fk_rr_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_rr_track   FOREIGN KEY (track_id)   REFERENCES tracks(id)   ON DELETE CASCADE,
    CONSTRAINT fk_rr_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    INDEX idx_rr_user (user_id),
    INDEX idx_rr_track (track_id)
);
```

---

## 4. Eloquent Models & Relationships

### 4.1 Relationship Map

```
User ──┬── hasMany ──▶ UserVehicle ──── belongsTo ──▶ Vehicle
       │                                                  │
       │                                                  ├── hasOne ──▶ VehicleSpec
       │                                                  │
       ├── hasMany ──▶ RaceResult ──── belongsTo ──▶ Track
       │
       └── belongsToMany ──▶ Vehicle (via user_vehicles)
```

### 4.2 Model Conventions

```php
// app/Models/User.php
declare(strict_types=1);

class User extends Authenticatable
{
    // Mass assignment protection
    protected $fillable = ['name', 'email', 'password', 'xp', 'currency'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'xp' => 'integer',
            'currency' => 'integer',
        ];
    }

    public function vehicles(): BelongsToMany
    {
        return $this->belongsToMany(Vehicle::class, 'user_vehicles')
                    ->withPivot(['nickname', 'paint_hex', 'acquired_at'])
                    ->withTimestamps();
    }

    public function raceResults(): HasMany
    {
        return $this->hasMany(RaceResult::class);
    }
}
```

```php
// app/Models/Vehicle.php
declare(strict_types=1);

class Vehicle extends Model
{
    public function spec(): HasOne
    {
        return $this->hasOne(VehicleSpec::class);
    }

    public function owners(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_vehicles')
                    ->withPivot(['nickname', 'paint_hex', 'acquired_at'])
                    ->withTimestamps();
    }
}
```

```php
// app/Models/VehicleSpec.php
declare(strict_types=1);

class VehicleSpec extends Model
{
    protected function casts(): array
    {
        return [
            'torque_curve_json' => 'array',
            'gear_ratios_json' => 'array',
            'bsfc_map_json' => 'array',
            'cd' => 'float',
            'frontal_area_m2' => 'float',
            'wheelbase_m' => 'float',
            'track_width_m' => 'float',
            'wheel_radius_m' => 'float',
            'final_drive_ratio' => 'float',
            'cg_height_m' => 'float',
        ];
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }
}
```

---

## 5. Inertia Route Contracts

All routes use **Inertia responses** unless explicitly marked as JSON API.

### 5.1 Route Table

| Method | URI                        | Controller Method             | Inertia Page              | Auth | Description                          |
| ------ | -------------------------- | ----------------------------- | ------------------------- | ---- | ------------------------------------ |
| GET    | `/`                        | redirect → `/dashboard`       | —                         | No   | Landing redirect.                    |
| GET    | `/dashboard`               | `DashboardController@index`   | `Dashboard`               | Yes  | Recent races, stats, level.          |
| GET    | `/garage`                  | `GarageController@index`      | `Garage/Index`            | Yes  | List user's vehicles.                |
| GET    | `/garage/{userVehicle}`    | `GarageController@show`       | `Garage/Show`             | Yes  | Vehicle detail + stats.              |
| GET    | `/shop`                    | `ShopController@index`        | `Shop/Index`              | Yes  | All purchasable vehicles.            |
| POST   | `/shop/purchase`           | `ShopController@purchase`     | redirect → `/garage`      | Yes  | Buy a vehicle (JSON: `vehicle_id`).  |
| GET    | `/lobby`                   | `LobbyController@index`       | `Lobby/Index`             | Yes  | List open rooms.                     |
| POST   | `/lobby/create`            | `LobbyController@create`      | JSON response             | Yes  | Create room → return `{ room_id, ws_token }`. |
| POST   | `/lobby/join/{roomId}`     | `LobbyController@join`        | JSON response             | Yes  | Join room → return `{ ws_token }`.   |
| GET    | `/race/results/{raceId}`   | `RaceResultController@show`   | `Race/Results`            | Yes  | Post-race scoreboard.               |

### 5.2 JSON API Routes (Internal)

These routes are called by the **Colyseus server** to persist race results. They are protected by a shared API secret (not user auth).

| Method | URI                        | Controller Method               | Description                            |
| ------ | -------------------------- | ------------------------------- | -------------------------------------- |
| POST   | `/api/race/complete`       | `RaceResultController@store`    | Colyseus posts final race data.        |

**Payload:**
```json
{
  "api_secret": "COLYSEUS_API_SECRET",
  "track_slug": "urban-circuit",
  "results": [
    {
      "user_id": 1,
      "vehicle_id": 2,
      "position": 1,
      "total_time_ms": 285400,
      "fuel_used_liters": 42.5
    }
  ]
}
```

The controller validates the `api_secret` against `config('services.colyseus.api_secret')`, calculates XP/currency per `01_Game_Design_Document.md` §2.4, and persists each result row.

---

## 6. Authentication & WebSocket Token Handoff

### 6.1 Session Authentication (Portal)

The portal uses **Laravel Breeze** with session-based authentication:

- Registration: email + password (bcrypt hashed).
- Login: session cookie (`laravel_session`) + CSRF token.
- All Inertia routes are protected by the `auth` middleware.
- Email verification is **optional** for v1 but the migration column exists.

### 6.2 WebSocket Token Generation

When a player joins or creates a lobby room, the backend generates a **short-lived signed token** for Colyseus:

```php
// app/Services/WebSocketTokenService.php
declare(strict_types=1);

class WebSocketTokenService
{
    public function generate(User $user, string $roomId): string
    {
        $payload = [
            'sub' => $user->id,
            'name' => $user->name,
            'room' => $roomId,
            'exp' => now()->addMinutes(5)->timestamp,
        ];

        return Crypt::encryptString(json_encode($payload));
    }

    public function validate(string $token): ?array
    {
        try {
            $payload = json_decode(Crypt::decryptString($token), true);

            if ($payload['exp'] < now()->timestamp) {
                return null;
            }

            return $payload;
        } catch (\Exception) {
            return null;
        }
    }
}
```

**Flow:**

1. Player clicks "Join Room" in the Vue lobby page.
2. Vue sends `POST /lobby/join/{roomId}` via Inertia/axios.
3. `LobbyController` calls `WebSocketTokenService::generate()`.
4. Response returns `{ room_id, ws_token, ws_url }`.
5. Vue client connects to Colyseus: `client.joinById(roomId, { token: wsToken })`.
6. Colyseus `onJoin` validates the token by calling `WebSocketTokenService::validate()` logic (replicated in Node.js using the same `APP_KEY` for decryption, or via an HTTP callback to Laravel's `/api/auth/verify-ws-token`).

### 6.3 Token Verification in Colyseus

Two strategies (choose one):

| Strategy                  | Pros                          | Cons                                |
| ------------------------- | ----------------------------- | ----------------------------------- |
| **HTTP callback to Laravel** | Single source of truth.    | Adds ~50 ms latency on join.        |
| **Shared secret decryption** | Zero network overhead.     | Requires syncing APP_KEY to Node.js. |

Recommended: **HTTP callback** for simplicity. The Colyseus server calls `POST /api/auth/verify-ws-token` with the token and receives `{ valid: true, user_id, name }` or `{ valid: false }`.

---

## 7. Shared Inertia Data

The `HandleInertiaRequests` middleware shares global data accessible in every Vue page via `usePage()`:

```php
// app/Http/Middleware/HandleInertiaRequests.php
declare(strict_types=1);

class HandleInertiaRequests extends Middleware
{
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),

            'auth' => [
                'user' => $request->user() ? [
                    'id' => $request->user()->id,
                    'name' => $request->user()->name,
                    'email' => $request->user()->email,
                    'xp' => $request->user()->xp,
                    'currency' => $request->user()->currency,
                ] : null,
            ],

            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],

            'gameConfig' => [
                'maxPlayersPerRoom' => 4,
                'tickRate' => 30,
                'wsUrl' => config('services.colyseus.ws_url'),
            ],
        ];
    }
}
```

**TypeScript interface** (`resources/js/types/index.d.ts`):

```typescript
export interface SharedData {
  auth: {
    user: {
      id: number;
      name: string;
      email: string;
      xp: number;
      currency: number;
    } | null;
  };
  flash: {
    success: string | null;
    error: string | null;
  };
  gameConfig: {
    maxPlayersPerRoom: number;
    tickRate: number;
    wsUrl: string;
  };
}
```

---

## 8. Coding Standards

### 8.1 PHP

| Rule                          | Standard                                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| Style                         | **PSR-12** enforced via **Laravel Pint** (default preset).          |
| Strict types                  | `declare(strict_types=1);` at the top of **every** PHP file.       |
| Type declarations             | All method parameters, return types, and properties must be typed.  |
| Validation                    | **Always** in `FormRequest` classes. Never in controllers.          |
| Business logic                | In `Service` classes. Controllers are thin (validate → delegate → respond). |
| Database queries              | Eloquent by default. Raw queries only with a `// PERF:` comment justifying the decision. |
| No `dd()`, `dump()`, `ray()`  | Remove before commit. CI will fail on these.                        |

### 8.2 JavaScript / TypeScript / Vue

| Rule                          | Standard                                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| Language                      | **TypeScript** preferred. Plain JS acceptable only for config files.|
| Vue API                       | **Composition API** with `<script setup lang="ts">` exclusively.   |
| State management              | Props + Inertia shared data. Pinia only if cross-component state is genuinely needed. |
| Formatting                    | **Prettier** (default config, single quotes, trailing commas).      |
| Linting                       | **ESLint** with `@antfu/eslint-config` or equivalent strict config. |
| Naming                        | `PascalCase` for components, `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants. |
| No `console.log`              | Remove before commit. Use a logger utility if debugging output is needed. |
| Imports                       | Absolute paths via `@/` alias (maps to `resources/js/`).           |

### 8.3 General

- **No commented-out code** in committed files. Use version control history instead.
- **No TODO comments** without a linked GitHub Issue number: `// TODO(#42): implement pit stop logic`.
- **Test coverage:** All Service classes must have feature tests. Physics formulas must have unit tests.

---

## 9. Environment & Configuration

### 9.1 `.env.example` Additions

```env
# ── Game Configuration ──
GAME_MAX_PLAYERS_PER_ROOM=4
GAME_TICK_RATE=30

# ── Colyseus Integration ──
COLYSEUS_WS_URL=ws://localhost:2567
COLYSEUS_API_SECRET=your-shared-secret-here
COLYSEUS_API_URL=http://localhost:2567

# ── WebSocket Token ──
# Uses APP_KEY for encryption — ensure Colyseus server has access
# if using the shared-secret decryption strategy.
```

### 9.2 Config File

```php
// config/services.php — add to existing array:
'colyseus' => [
    'ws_url' => env('COLYSEUS_WS_URL', 'ws://localhost:2567'),
    'api_secret' => env('COLYSEUS_API_SECRET'),
    'api_url' => env('COLYSEUS_API_URL', 'http://localhost:2567'),
],
```

### 9.3 Deployment Considerations

| Concern            | Recommendation                                                                  |
| ------------------ | ------------------------------------------------------------------------------- |
| PHP server         | Nginx + PHP-FPM (or Laravel Octane with FrankenPHP for performance).            |
| Node.js server     | PM2 or systemd for Colyseus process management.                                 |
| Database           | Managed MySQL/PostgreSQL (e.g., PlanetScale, Neon, RDS, or self-hosted).        |
| SSL                | Required. Use Let's Encrypt. WebSocket must run over `wss://` in production.    |
| Static assets      | Serve via Nginx or CDN (Cloudflare, etc.). Vite build output in `public/build/`.|
| Redis (optional)   | For Laravel cache/session driver and potential Colyseus presence/matchmaker.     |

---

*End of Document — 02_Web_Architecture_and_API.md*
