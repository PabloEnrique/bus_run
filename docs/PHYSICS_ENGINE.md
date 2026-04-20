# Physics Engine — Technical Documentation

> Internal reference. Documents how the drivetrain simulation, torque curve
> processing, and cannon-es physics interact.

## Module Map

```
resources/js/GameEngine/
├── PhysicsWorld.js   — Cannon-es world, ground (Box/Heightfield), materials, RaycastVehicle
├── Drivetrain.js     — Direct-drive RPM, 5-point torque table, gears, fuel cut, auto-clutch
├── SceneManager.js   — Three.js rendering, camera, terrain, track visuals
├── AudioManager.js   — Synthetic diesel audio (sawtooth + lowpass)
├── NetworkManager.js — Colyseus.js client for multiplayer sync
└── maps/
    ├── index.js              — Map registry
    ├── city.js               — 200×200 m city grid
    ├── highway.js            — 800 m dual carriageway
    ├── circuit.js            — ~5 km oval racing circuit
    ├── flat-city.js          — ~1500 m large urban grid (100 blocks)
    └── mountain-highway.js   — 5.6 km highway with heightfield elevation
```

---

## 1. Torque Curve Processing

### 5-Point Anchor Interpolation

Each bus defines 5 anchor points that shape its engine torque curve:

| # | RPM Source | Torque Source |
|---|-----------|---------------|
| 1 | `0` | `0 Nm` |
| 2 | `idle_rpm` | `torque_idle_nm` |
| 3 | `peak_torque_rpm_low` | `engine_torque_nm` (peak) |
| 4 | `peak_torque_rpm_high` | `engine_torque_nm` (peak) |
| 5 | `redline_rpm` | `torque_redline_nm` |

At construction time, `buildTorqueTable()` generates a `Float64Array` with one
entry every **50 RPM** from 0 to redline. Values between anchors are linearly
interpolated.

```
Torque (Nm)
  ^
  |     ┌──────────┐  ← peak plateau (engine_torque_nm)
  |    /            \
  |   /              \
  |  /                \──── torque_redline_nm
  | / ← torque_idle_nm
  |/
  └────────────────────────→ RPM
  0  idle  peak_start  peak_end  redline
```

### Runtime Lookup

`torqueCurve(rpm)` performs sub-index interpolation on the precomputed table,
returning **actual Nm** (not a normalized 0–1 multiplier):

```javascript
const idx = rpm / 50;
const lo  = Math.floor(idx);
const t   = idx - lo;
return table[lo] * (1 - t) + table[lo + 1] * t;
```

---

## 2. Direct Drive Model

RPM is **rigidly coupled** to wheel rotation — no slip, no inertia blending:

```
RPM = (ω_wheel × R_gear × R_final × 60) / (2π)
```

- `ω_wheel` = rear wheel angular speed (rad/s) from cannon-es `deltaRotation`
- `R_gear`  = current gear ratio (e.g., 5.18 in 1st)
- `R_final` = final drive ratio (2.8)

### Automatic Clutch

When computed RPM < `idle_rpm`, the clutch disengages proportionally:

```
clutch = computedRPM / idle_rpm
```

The engine holds at idle RPM. This prevents stalling while keeping the
simulation physically grounded.

**Idle creep** (350 N) bypasses the clutch — it simulates torque converter
engagement at standstill.

### Gear Shift Clutch

On shift, a separate timer ramps clutch from 0 → 1 over `CLUTCH_ENGAGE_TIME`
(0.8s). During this ramp, engine force is proportionally reduced.

---

## 3. Engine Force

```
F_engine = T(rpm) × θ³ × R_gear × R_final / r_wheel × C_clutch
```

Where:
- `T(rpm)` = torque from interpolated table (Nm)
- `θ³`     = cubic throttle input (diesel-feel low-end control)
- `r_wheel`= 0.35 m (tyre rolling radius)
- `C_clutch`= clutch engagement factor (0–1)

---

## 4. Fuel Cut Limiter

When RPM reaches `redline_rpm`, engine force drops to **0 N** (fuel injection cut).
Power resumes when RPM falls below `redline_rpm - 100`. This creates the
characteristic limiter bounce at high RPM.

---

## 5. Aerodynamic Drag & Rolling Resistance

```
F_drag = 0.5 × ρ × Cd × A × v²
F_roll = Crr × m × g
```

- `ρ = 1.225` kg/m³, `Crr = 0.008`, `A = width × height × 0.35`
- Drag is applied as a **post-step velocity reduction** to avoid sub-step
  accumulation issues in cannon-es.

---

## 6. Per-Bus Specs Table

| Bus | Peak Torque | Idle / Redline | Power Band | Redline |
|-----|------------|----------------|------------|---------|
| Rosa 2nd Gen (BE4) | 290 Nm | 180 / 150 Nm | 1600–2000 | 3200 |
| Rosa 3rd Gen (BE6) | 420 Nm | 250 / 200 Nm | 1500–2200 | 3200 |
| Rosa 4th Gen (BE7) | 530 Nm | 300 / 250 Nm | 1400–2200 | 3200 |
| Coaster 2nd Gen (B20) | 240 Nm | 150 / 120 Nm | 1800–2200 | 3400 |
| Coaster 3rd Gen (B40/50) | 390 Nm | 220 / 180 Nm | 1600–2000 | 3200 |
| Coaster 4th Gen (B60/70) | 450 Nm | 260 / 200 Nm | 1400–1800 | 3000 |
| Volare A-Series | 430 Nm | 230 / 190 Nm | 1500–1900 | 3000 |
| Volare W-Series | 600 Nm | 350 / 280 Nm | 1300–1700 | 2800 |
| Volare Fly/V-Series | 700 Nm | 400 / 320 Nm | 1200–1600 | 2800 |

---

## 7. Physics World

- **Ground**: `CANNON.Box` (flat maps) or `CANNON.Heightfield` (elevation maps)
- **Broadphase**: `SAPBroadphase`
- **Vehicle**: `CANNON.RaycastVehicle` with 4 wheels
- **Collision groups**: GROUND (1), WALL (2), VEHICLE (4)
- **Hard floor guarantee**: Post-step check keeps wheel connection points above ground
- **Sub-steps**: 5 per frame (fixed 1/60s timestep)

### Materials & Contact Pairs

| A | B | Friction | Restitution |
|---|---|----------|-------------|
| track | tire | 0.6 | 0.05 |
| tire | wall | 0.2 | 0.3 |
| chassis | track | 0.01 | 0.0 |
| chassis | wall | 0.1 | 0.3 |

---

## 8. Maps

| Map | Size | Type | Features |
|-----|------|------|----------|
| Ciudad | 200×200 m | Flat | City grid, 16 buildings, intersections |
| Autopista | 800 m | Flat | Dual carriageway, median, guardrails |
| Circuito Oval | ~5 km | Flat | Oval track, grandstands, pit lane |
| Metrópoli | ~1500×1500 m | Flat | 100 city blocks, 80+ buildings |
| Autopista de Montaña | 5.6 km | Heightfield | Sinusoidal hills ±15m, guardrails on terrain |

---

## 9. Testing

Tests in `tests/js/`, run via `npx vitest run`.

| File | Tests | Covers |
|------|-------|--------|
| `physics-math.test.js` | 27 | Torque table interpolation, Nm lookup, rigid RPM, force calc, drag, per-bus powerband |
| `drivetrain.test.js` | 30 | Constructor, direct drive RPM, auto-clutch, fuel cut, shifts, idle creep, throttle, fuel |
