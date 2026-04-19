# Physics Engine — Architecture & Logic

> Internal reference for future sprints. Documents how the Cannon-es physics,
> drivetrain simulation, and RaycastVehicle interact.

## Module Map

```
resources/js/GameEngine/
├── PhysicsWorld.js   — Cannon-es world, track, materials, RaycastVehicle
├── Drivetrain.js     — Engine RPM (with inertia), torque curve, gears, fuel
├── SceneManager.js   — Three.js rendering, camera, track visuals
└── NetworkManager.js — Colyseus.js client for multiplayer sync
```

## PhysicsWorld.js — Cannon-es

### Materials & Contact Pairs

Three materials govern surface interactions:

| Material         | Used on                  | Purpose                          |
|------------------|--------------------------|----------------------------------|
| `trackMaterial`  | Ground segments, infield | Asphalt surface                  |
| `tireMaterial`   | (reserved for wheels)    | Tyre contact (raycast wheels use `frictionSlip`) |
| `chassisMaterial`| Chassis body             | Near-zero ground friction — prevents scraping block |
| `wallMaterial`   | Inner + outer barriers   | Wall barriers                    |

Contact material pairs:

| A                | B                | Friction | Restitution | Notes                        |
|------------------|------------------|----------|-------------|------------------------------|
| `trackMaterial`  | `tireMaterial`   | 0.6      | 0.05        | Good traction, minimal bounce|
| `tireMaterial`   | `wallMaterial`   | 0.2      | 0.3         | Slippery bounce off walls    |
| `chassisMaterial`| `trackMaterial`  | 0.01     | 0.0         | Chassis scrape doesn't block |
| `chassisMaterial`| `wallMaterial`   | 0.1      | 0.3         | Chassis-wall bounce          |

**Bug fixed (Sprint 8):** Duplicate `ContactMaterial(tireMaterial, wallMaterial)` removed.

**Bug fixed (Sprint 8.2):** Chassis was using `tireMaterial` (friction 0.6 vs ground),
so when the chassis bottomed out it created ~20 kN of friction blocking all movement.
Now uses `chassisMaterial` (friction 0.01 vs ground).

### RaycastVehicle

- **Chassis:** `CANNON.Box(1.0, 0.5, 2.0)` — half-extents in metres
- **Mass:** from `busSpecs.base_weight_kg` (typically 3500–5500 kg)
- **Angular damping:** 0.4 — prevents unrealistic spinning
- **Linear damping:** 0.05 — subtle rolling resistance
- **Axis configuration:** Right = X (0), Up = Y (1), Forward = Z (2)
- **Spawn position:** South straight center, Y = 2.0 (drops onto springs)

### Suspension Geometry (Sprint 8.2 fix)

**Problem:** Suspension stiffness was `spec × 100 ≈ 70 N/m` — 500× too weak to hold
a 3500 kg bus. Connection point Y = 0 (chassis center) instead of below bottom.
Result: chassis free-fell onto ground, all weight on box collision, zero wheel normal
force, engine force through frictionSlip ≈ 0.

**Fix:** Stiffness = `mass × 16` (≈ 56,000 N/m for 3500 kg, targeting 0.15 m static sag).
Connection point Y = -0.65 (below chassis bottom at -0.5).

| Parameter               | Before | After | Unit  |
|--------------------------|--------|-------|-------|
| `suspensionStiffness`    | 70     | 56000 | N/m   |
| `suspensionRestLength`   | 0.3    | 0.6   | m     |
| `maxSuspensionTravel`    | 0.3    | 0.5   | m     |
| `dampingRelaxation`      | 3.0    | 5.0   | —     |
| `dampingCompression`     | 4.0    | 4.5   | —     |
| `maxSuspensionForce`     | mass×15| mass×20| N    |
| Connection point Y       | 0      | -0.65 | m     |
| Chassis material         | tire   | chassis| —    |
| Spawn Y                  | 1.5    | 2.0   | m     |

### Wheel Configuration

| Wheels | frictionSlip | Effect                            |
|--------|-------------|-----------------------------------|
| Front  | 1.8         | Break traction sooner → **understeer** |
| Rear   | 3.0         | Hold traction → stable rear axle  |

This split ensures the front axle loses grip before the rear at high speeds,
producing natural understeer appropriate for a heavy bus.

### Track Layout

Rectangular loop: 160×100 m outer, 120×60 m inner, 20 m lane width.

