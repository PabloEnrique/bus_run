# 01 — Game Design Document: Hot Bus Drive

| Field            | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| **Project**      | Hot Bus Drive                                                |
| **Genre**        | Multiplayer Arcade-Simulation Racing                         |
| **Platform**     | Web (HTML5 — WebGL 2.0 / WebAssembly)                       |
| **Players**      | 1 – 4 per session (online, real-time)                        |
| **Engine Options** | Three.js + Rapier (recommended) **or** Godot 4 HTML5 export |
| **Revision**     | 1.0.0                                                        |
| **Date**         | 2026-04-18                                                   |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Game Loop](#2-core-game-loop)
3. [Vehicle Physics Model](#3-vehicle-physics-model)
4. [Fuel System](#4-fuel-system)
5. [Maps & Tracks](#5-maps--tracks)
6. [Vehicle Roster & Specifications](#6-vehicle-roster--specifications)
7. [Progression & Economy](#7-progression--economy)
8. [UI/UX Flow](#8-uiux-flow)
9. [Engine Selection: Three.js vs Godot HTML5](#9-engine-selection-threejs-vs-godot-html5)
10. [Glossary](#10-glossary)

---

## 1. Executive Summary

**Hot Bus Drive** is a multiplayer web-based racing game where players compete driving *guaguas* (buses) across varied circuits. The game bridges **arcade accessibility** with **simulation-grade vehicle dynamics**: a physically-modelled drivetrain, tire grip, aerodynamic drag, suspension, weight transfer, and dynamic fuel consumption provide depth, while forgiving default tuning and intuitive controls keep the barrier to entry low.

Races are 4-player sessions coordinated by a Colyseus real-time server (see `03_RealTime_Networking.md`). The web portal — built on Laravel, Vue 3, and InertiaJS (see `02_Web_Architecture_and_API.md`) — handles registration, the player garage, matchmaking lobby, and post-race statistics.

---

## 2. Core Game Loop

### 2.1 High-Level Flow

```
Register / Login
       │
       ▼
   Dashboard
       │
       ▼
    Garage ──────── Purchase / Select Vehicle
       │
       ▼
  Matchmaking Lobby ── Vote Map ── Wait for Players (2–4)
       │
       ▼
    Countdown (3 … 2 … 1 … GO)
       │
       ▼
     Race ──────── Drive ── Manage Fuel ── Pass Checkpoints
       │
       ▼
  Finish / DNF
       │
       ▼
  Post-Race Results ── XP + Currency Awarded
       │
       ▼
   Dashboard (loop)
```

### 2.2 Pre-Race Phase

| Step              | Description                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Vehicle Selection | Player picks a bus from their garage. Each bus has distinct specs (§6).                          |
| Tuning (v2)       | *Future phase.* Adjust suspension stiffness, gear ratios, tire compound.                         |
| Map Vote          | Each player in the lobby casts one vote. The map with the most votes is selected; ties broken randomly. |
| Ready Check       | All players must confirm "Ready". A 30-second auto-ready timer prevents stalling.                |

### 2.3 In-Race Phase

- **Objective:** Complete the required number of laps in the shortest time.
- **Checkpoints:** Each track defines ordered checkpoints. A lap is valid only when all checkpoints are passed in sequence.
- **Fuel Management:** Players must balance throttle aggression with fuel consumption. Running out of fuel immobilises the bus (DNF).
- **Collisions:** Bus-to-bus contact applies impulse forces. No damage model in v1; cosmetic sparks only.
- **Pit Stop (optional per map):** A designated zone where the bus refuels at a fixed rate while stationary. Available only on tracks flagged `hasPitStop: true`.

### 2.4 Post-Race Phase

| Placement | XP Reward | Currency Reward |
| --------- | --------- | --------------- |
| 1st       | 100 XP    | 50 coins        |
| 2nd       | 70 XP     | 35 coins        |
| 3rd       | 50 XP     | 25 coins        |
| 4th       | 30 XP     | 15 coins        |
| DNF       | 10 XP     | 5 coins         |

Completion bonus: +20 XP for finishing regardless of position.

---

## 3. Vehicle Physics Model

> **Authority:** The server runs the authoritative physics simulation at **30 Hz** (Δt = 33.33 ms). The client runs a predictive copy for local responsiveness. Both MUST use identical formulas and constants. See `03_RealTime_Networking.md` §4–5 for synchronisation details.

All formulas use **SI units** (meters, kilograms, seconds, newtons, radians) unless stated otherwise.

### 3.1 Engine & Drivetrain

#### 3.1.1 Torque Curve

Each vehicle defines a **torque curve** as an array of `(RPM, Torque_Nm)` sample points. Between samples, torque is obtained via **linear interpolation**:

```
T_engine(RPM) = lerp(T[i], T[i+1], (RPM - RPM[i]) / (RPM[i+1] - RPM[i]))
```

The engine has a configurable **idle RPM** (`RPM_idle`, typically 700) and **redline RPM** (`RPM_max`, typically 2800 for a diesel bus engine). A soft rev limiter cuts fuel injection above `RPM_max`.

#### 3.1.2 Wheel Force

The torque delivered by the engine is multiplied through the **gearbox** and **final drive**, then converted to force at the wheel contact patch:

```
F_wheel = (T_engine × G_current × G_final × η) / r_wheel
```

| Symbol        | Description                           | Typical Bus Value      |
| ------------- | ------------------------------------- | ---------------------- |
| `T_engine`    | Engine torque at current RPM (N·m)    | 800 – 1200             |
| `G_current`   | Current gear ratio (dimensionless)    | See §6 gear_ratios     |
| `G_final`     | Final drive (differential) ratio      | 3.5 – 4.5             |
| `η`           | Drivetrain efficiency (dimensionless) | 0.85 – 0.92           |
| `r_wheel`     | Wheel radius (m)                      | 0.50 – 0.55           |
| `F_wheel`     | Longitudinal force at contact patch (N) | —                    |

#### 3.1.3 Gear Shifting

The game supports **automatic transmission** by default:

- **Upshift** when `RPM > RPM_upshift` (typically 85% of `RPM_max`).
- **Downshift** when `RPM < RPM_downshift` (typically 35% of `RPM_max`).
- A **shift delay** of 400 ms is enforced during which no torque is delivered (`T_engine = 0`).

RPM is derived from vehicle speed and current gear:

```
RPM = (v × G_current × G_final) / (2π × r_wheel) × 60
```

Where `v` is longitudinal velocity in m/s.

### 3.2 Tire Model (Simplified Pacejka — Magic Formula)

The tire model governs how much lateral and longitudinal force the tire can produce for a given slip condition. We use a **simplified Pacejka "Magic Formula"** with four coefficients:

#### 3.2.1 Lateral Force (Cornering)

```
F_lateral = D × sin(C × arctan(B × α − E × (B × α − arctan(B × α))))
```

| Coefficient | Name       | Typical Value | Description                            |
| ----------- | ---------- | ------------- | -------------------------------------- |
| `B`         | Stiffness  | 10 – 15       | Controls initial slope (grip build-up) |
| `C`         | Shape      | 1.3 – 1.7     | Controls curve shape                   |
| `D`         | Peak       | `μ × F_z`     | Maximum force (depends on normal load) |
| `E`         | Curvature  | −1 – 1        | Controls peak location and drop-off    |

Where:
- `α` = **slip angle** (radians): angle between the tire's heading and its velocity vector.
- `μ` = tire friction coefficient (0.8 – 1.0 for dry asphalt; 0.4 – 0.6 for wet).
- `F_z` = normal force on that tire (N), determined by static weight distribution + dynamic weight transfer (§3.5).

#### 3.2.2 Longitudinal Force (Traction / Braking)

The same Magic Formula structure applies to the **longitudinal slip ratio** `σ`:

```
σ = (ω × r_wheel − v_x) / max(|v_x|, ε)
```

Where:
- `ω` = wheel angular velocity (rad/s)
- `v_x` = longitudinal velocity of the wheel contact patch (m/s)
- `ε` = small constant (0.5) to avoid division by zero at standstill

```
F_longitudinal = D_long × sin(C_long × arctan(B_long × σ − E_long × (B_long × σ − arctan(B_long × σ))))
```

#### 3.2.3 Combined Slip (Friction Circle)

When the tire experiences simultaneous lateral and longitudinal slip, forces are limited by a **friction circle** (or ellipse):

```
F_total = sqrt(F_lateral² + F_longitudinal²)
if F_total > D:
    scale = D / F_total
    F_lateral *= scale
    F_longitudinal *= scale
```

This prevents the tire from producing physically impossible forces under combined braking-and-cornering scenarios.

### 3.3 Aerodynamic Drag

```
F_drag = 0.5 × C_d × A × ρ × v²
```

| Symbol | Description                | Typical Bus Value        |
| ------ | -------------------------- | ------------------------ |
| `C_d`  | Drag coefficient           | 0.60 – 0.75             |
| `A`    | Frontal area (m²)          | 7.0 – 8.5               |
| `ρ`    | Air density (kg/m³)        | 1.225 (sea level, 15 °C) |
| `v`    | Vehicle speed (m/s)        | —                        |

Drag force acts **opposite** to the velocity vector.

### 3.4 Rolling Resistance

```
F_rr = C_r × m × g
```

| Symbol | Description                         | Typical Value |
| ------ | ----------------------------------- | ------------- |
| `C_r`  | Rolling resistance coefficient      | 0.012 – 0.020 |
| `m`    | Total vehicle mass (kg)             | 12 000 – 18 000 |
| `g`    | Gravitational acceleration (m/s²)   | 9.81          |

Rolling resistance acts **opposite** to the velocity vector and is independent of speed in this simplified model. On different terrain surfaces, `C_r` may be overridden per track segment (e.g., gravel zones with `C_r = 0.035`).

### 3.5 Weight Transfer

Weight transfer changes the **normal force** (`F_z`) on each axle (and consequently each tire), directly affecting maximum grip via the Pacejka `D` parameter.

#### 3.5.1 Longitudinal Weight Transfer (Acceleration / Braking)

```
ΔF_z_long = (m × a_x × h_cg) / L
```

| Symbol   | Description                          |
| -------- | ------------------------------------ |
| `a_x`    | Longitudinal acceleration (m/s²)     |
| `h_cg`   | Centre-of-gravity height (m)         |
| `L`      | Wheelbase (m)                        |

- Under **acceleration**, load transfers to the **rear** axle → rear grip increases, front decreases.
- Under **braking**, load transfers to the **front** axle.

Front axle normal force:
```
F_z_front = (m × g × l_rear / L) − ΔF_z_long
```

Rear axle normal force:
```
F_z_rear  = (m × g × l_front / L) + ΔF_z_long
```

Where `l_front` and `l_rear` are the distances from CG to front and rear axles respectively, and `l_front + l_rear = L`.

#### 3.5.2 Lateral Weight Transfer (Cornering)

```
ΔF_z_lat = (m × a_y × h_cg) / t
```

| Symbol | Description                   |
| ------ | ----------------------------- |
| `a_y`  | Lateral acceleration (m/s²)   |
| `t`    | Track width (m)               |

This shifts load from the **inner** wheels to the **outer** wheels during a turn.

### 3.6 Suspension (Spring-Damper Model)

Each wheel has an independent **spring-damper** unit:

```
F_suspension = −K × x − C_damp × ẋ
```

| Symbol    | Description                        | Typical Bus Value   |
| --------- | ---------------------------------- | ------------------- |
| `K`       | Spring stiffness (N/m)             | 80 000 – 150 000   |
| `C_damp`  | Damping coefficient (N·s/m)        | 8 000 – 20 000     |
| `x`       | Spring compression (m), 0 = rest   | −0.10 … +0.10      |
| `ẋ`       | Compression velocity (m/s)         | —                   |

The suspension force determines the **instantaneous normal force** on each tire:

```
F_z_tire = F_z_static + F_suspension + ΔF_z_long_per_tire + ΔF_z_lat_per_tire
```

Clamped to `F_z_tire ≥ 0` (tire cannot pull the road).

### 3.7 Centre-of-Gravity Shift

The CG height (`h_cg`) is **not constant**. It varies with:

1. **Fuel level:** A full tank (positioned low and rear-centre) lowers the CG slightly. As fuel depletes, the effect diminishes.
   ```
   h_cg_effective = h_cg_empty + (fuel_fraction × Δh_cg_fuel)
   ```
   Where `fuel_fraction = current_fuel / max_fuel` and `Δh_cg_fuel` is a small negative offset (e.g., −0.02 m).

2. **Passengers (optional, v2):** If the passenger mechanic is enabled, seated passengers raise the CG. Modelled as a discrete mass added at a configurable height.

### 3.8 Integration Method

The physics loop uses **Semi-Implicit Euler** integration for stability at the 30 Hz tick rate:

```
velocity += (F_net / m) × Δt
position += velocity × Δt
```

Where `F_net = F_wheel − F_drag − F_rr ± F_lateral ± F_gravity_component` (projected along the vehicle's longitudinal and lateral axes, plus any slope component from the track surface normal).

Angular integration follows the same pattern for yaw rate based on lateral tire forces and their moment arms.

---

## 4. Fuel System

### 4.1 Consumption Model (BSFC)

Fuel consumption is computed per physics tick using the **Brake-Specific Fuel Consumption** method:

```
P_brake = (T_engine × RPM) / 9549        [kW]
ṁ_fuel  = BSFC(RPM, load) × P_brake      [g/h]
fuel_consumed_per_tick = ṁ_fuel × (Δt / 3600) / ρ_fuel   [litres]
```

| Symbol       | Description                             | Unit    |
| ------------ | --------------------------------------- | ------- |
| `P_brake`    | Brake power output                      | kW      |
| `BSFC`       | Brake-specific fuel consumption         | g/(kW·h)|
| `ṁ_fuel`     | Fuel mass flow rate                     | g/h     |
| `Δt`         | Tick duration (0.03333 s)               | s       |
| `ρ_fuel`     | Diesel fuel density (~0.832 kg/l)       | kg/l    |

`BSFC(RPM, load)` is a **2D lookup table** stored per vehicle in `bsfc_map_json` (see `02_Web_Architecture_and_API.md` §3). Values range from 200 g/(kW·h) at peak efficiency to 400+ g/(kW·h) at low RPM / high load.

`load` is defined as:
```
load = T_engine / T_max_at_current_RPM
```

Clamped to [0, 1].

### 4.2 Fuel Tank & Race Balance

| Parameter        | Design Target                                                                 |
| ---------------- | ----------------------------------------------------------------------------- |
| Tank capacity    | Vehicle-specific (see §6); typically 150 – 300 litres for a bus.              |
| Starting fuel    | 100% of tank capacity at race start.                                          |
| Race distance    | Tuned so that aggressive driving consumes ~80–95% of the tank. Conservative driving should finish with ≥10% remaining. |
| Design rule      | `tank_capacity ≥ 1.1 × estimated_aggressive_consumption` per track.           |

### 4.3 Low-Fuel Penalty

When `fuel_fraction < 0.10`:

```
T_engine_effective = T_engine × (0.5 + 0.5 × (fuel_fraction / 0.10))
```

This linearly reduces available torque to 50% at fuel_fraction = 0, simulating fuel starvation / air ingestion.

### 4.4 Pit Stop Mechanic

On tracks with `hasPitStop: true`:
- A **pit zone** is defined by a bounding box on the track.
- When the bus is inside the zone AND velocity < 2 m/s, refuelling begins.
- Refuel rate: **40 litres/second** (configurable per track).
- The bus cannot move during refuelling (brakes are locked).
- Refuelling stops when the tank is full or the player releases the brake key.

---

## 5. Maps & Tracks

### 5.1 Track Archetypes

| Archetype       | Description                                                       | Laps | Pit Stop | Est. Lap Time |
| --------------- | ----------------------------------------------------------------- | ---- | -------- | -------------- |
| **Urban Circuit** | Tight turns through city streets, traffic cones, narrow lanes.  | 3    | No       | 90 – 120 s     |
| **Highway Loop**  | Long straights with sweeping curves, high-speed focus.          | 2    | Yes      | 120 – 150 s    |
| **Mountain Road** | Elevation changes, hairpin turns, guardrails, cliffside drops.  | 2    | No       | 150 – 180 s    |

### 5.2 Track Data Schema

Each track is stored as a JSON object in the `tracks.track_data_json` column (see `02_Web_Architecture_and_API.md` §3):

```jsonc
{
  "version": 1,
  "spawnPositions": [
    { "x": 0, "y": 0, "z": 0, "heading": 0 },
    { "x": 2.5, "y": 0, "z": -3, "heading": 0 },
    { "x": 0, "y": 0, "z": -6, "heading": 0 },
    { "x": 2.5, "y": 0, "z": -9, "heading": 0 }
  ],
  "checkpoints": [
    { "id": 0, "x": 50, "z": 0, "radius": 10 },
    { "id": 1, "x": 100, "z": 50, "radius": 12 }
    // ... ordered sequence
  ],
  "pitZone": {                          // null if hasPitStop = false
    "min": { "x": 20, "z": -5 },
    "max": { "x": 30, "z": 5 },
    "refuelRate": 40
  },
  "terrainSegments": [
    { "from": 0, "to": 500, "surface": "asphalt", "Cr": 0.015 },
    { "from": 500, "to": 550, "surface": "gravel", "Cr": 0.035 }
  ],
  "meshFile": "tracks/urban_circuit.glb"  // 3D model reference
}
```

### 5.3 Checkpoint Validation

- Checkpoints are **spherical triggers** (centre + radius).
- Players must pass checkpoints in **ascending `id` order**.
- A lap is completed when checkpoint `id = 0` is crossed again after all others.
- The server validates checkpoint progression and rejects any lap that skips a checkpoint (see `03_RealTime_Networking.md` §7).

---

## 6. Vehicle Roster & Specifications

### 6.1 Reference Vehicles

The following table defines the **launch roster** (v1). All values feed directly into the physics formulas of §3 and must be stored in the `vehicle_specs` database table (see `02_Web_Architecture_and_API.md` §3).

| Spec                  | Guagua Clásica        | Metrobús Express      | Autobús Turbo         |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `slug`                | `guagua-clasica`      | `metrobus-express`    | `autobus-turbo`       |
| `manufacturer`        | Leyland                | Mercedes-Benz         | Volvo                 |
| `year`                | 1978                   | 2010                  | 2022                  |
| `base_price`          | 0 (starter)            | 500 coins             | 1 200 coins           |
| `max_hp`              | 150                    | 280                   | 380                   |
| `max_torque_nm`       | 550                    | 1 000                 | 1 400                 |
| `weight_kg`           | 12 000                 | 14 500                | 16 000                |
| `cd`                  | 0.75                   | 0.65                  | 0.60                  |
| `frontal_area_m2`     | 7.2                    | 7.8                   | 8.0                   |
| `wheelbase_m`         | 5.0                    | 6.0                   | 6.5                   |
| `track_width_m`       | 2.1                    | 2.3                   | 2.5                   |
| `wheel_radius_m`      | 0.50                   | 0.52                  | 0.55                  |
| `gear_ratios`         | [3.6, 2.1, 1.4, 1.0]  | [3.4, 2.0, 1.3, 0.9, 0.7] | [3.2, 1.9, 1.3, 0.9, 0.7, 0.6] |
| `final_drive_ratio`   | 4.1                    | 3.8                   | 3.5                   |
| `fuel_tank_liters`    | 200                    | 250                   | 300                   |
| `suspension_k`        | 90 000                 | 120 000               | 140 000               |
| `suspension_c`        | 10 000                 | 14 000                | 18 000                |
| `cg_height_m`         | 1.30                   | 1.20                  | 1.15                  |
| **Character**         | Light, sluggish, classic feel | Balanced all-rounder | Heavy, powerful, stable |

### 6.2 Torque Curve & BSFC Map Format

Stored as JSON arrays/objects in `vehicle_specs`:

**`torque_curve_json`** — Array of `[RPM, Torque_Nm]` pairs:
```json
[[700, 350], [1000, 480], [1400, 550], [1800, 520], [2200, 460], [2600, 400], [2800, 380]]
```

**`bsfc_map_json`** — 2D lookup: outer key = RPM bucket, inner key = load bucket (0.0 – 1.0), value = BSFC in g/(kW·h):
```json
{
  "800":  { "0.2": 380, "0.4": 320, "0.6": 280, "0.8": 260, "1.0": 300 },
  "1200": { "0.2": 350, "0.4": 290, "0.6": 240, "0.8": 220, "1.0": 260 },
  "1600": { "0.2": 340, "0.4": 280, "0.6": 230, "0.8": 210, "1.0": 250 },
  "2000": { "0.2": 360, "0.4": 300, "0.6": 250, "0.8": 235, "1.0": 280 },
  "2400": { "0.2": 390, "0.4": 330, "0.6": 280, "0.8": 260, "1.0": 310 }
}
```

Intermediate values are obtained via **bilinear interpolation** over the two nearest RPM and load buckets.

---

## 7. Progression & Economy

### 7.1 Experience Points (XP)

| Source             | Amount  |
| ------------------ | ------- |
| Race completion    | +20 XP  |
| 1st place          | +100 XP |
| 2nd place          | +70 XP  |
| 3rd place          | +50 XP  |
| 4th place          | +30 XP  |
| DNF                | +10 XP  |

XP accumulates on the player's profile. Level thresholds follow a quadratic curve:
```
XP_for_level(n) = 100 × n²
```

Levels unlock cosmetic titles displayed next to the player's name in lobbies.

### 7.2 Currency (Coins)

Earned per race (see §2.4). Spent on:

| Item              | Cost Range      |
| ----------------- | --------------- |
| New vehicle       | 500 – 2 000     |
| Paint colour      | 50 – 200        |
| Livery (cosmetic) | 150 – 500       |

**Design principle:** No purchasable gameplay advantage. All vehicles are balanced to be competitive; more expensive buses trade raw power for handling or vice-versa.

### 7.3 Garage

- Each player starts with one free bus (`guagua-clasica`).
- Additional buses are purchased from the in-game shop using coins.
- The garage displays all owned vehicles with their stats, paint, and race history.

---

## 8. UI/UX Flow

### 8.1 Screen Map

```
┌─────────────┐
│  Login /     │
│  Register    │
└──────┬───────┘
       │
┌──────▼───────┐
│  Dashboard   │── Recent Races, Level, Coins
└──────┬───────┘
       │
┌──────▼───────┐     ┌──────────────┐
│   Garage     │────▶│  Shop        │
│  (My Buses)  │◀────│  (Buy Buses) │
└──────┬───────┘     └──────────────┘
       │
┌──────▼───────┐
│   Lobby      │── Create / Join Room ── Map Vote ── Ready Check
└──────┬───────┘
       │
┌──────▼───────┐
│   Race HUD   │── Speedometer, RPM, Fuel Gauge, Minimap, Lap Counter, Positions
└──────┬───────┘
       │
┌──────▼───────┐
│  Results     │── Placements, Times, XP/Coins Earned
└──────┬───────┘
       │
       ▼
  (Back to Dashboard)
```

### 8.2 Race HUD Elements

| Element          | Position       | Description                                               |
| ---------------- | -------------- | --------------------------------------------------------- |
| Speedometer      | Bottom-centre  | Digital readout in km/h.                                  |
| Tachometer       | Bottom-centre  | RPM bar with redline indicator.                           |
| Gear Indicator   | Bottom-centre  | Current gear number (1–6 or R).                           |
| Fuel Gauge       | Bottom-right   | Bar that depletes; flashes red below 10%.                 |
| Minimap          | Top-right      | Overhead view of track with player dots.                  |
| Lap Counter      | Top-centre     | "Lap 2 / 3".                                             |
| Position         | Top-left       | "P2 / 4" with player names.                              |
| Countdown        | Centre         | Full-screen "3… 2… 1… GO!" overlay.                      |

---

## 9. Engine Selection: Three.js vs Godot HTML5

| Criterion              | Three.js + Rapier                          | Godot 4 HTML5                                |
| ---------------------- | ------------------------------------------ | -------------------------------------------- |
| **Bundle size**        | ~500 KB – 2 MB (modular)                   | 40 – 60 MB (full engine)                     |
| **Initial load time**  | 1 – 3 s                                    | 10 – 15 s (WASM compilation)                 |
| **Mobile support**     | Excellent (all modern browsers)             | Good (iOS 14.4+, Android Chrome)             |
| **Physics options**    | Rapier (Rust/WASM), Cannon.js, Ammo.js      | Built-in Godot Physics 3D                    |
| **JS ↔ Engine bridge** | Native — zero overhead                      | JavaScriptBridge — marshalling overhead       |
| **Physics fidelity**   | Full control (custom tire model in JS)       | Possible but requires GDScript → JS bridge   |
| **Rendering**          | WebGL 2.0 / WebGPU; highly optimised        | WebGL 2.0; good but less web-optimised       |
| **Rapid prototyping**  | Slower (code-driven)                        | Faster (visual editor, scene tree)           |
| **Recommended for**    | Production racing game with realistic physics | Prototype / visual-heavy game with simpler physics |

**Recommendation:** Three.js + Rapier is the superior choice for a 4-player racing game demanding realistic vehicle dynamics, faster load times, and smaller bundles. Godot remains a viable alternative if the team prioritises rapid visual prototyping and accepts the trade-offs.

---

## 10. Glossary

| Term              | Definition                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Guagua**        | Colloquial term for "bus" in the Caribbean (Dominican Republic, Cuba, Canary Islands).     |
| **BSFC**          | Brake-Specific Fuel Consumption — grams of fuel per kilowatt-hour of engine output.        |
| **Pacejka**       | Hans Pacejka's "Magic Formula" — an empirical model for tire force vs. slip.               |
| **CG**            | Centre of Gravity — the point where the vehicle's mass is effectively concentrated.        |
| **DNF**           | Did Not Finish — a race result when a player cannot complete all laps.                     |
| **Semi-Implicit Euler** | An integration method that updates velocity first, then uses the new velocity to update position. More stable than explicit Euler. |
| **Slip Angle (α)** | The angle between a tire's heading direction and its actual velocity direction.            |
| **Slip Ratio (σ)** | The ratio of the difference between wheel spin speed and ground speed to the ground speed. |
| **Δt**            | Physics tick duration: 1/30 s ≈ 33.33 ms.                                                 |

---

*End of Document — 01_Game_Design_Document.md*
