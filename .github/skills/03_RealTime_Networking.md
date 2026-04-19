# 03 — Real-Time Networking: Hot Bus Drive

| Field            | Value                                           |
| ---------------- | ----------------------------------------------- |
| **Project**      | Hot Bus Drive                                   |
| **Framework**    | Colyseus 0.17+ (Node.js / TypeScript)           |
| **Tick Rate**    | 30 Hz (Δt = 33.33 ms)                           |
| **Max Players**  | 4 per room                                      |
| **Transport**    | WebSocket (ws:// dev, wss:// prod)              |
| **Revision**     | 1.0.0                                           |
| **Date**         | 2026-04-18                                      |

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure (colyseus-server/)](#2-project-structure-colyseus-server)
3. [RaceRoom Lifecycle](#3-raceroom-lifecycle)
4. [State Schema Definition](#4-state-schema-definition)
5. [Server-Side Physics Loop](#5-server-side-physics-loop)
6. [Input Handling & Validation](#6-input-handling--validation)
7. [Client-Side Prediction & Reconciliation](#7-client-side-prediction--reconciliation)
8. [Entity Interpolation (Remote Players)](#8-entity-interpolation-remote-players)
9. [Anti-Cheat & Server Authority](#9-anti-cheat--server-authority)
10. [Race Flow State Machine](#10-race-flow-state-machine)
11. [Persistence: Race Results → Laravel](#11-persistence-race-results--laravel)
12. [Bandwidth & Performance Budget](#12-bandwidth--performance-budget)
13. [Deployment & Scaling](#13-deployment--scaling)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                          │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐   │
│  │  Vue/Inertia │   │   Three.js +     │   │  Colyseus Client  │   │
│  │  Portal UI   │   │   Rapier Physics  │   │  SDK (WebSocket)  │   │
│  │              │   │   (Predictive)    │   │                   │   │
│  └──────┬───────┘   └────────┬─────────┘   └────────┬──────────┘   │
│         │ HTTP/Inertia       │ render loop           │ WS messages  │
└─────────┼────────────────────┼───────────────────────┼──────────────┘
          │                    │                       │
          ▼                    │                       ▼
┌─────────────────┐            │            ┌─────────────────────────┐
│  Laravel Backend │            │            │   Colyseus Server       │
│  (PHP/Nginx)     │◄───HTTP────┘            │   (Node.js/TypeScript)  │
│                  │  verify token            │                         │
│  • Auth          │◄────────────────────────│   • Authoritative       │
│  • Garage/Shop   │   POST /api/race/       │     physics (30 Hz)     │
│  • Race Results  │   complete              │   • State sync          │
│  • WS Token Gen  │                         │   • Input validation    │
└─────────────────┘                          └─────────────────────────┘
```

**Key Principles:**

1. **Server is authoritative.** The Colyseus server runs the physics simulation. Client results are never trusted.
2. **Client predicts locally.** The Three.js client runs the same physics code for immediate responsiveness, then reconciles against server state.
3. **State is schema-based.** Colyseus serialises only deltas, minimising bandwidth.
4. **Identity is verified.** Players authenticate via Laravel; a signed token is passed to Colyseus on join.

---

## 2. Project Structure (colyseus-server/)

```
colyseus-server/
├── src/
│   ├── index.ts                    ← Server bootstrap, room registration
│   ├── rooms/
│   │   └── RaceRoom.ts             ← Room lifecycle (onCreate, onJoin, etc.)
│   ├── schemas/
│   │   ├── RaceState.ts            ← Root state schema
│   │   └── PlayerState.ts          ← Per-player state schema
│   ├── physics/
│   │   ├── VehiclePhysics.ts       ← Core physics engine (shared with client)
│   │   ├── TireModel.ts            ← Pacejka Magic Formula implementation
│   │   ├── FuelSystem.ts           ← BSFC consumption model
│   │   └── constants.ts            ← Shared physics constants (g, ρ, ε)
│   ├── validation/
│   │   ├── InputValidator.ts       ← Sanitise & clamp player inputs
│   │   └── CheckpointValidator.ts  ← Track checkpoint sequence validation
│   ├── services/
│   │   ├── TokenVerifier.ts        ← Verify Laravel WS token (HTTP callback)
│   │   └── RaceResultPersister.ts  ← POST results to Laravel API
│   └── types/
│       ├── InputPayload.ts         ← TypeScript interface for client input
│       └── VehicleConfig.ts        ← TypeScript interface for vehicle specs
├── package.json
├── tsconfig.json
└── .env
```

**Shared Physics Code:**

The `physics/` directory contains the **canonical implementation** of all vehicle dynamics formulas from `01_Game_Design_Document.md` §3. This code is designed to be **isomorphic** — it can run on both Node.js (server) and the browser (client). If using Three.js, this code is imported directly by the client bundle. If using Godot, the formulas must be reimplemented in GDScript with verified parity (test both against the same input vectors).

**Vehicle Configuration Data:**

Vehicle specifications (torque curve, BSFC map, suspension parameters, gear ratios, etc.) are loaded at runtime from the `vehicle_specs` database table defined in `02_Web_Architecture_and_API.md` §3.3. The `VehicleConfig` TypeScript interface mirrors the columns of that table.

---

## 3. RaceRoom Lifecycle

### 3.1 Room Registration

```typescript
// src/index.ts
import { Server } from "colyseus";
import { RaceRoom } from "./rooms/RaceRoom";

const server = new Server({ /* transport config */ });

server.define("race", RaceRoom)
  .filterBy(["trackSlug"]);   // Rooms filtered by track for matchmaking

server.listen(2567);
```

### 3.2 Room Lifecycle Methods

```typescript
// src/rooms/RaceRoom.ts (skeleton)
import { Room, Client } from "colyseus";
import { RaceState } from "../schemas/RaceState";
import { PlayerState } from "../schemas/PlayerState";
import { TokenVerifier } from "../services/TokenVerifier";
import { RaceResultPersister } from "../services/RaceResultPersister";
import { InputPayload } from "../types/InputPayload";
import { VehiclePhysics } from "../physics/VehiclePhysics";
import { InputValidator } from "../validation/InputValidator";
import { CheckpointValidator } from "../validation/CheckpointValidator";

export class RaceRoom extends Room<RaceState> {
  maxClients = 4;
  private physicsEngines: Map<string, VehiclePhysics> = new Map();
  private inputQueues: Map<string, InputPayload[]> = new Map();
  private trackData: TrackData;
  private checkpointValidator: CheckpointValidator;

  // ─── onCreate ──────────────────────────────────────────────────
  onCreate(options: { trackSlug: string }): void {
    this.setState(new RaceState());
    this.state.raceStatus = "waiting";

    // Load track data (from config or DB cache)
    this.trackData = loadTrackData(options.trackSlug);
    this.checkpointValidator = new CheckpointValidator(this.trackData);

    // Register message handler
    this.onMessage("input", (client, data: InputPayload) => {
      this.handleInput(client, data);
    });

    // Start the authoritative physics loop at 30 Hz
    this.setSimulationInterval(
      (deltaTime) => this.physicsTick(deltaTime),
      1000 / 30  // ~33.33 ms
    );

    // Auto-dispose if empty after 60 seconds
    this.autoDispose = true;
  }

  // ─── onJoin ────────────────────────────────────────────────────
  async onJoin(client: Client, options: { token: string; vehicleId: number }): Promise<void> {
    // 1. Verify identity via Laravel
    const identity = await TokenVerifier.verify(options.token);
    if (!identity) {
      throw new Error("Invalid or expired token");
    }

    // 2. Create player state
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = identity.userId;
    player.name = identity.name;
    player.vehicleId = options.vehicleId;

    // 3. Assign spawn position
    const spawnIndex = this.state.players.size;
    const spawn = this.trackData.spawnPositions[spawnIndex];
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;

    // 4. Initialise physics engine for this player
    // Vehicle specs sourced from vehicle_specs table (ARCH §3.3)
    const vehicleConfig = await loadVehicleConfig(options.vehicleId);
    this.physicsEngines.set(client.sessionId, new VehiclePhysics(vehicleConfig));
    this.inputQueues.set(client.sessionId, []);

    // 5. Add to state (triggers Colyseus serialisation)
    this.state.players.set(client.sessionId, player);

    // 6. Start countdown when enough players join (≥ 2)
    if (this.state.players.size >= 2 && this.state.raceStatus === "waiting") {
      this.startCountdown();
    }
  }

  // ─── onLeave ───────────────────────────────────────────────────
  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!consented) {
      // Disconnected unexpectedly — allow 15s reconnect window
      try {
        await this.allowReconnection(client, 15);
        return; // Reconnected successfully
      } catch {
        // Reconnection timed out — mark as DNF
      }
    }

    player.finished = true;
    player.position = 0; // 0 = DNF
    this.physicsEngines.delete(client.sessionId);
    this.inputQueues.delete(client.sessionId);

    this.checkRaceComplete();
  }

  // ─── onDispose ─────────────────────────────────────────────────
  async onDispose(): Promise<void> {
    await RaceResultPersister.persist(this.state, this.trackData.slug);
  }
}
```

---

## 4. State Schema Definition

Colyseus uses `@colyseus/schema` decorators for efficient binary delta serialisation.

### 4.1 PlayerState

```typescript
// src/schemas/PlayerState.ts
import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  // ── Identity ──
  @type("string")   sessionId: string = "";
  @type("uint32")   userId: number = 0;
  @type("string")   name: string = "";
  @type("uint16")   vehicleId: number = 0;

  // ── Position (world space) ──
  @type("float64")  x: number = 0;
  @type("float64")  y: number = 0;
  @type("float64")  z: number = 0;

  // ── Orientation (quaternion) ──
  @type("float32")  qx: number = 0;
  @type("float32")  qy: number = 0;
  @type("float32")  qz: number = 0;
  @type("float32")  qw: number = 1;

  // ── Velocity (m/s) ──
  @type("float32")  vx: number = 0;
  @type("float32")  vy: number = 0;
  @type("float32")  vz: number = 0;

  // ── Engine State ──
  @type("uint16")   rpm: number = 700;       // Current engine RPM
  @type("uint8")    gear: number = 1;        // Current gear (1-based)
  @type("float32")  fuel: number = 1.0;      // Fuel fraction (0.0 – 1.0)

  // ── Race Progress ──
  @type("uint8")    lap: number = 0;         // Current lap (0-based, 0 = not started)
  @type("uint8")    checkpoint: number = 0;  // Last passed checkpoint id
  @type("uint8")    position: number = 0;    // Race position (1–4, 0 = DNF)
  @type("boolean")  finished: boolean = false;
  @type("uint32")   finishTimeMs: number = 0;

  // ── Client Reconciliation ──
  @type("uint32")   inputSeq: number = 0;    // Last processed input sequence number
}
```

### 4.2 RaceState (Root)

```typescript
// src/schemas/RaceState.ts
import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";

export class RaceState extends Schema {
  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type("string")   raceStatus: string = "waiting";
  // Values: "waiting" | "countdown" | "racing" | "finished"

  @type("int8")     countdown: number = -1;
  // -1 = not counting, 3/2/1/0 during countdown

  @type("uint32")   elapsedMs: number = 0;
  // Race clock (starts at 0 when raceStatus → "racing")

  @type("string")   trackSlug: string = "";

  @type("uint8")    totalLaps: number = 3;
}
```

### 4.3 Schema Size Estimate

| Field Group       | Bytes per Player | Notes                                      |
| ----------------- | ---------------- | ------------------------------------------ |
| Position (x,y,z)  | 24               | 3 × float64                                |
| Quaternion         | 16               | 4 × float32                                |
| Velocity           | 12               | 3 × float32                                |
| Engine state       | 7                | uint16 + uint8 + float32                   |
| Race progress      | 7                | uint8×3 + bool + uint32                    |
| inputSeq           | 4                | uint32                                     |
| **Total per player** | **~70 bytes** | Excluding strings (sent once on join)      |

---

## 5. Server-Side Physics Loop

The `physicsTick` method runs at 30 Hz. Each tick:

1. Process queued inputs for each player.
2. Apply forces using the formulas from `01_Game_Design_Document.md` §3.
3. Integrate using Semi-Implicit Euler.
4. Update the Colyseus state schema (auto-broadcasts deltas).

### 5.1 Tick Implementation (Pseudocode)

```typescript
private physicsTick(deltaTime: number): void {
  if (this.state.raceStatus !== "racing") return;

  const dt = deltaTime / 1000; // Convert ms to seconds
  this.state.elapsedMs += deltaTime;

  this.state.players.forEach((player, sessionId) => {
    if (player.finished) return;

    const physics = this.physicsEngines.get(sessionId);
    if (!physics) return;

    // 1. Dequeue the latest input (or use last known input if none queued)
    const inputQueue = this.inputQueues.get(sessionId) || [];
    const input = inputQueue.pop() || physics.lastInput;
    inputQueue.length = 0; // Drain queue — only latest matters
    physics.lastInput = input;

    // 2. Apply physics step (see §5.2 for detail)
    const result = physics.step(input, dt);

    // 3. Update player state from physics result
    player.x = result.position.x;
    player.y = result.position.y;
    player.z = result.position.z;
    player.qx = result.quaternion.x;
    player.qy = result.quaternion.y;
    player.qz = result.quaternion.z;
    player.qw = result.quaternion.w;
    player.vx = result.velocity.x;
    player.vy = result.velocity.y;
    player.vz = result.velocity.z;
    player.rpm = Math.round(result.rpm);
    player.gear = result.gear;
    player.fuel = result.fuelFraction;
    player.inputSeq = input.seq;

    // 4. Checkpoint validation
    const cpResult = this.checkpointValidator.check(
      player, result.position, this.trackData
    );
    if (cpResult.newCheckpoint) {
      player.checkpoint = cpResult.checkpointId;
    }
    if (cpResult.lapCompleted) {
      player.lap += 1;
      if (player.lap >= this.state.totalLaps) {
        this.finishPlayer(player);
      }
    }

    // 5. Fuel exhaustion check
    if (result.fuelFraction <= 0) {
      player.finished = true;
      player.position = 0; // DNF
    }
  });

  this.updatePositions();
  this.checkRaceComplete();
}
```

### 5.2 VehiclePhysics.step() Contract

The `VehiclePhysics` class encapsulates all formulas from the GDD. The `step()` method signature:

```typescript
// src/physics/VehiclePhysics.ts

interface PhysicsInput {
  seq: number;        // Monotonic input sequence number
  throttle: number;   // 0.0 – 1.0
  brake: number;      // 0.0 – 1.0
  steer: number;      // -1.0 (left) to +1.0 (right)
  shiftUp: boolean;   // Manual shift request (ignored in auto mode)
  shiftDown: boolean;
}

interface PhysicsResult {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  rpm: number;
  gear: number;
  fuelFraction: number;  // 0.0 – 1.0
}

class VehiclePhysics {
  constructor(config: VehicleConfig) { /* ... */ }

  step(input: PhysicsInput, dt: number): PhysicsResult {
    // Implementation follows GDD §3 formulas exactly:
    //
    // 1. Compute engine RPM from velocity + current gear (§3.1.3)
    // 2. Look up T_engine from torque curve (§3.1.1)
    // 3. Apply low-fuel penalty if fuel < 10% (§4.3)
    // 4. Compute F_wheel (§3.1.2)
    // 5. Compute F_drag (§3.3)
    // 6. Compute F_rr (§3.4)
    // 7. Compute weight transfer ΔF_z (§3.5)
    // 8. Update per-wheel F_z via suspension (§3.6)
    // 9. Compute tire forces via Pacejka (§3.2)
    //   a. Slip angle α and slip ratio σ
    //   b. Lateral + longitudinal forces
    //   c. Friction circle limiting (§3.2.3)
    // 10. Sum net force, integrate velocity (Semi-Implicit Euler, §3.8)
    // 11. Integrate position
    // 12. Compute fuel consumed this tick (§4.1)
    // 13. Update CG height based on fuel fraction (§3.7)
    // 14. Handle automatic gear shifting (§3.1.3)
    //
    // Returns PhysicsResult with updated state.
  }
}
```

### 5.3 Formula Cross-Reference

Every formula implemented in `VehiclePhysics.step()` **MUST** reference the corresponding GDD section in a code comment:

```typescript
// GDD §3.1.2 — Wheel Force
const F_wheel = (T_engine * G_current * G_final * eta) / r_wheel;

// GDD §3.3 — Aerodynamic Drag
const F_drag = 0.5 * config.cd * config.frontalAreaM2 * RHO_AIR * v * v;

// GDD §3.4 — Rolling Resistance
const F_rr = config.cr * totalMass * G;

// GDD §3.5.1 — Longitudinal Weight Transfer
const dFz_long = (totalMass * ax * config.cgHeightM) / config.wheelbaseM;
```

---

## 6. Input Handling & Validation

### 6.1 InputPayload Structure

```typescript
// src/types/InputPayload.ts
export interface InputPayload {
  seq: number;        // uint32 — monotonically increasing
  throttle: number;   // float, expected 0.0–1.0
  brake: number;      // float, expected 0.0–1.0
  steer: number;      // float, expected -1.0–1.0
  shiftUp: boolean;
  shiftDown: boolean;
}
```

**Wire size:** ~20 bytes per message.

### 6.2 Input Validation (Server-Side)

```typescript
// src/validation/InputValidator.ts

export class InputValidator {
  static sanitise(raw: unknown): InputPayload | null {
    if (typeof raw !== "object" || raw === null) return null;

    const data = raw as Record<string, unknown>;

    const seq = typeof data.seq === "number" ? Math.floor(data.seq) : 0;
    const throttle = clamp(Number(data.throttle) || 0, 0, 1);
    const brake = clamp(Number(data.brake) || 0, 0, 1);
    const steer = clamp(Number(data.steer) || 0, -1, 1);
    const shiftUp = data.shiftUp === true;
    const shiftDown = data.shiftDown === true;

    return { seq, throttle, brake, steer, shiftUp, shiftDown };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

### 6.3 Rate Limiting

- Maximum input message rate: **30 messages/second** per client (matches tick rate).
- If a client exceeds this, excess messages are silently dropped.
- Implementation: track `lastInputTime` per client; reject if `now - lastInputTime < 30ms`.

```typescript
private handleInput(client: Client, rawData: unknown): void {
  // Rate limit
  const now = Date.now();
  const lastTime = this.lastInputTimes.get(client.sessionId) || 0;
  if (now - lastTime < 30) return; // Drop excess inputs
  this.lastInputTimes.set(client.sessionId, now);

  // Validate & sanitise
  const input = InputValidator.sanitise(rawData);
  if (!input) return;

  // Enqueue for next physics tick
  const queue = this.inputQueues.get(client.sessionId);
  if (queue) queue.push(input);
}
```

---

## 7. Client-Side Prediction & Reconciliation

The client runs the **same physics code** (`VehiclePhysics`) locally for the local player to provide instant feedback. Remote players are handled by interpolation (§8).

### 7.1 Prediction Flow

```
Player presses throttle
        │
        ▼
Client applies input locally (predictive physics step)
        │
        ├──▶ Render immediately (responsive feel)
        │
        ▼
Client sends InputPayload { seq: N, throttle, brake, steer, ... } to server
        │
        ▼
Client stores { seq: N, input, predictedState } in unacknowledged buffer
```

### 7.2 Reconciliation Flow

When a server state update arrives with `player.inputSeq = M`:

```
1. Discard all entries in the buffer where seq ≤ M (server has processed them).
2. Set authoritative state = server state (position, velocity, quaternion, fuel, rpm, gear).
3. Re-simulate all remaining unacknowledged inputs (seq > M) on top of the authoritative state.
4. The result is the new predicted state for rendering.
```

### 7.3 Snap vs. Smooth Correction

After reconciliation, the difference between the old predicted state and the new predicted state is the **correction delta**:

```
correction = newPredictedPosition − oldPredictedPosition
```

| Condition                        | Action                                              |
| -------------------------------- | --------------------------------------------------- |
| `|correction| < 0.05 m`         | Ignore (within tolerance).                          |
| `0.05 m ≤ |correction| < 2.0 m` | **Smooth correction:** lerp the visual position towards the corrected position over 100 ms. |
| `|correction| ≥ 2.0 m`          | **Snap:** immediately teleport to corrected position (major desync, likely from lag spike). |

### 7.4 Client-Side Buffer Implementation

```typescript
interface PendingInput {
  seq: number;
  input: PhysicsInput;
  predictedState: PhysicsResult;
}

class ClientPrediction {
  private buffer: PendingInput[] = [];
  private physics: VehiclePhysics;
  private currentSeq: number = 0;

  applyInput(input: Omit<PhysicsInput, "seq">, dt: number): PhysicsResult {
    this.currentSeq++;
    const fullInput: PhysicsInput = { ...input, seq: this.currentSeq };

    // Run predictive physics
    const result = this.physics.step(fullInput, dt);

    // Store in buffer
    this.buffer.push({ seq: this.currentSeq, input: fullInput, predictedState: result });

    // Send to server
    this.room.send("input", fullInput);

    return result;
  }

  reconcile(serverState: PlayerState): PhysicsResult {
    const ackSeq = serverState.inputSeq;

    // 1. Discard acknowledged inputs
    this.buffer = this.buffer.filter(entry => entry.seq > ackSeq);

    // 2. Reset physics to server authoritative state
    this.physics.setState({
      position: { x: serverState.x, y: serverState.y, z: serverState.z },
      quaternion: { x: serverState.qx, y: serverState.qy, z: serverState.qz, w: serverState.qw },
      velocity: { x: serverState.vx, y: serverState.vy, z: serverState.vz },
      rpm: serverState.rpm,
      gear: serverState.gear,
      fuelFraction: serverState.fuel,
    });

    // 3. Re-simulate unacknowledged inputs
    for (const entry of this.buffer) {
      this.physics.step(entry.input, 1 / 30); // Fixed dt matching server tick
    }

    return this.physics.getState();
  }
}
```

---

## 8. Entity Interpolation (Remote Players)

Remote players (opponents) are **not predicted** — they are rendered using **buffered interpolation** to smooth out network jitter.

### 8.1 Snapshot Buffer

The client maintains a ring buffer of the **last 3 server snapshots** per remote player:

```typescript
interface Snapshot {
  timestamp: number; // Server elapsedMs at time of snapshot
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
  rpm: number;
  gear: number;
}
```

### 8.2 Interpolation Algorithm

Rendering is always **2 ticks behind** real-time (~66 ms) to ensure a pair of snapshots is available:

```
renderTime = serverTime − interpolationDelay (66 ms)

Find snapshots A and B such that A.timestamp ≤ renderTime < B.timestamp

t = (renderTime − A.timestamp) / (B.timestamp − A.timestamp)

position = lerp(A.position, B.position, t)
rotation = slerp(A.quaternion, B.quaternion, t)
```

### 8.3 Extrapolation Fallback

If a new snapshot has not arrived within **200 ms** (6 missed ticks):

- **0 – 200 ms overdue:** Extrapolate linearly using the last known velocity: `position += velocity × overdue_time`.
- **> 200 ms overdue:** Freeze the entity at its last known position. Display a "connection issue" icon next to the player's name.

### 8.4 Visual Smoothing Constants

| Parameter              | Value   | Rationale                               |
| ---------------------- | ------- | --------------------------------------- |
| Interpolation delay    | 66 ms   | 2 server ticks; hides 1 dropped packet. |
| Buffer depth           | 3       | Survive 2 consecutive dropped packets.  |
| Extrapolation max      | 200 ms  | Beyond this, extrapolation is unreliable. |
| Position lerp rate     | Linear  | Simple; sufficient for 30 Hz updates.   |
| Rotation slerp rate    | Spherical | Prevents quaternion artifacts.          |

---

## 9. Anti-Cheat & Server Authority

### 9.1 Fundamental Rule

> **The server is the single source of truth.** The client submits *intentions* (inputs), never *results* (positions, speeds, scores).

### 9.2 Validation Layers

| Layer                 | What is Validated                                              | Action on Violation                  |
| --------------------- | -------------------------------------------------------------- | ------------------------------------ |
| **Input sanitisation** | Throttle ∈ [0,1], brake ∈ [0,1], steer ∈ [−1,1]             | Clamp to valid range.                |
| **Rate limiting**      | ≤ 30 input messages/second                                    | Drop excess messages.                |
| **Speed sanity**       | `|v| ≤ v_max_theoretical × 1.1`                              | Force correction to `v_max × 0.9`.  |
| **Checkpoint order**   | Checkpoints must be passed in ascending ID order              | Reject lap; do not increment.        |
| **Position teleport**  | Server computes position; client cannot send position data    | N/A (input-only model).             |
| **Fuel integrity**     | Fuel can only decrease (no client-side refuelling exploit)    | Server tracks fuel authoritatively.  |
| **Token expiry**       | WS token valid for ≤ 5 minutes                                | Reject join; force re-authentication.|

### 9.3 Speed Sanity Check

```typescript
private enforceSpeedLimit(player: PlayerState, physics: VehiclePhysics): void {
  const speed = Math.sqrt(player.vx ** 2 + player.vy ** 2 + player.vz ** 2);
  const maxSpeed = physics.getTheoreticalMaxSpeed() * 1.1;

  if (speed > maxSpeed) {
    const scale = (physics.getTheoreticalMaxSpeed() * 0.9) / speed;
    player.vx *= scale;
    player.vy *= scale;
    player.vz *= scale;
    // Log for monitoring
    console.warn(`[AntiCheat] Player ${player.name} exceeded speed limit: ${speed.toFixed(1)} m/s`);
  }
}
```

### 9.4 Theoretical Max Speed Calculation

```
v_max = speed where F_wheel(top_gear, RPM_max) = F_drag(v) + F_rr
```

This is pre-computed per vehicle on room creation and cached.

---

## 10. Race Flow State Machine

```
                     ┌──────────┐
           onCreate  │ WAITING  │  Players join (2–4)
                     └────┬─────┘
                          │ players.size ≥ 2 && all ready (or 30s timeout)
                          ▼
                     ┌──────────┐
                     │COUNTDOWN │  3… 2… 1… GO!
                     │ (4 sec)  │  Inputs accepted but brakes locked
                     └────┬─────┘
                          │ countdown reaches 0
                          ▼
                     ┌──────────┐
                     │ RACING   │  Physics ticking, inputs processed
                     │          │  elapsedMs incrementing
                     └────┬─────┘
                          │ all players finished OR last player DNFs
                          ▼
                     ┌──────────┐
                     │ FINISHED │  10-second results display
                     │          │  Persist to Laravel → dispose room
                     └──────────┘
```

### 10.1 Countdown Implementation

```typescript
private startCountdown(): void {
  this.state.raceStatus = "countdown";
  this.state.countdown = 3;

  this.clock.setInterval(() => {
    this.state.countdown -= 1;

    if (this.state.countdown <= 0) {
      this.state.raceStatus = "racing";
      this.state.elapsedMs = 0;
      // Cancel countdown interval (handled by Colyseus clock)
    }
  }, 1000); // 1-second intervals
}
```

### 10.2 Position Tracking

Player positions (1st, 2nd, etc.) are recalculated every tick based on:

1. **Lap number** (higher = further ahead).
2. **Checkpoint ID** (higher = further ahead within the same lap).
3. **Distance to next checkpoint** (shorter = further ahead with the same checkpoint).

```typescript
private updatePositions(): void {
  const ranking = Array.from(this.state.players.values())
    .filter(p => !p.finished || p.position > 0)
    .sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap;
      if (a.checkpoint !== b.checkpoint) return b.checkpoint - a.checkpoint;
      return this.distToNextCheckpoint(a) - this.distToNextCheckpoint(b);
    });

  ranking.forEach((player, index) => {
    if (!player.finished) {
      player.position = index + 1;
    }
  });
}
```

---

## 11. Persistence: Race Results → Laravel

When the race ends, the Colyseus server persists results to the Laravel backend via an authenticated HTTP POST.

### 11.1 RaceResultPersister

```typescript
// src/services/RaceResultPersister.ts
import axios from "axios";

export class RaceResultPersister {
  static async persist(state: RaceState, trackSlug: string): Promise<void> {
    const results = Array.from(state.players.values()).map(player => ({
      user_id: player.userId,
      vehicle_id: player.vehicleId,
      position: player.position,                          // 0 = DNF
      total_time_ms: player.finished && player.position > 0
        ? player.finishTimeMs
        : null,
      fuel_used_liters: calculateFuelUsed(player),        // Derived from initial − remaining
    }));

    await axios.post(`${process.env.LARAVEL_API_URL}/api/race/complete`, {
      api_secret: process.env.COLYSEUS_API_SECRET,
      track_slug: trackSlug,
      results,
    });
  }
}
```

### 11.2 Security

- The `api_secret` is a shared secret stored in both `.env` files (Laravel and Colyseus).
- The Laravel endpoint validates `api_secret === config('services.colyseus.api_secret')` before processing.
- This endpoint is **not** exposed to the public internet (firewall rule or internal network only in production).

---

## 12. Bandwidth & Performance Budget

### 12.1 Server → Client (State Sync)

| Component               | Size (bytes)  | Frequency | Bandwidth           |
| ------------------------ | ------------- | --------- | ------------------- |
| Per-player delta update  | ~40 (avg)     | 30 Hz     | 1.2 KB/s per player |
| 4 players × 30 Hz       | ~160          | 30 Hz     | **4.8 KB/s** total outbound per client |
| Race-level state changes | ~10 (rare)    | < 1 Hz    | Negligible          |
| **Total outbound**       |               |           | **~5 KB/s per client** |

> Note: Colyseus transmits **deltas only** — unchanged fields are not re-sent. Actual bandwidth is typically 40–60% of the theoretical maximum.

### 12.2 Client → Server (Input)

| Component    | Size (bytes) | Frequency | Bandwidth         |
| ------------ | ------------ | --------- | ----------------- |
| InputPayload | ~20          | 30 Hz     | **0.6 KB/s** per client inbound |

### 12.3 Total Per-Room Budget

| Direction | Per Client | 4 Clients |
| --------- | ---------- | --------- |
| Outbound  | 5 KB/s     | 20 KB/s   |
| Inbound   | 0.6 KB/s   | 2.4 KB/s  |
| **Total** | **5.6 KB/s** | **22.4 KB/s** |

This is well within the capacity of a single VPS with a 100 Mbps connection (~12,500 KB/s), allowing hundreds of concurrent rooms.

### 12.4 CPU Budget

- Physics tick for 4 players at 30 Hz: target < **2 ms** per tick (leaving 31 ms headroom).
- Profile with `console.time("physicsTick")` during development.
- If physics exceeds 5 ms, optimise the tire model (use linear approximation instead of full Pacejka).

---

## 13. Deployment & Scaling

### 13.1 Single-Server Setup (v1)

```
┌─────────────────────────────────────────┐
│               VPS / Cloud Instance       │
│                                         │
│  ┌──────────┐   ┌───────────────────┐   │
│  │  Nginx   │   │  Colyseus Server  │   │
│  │  :443    │──▶│  :2567            │   │
│  │  (SSL)   │   │  (PM2 managed)    │   │
│  └────┬─────┘   └───────────────────┘   │
│       │                                  │
│  ┌────▼─────┐   ┌───────────────────┐   │
│  │ PHP-FPM  │   │     MySQL /       │   │
│  │ Laravel  │   │   PostgreSQL      │   │
│  │  :9000   │   │    :3306/:5432    │   │
│  └──────────┘   └───────────────────┘   │
└─────────────────────────────────────────┘
```

### 13.2 Nginx WebSocket Proxy

```nginx
# /etc/nginx/sites-available/hot-bus-drive.conf

# WebSocket proxy for Colyseus
location /colyseus/ {
    proxy_pass http://127.0.0.1:2567/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

### 13.3 PM2 Process Management

```json
// colyseus-server/ecosystem.config.js
{
  "apps": [{
    "name": "colyseus",
    "script": "dist/index.js",
    "instances": 1,
    "exec_mode": "fork",
    "env": {
      "NODE_ENV": "production",
      "PORT": 2567
    },
    "max_memory_restart": "512M",
    "log_date_format": "YYYY-MM-DD HH:mm:ss"
  }]
}
```

> **Important:** Colyseus rooms are stateful and cannot be load-balanced across multiple processes without Colyseus' distributed mode. For v1, a single process is sufficient for 4-player rooms. Scale horizontally using Colyseus' built-in `@colyseus/cluster` or Redis-based presence when needed.

### 13.4 Scaling Thresholds

| Metric                          | Threshold               | Action                                      |
| ------------------------------- | ----------------------- | ------------------------------------------- |
| Concurrent rooms > 50           | Moderate load           | Monitor CPU; consider vertical scaling.     |
| Concurrent rooms > 200          | High load               | Deploy `@colyseus/cluster` with Redis.      |
| Physics tick > 10 ms            | Performance degradation | Profile; simplify tire model or reduce tick rate to 20 Hz. |
| WebSocket connections > 500     | OS limit risk           | Increase `ulimit -n`; use multiple Colyseus instances. |

---

*End of Document — 03_RealTime_Networking.md*