```
  ┌──────── N straight (160 m) ────────┐
  │  ┌──────────────────────────────┐  │
  W  │        Infield (grass)       │  E
  │  └──────────────────────────────┘  │
  └──────── S straight (160 m) ────────┘

  Spawn: South straight center (0, 1.5, -40)
  Track width: 20 m
  Wall height: 2 m, thickness: 0.5 m
```

Ground: thin `CANNON.Box` slabs (half-thickness 0.1 m) at y = -0.1.
Fallback plane at y = -2 catches any vehicle that falls off-track.

---

## Drivetrain.js — Engine Simulation

### Constants

| Constant             | Value   | Unit   | Description                          |
|----------------------|---------|--------|--------------------------------------|
| `IDLE_RPM`           | 800     | RPM    | Engine idle speed                    |
| `REDLINE_RPM`        | 3200    | RPM    | Rev limiter                          |
| `PEAK_TORQUE_RPM_LOW`| 1800   | RPM    | Start of peak torque plateau         |
| `PEAK_TORQUE_RPM_HIGH`| 2500  | RPM    | End of peak torque plateau           |
| `FINAL_DRIVE_RATIO`  | 4.1     | —      | Differential ratio                   |
| `WHEEL_RADIUS`       | 0.35    | m      | Tyre rolling radius                  |
| `ENGINE_INERTIA`     | 5.0     | s⁻¹    | RPM smoothing rate                   |
| `FUEL_RATE_BASE`     | 0.00008 | L/s/lu | Base fuel burn per load unit         |

### Diesel Torque Curve

Normalised multiplier (0.3 – 1.0) applied to `peakTorque`:

```
 1.0 ┤         ┌────────┐
     │        /          \
 0.4 ├───────/            \
 0.3 ├                     ──── (redline)
     └──┬───┬──┬────────┬──┬──
       800 1800       2500 3200  RPM
```

- **Idle (≤ 800):** 0.4
- **Ramp (800–1800):** linear 0.4 → 1.0
- **Peak plateau (1800–2500):** 1.0
- **Taper (2500–3200):** linear 1.0 → 0.3
- **Redline (≥ 3200):** 0.3

### RPM Inertia Model (Sprint 8 fix)

**Problem:** RPM was computed directly from wheel angular speed. At standstill
(`wheelSpeed = 0`), RPM was always `IDLE_RPM = 800`, producing only 40% of peak
torque. The bus could never generate strong launch force.

**Solution:** RPM now lerps toward a target that accounts for throttle input:

```
wheelRPM        = computeRPM(wheelSpeed)
throttleTarget  = IDLE_RPM + throttle × (REDLINE_RPM − IDLE_RPM) × 0.75
targetRPM       = max(wheelRPM, throttleTarget)
rpm            += (targetRPM − rpm) × min(1, ENGINE_INERTIA × dt)
```

- At standstill with full throttle: `throttleTarget ≈ 2600 RPM` → engine revs up
  producing ~85% torque at peak
- As bus accelerates: `wheelRPM` rises and eventually dominates the max()
- When throttle is released: `throttleTarget = IDLE`, RPM decays smoothly toward idle
- `ENGINE_INERTIA = 5.0` → RPM reaches 95% of target in ≈ 0.6 seconds

### Force Formula

```
torqueMultiplier = torqueCurve(rpm)              // 0.3–1.0
wheelTorque      = peakTorque × multiplier × throttle × |gearRatio| × finalDrive
engineForce      = wheelTorque / wheelRadius     // Newtons
```

Applied to rear wheels (indices 2, 3) via `vehicle.applyEngineForce()`.

### Fuel Consumption

```
load        = (rpm / REDLINE_RPM) × throttle     // 0..1
consumption = FUEL_RATE_BASE × load × peakTorque × dt
```

Higher RPM + more throttle = more fuel burned. Engine dies when `fuel ≤ 0`.

---

## Steering Model (Track.vue)

Speed-dependent maximum steering angle:

```
maxSteer = 0.4 × (1 − min(speed_kmh / 100, 0.65))
```

| Speed (km/h) | maxSteer (rad) |
|---------------|----------------|
| 0             | 0.40           |
| 50            | 0.20           |
| 80            | 0.14           |
| 100+          | 0.14           |

Prevents unrealistic snap-turns at highway speed for a heavy bus.

---

## Testing

Tests live in `tests/js/` and run via Vitest (`npm run test`).

| File                   | Tests | Covers                                    |
|------------------------|-------|-------------------------------------------|
| `drivetrain.test.js`   | 23    | Constructor, torqueCurve, update() force, RPM inertia, gears, fuel |
| `physics-math.test.js` | 10    | computeRPM, force calculation, gear parsing edge cases |
