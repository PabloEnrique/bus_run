<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { usePage, Link } from '@inertiajs/vue3';
import { PhysicsWorld } from '../../GameEngine/PhysicsWorld.js';
import { SceneManager } from '../../GameEngine/SceneManager.js';
import { NetworkManager } from '../../GameEngine/NetworkManager.js';
import { Drivetrain } from '../../GameEngine/Drivetrain.js';
import { AudioManager } from '../../GameEngine/AudioManager.js';
import { getMapById, DEFAULT_MAP_ID } from '../../GameEngine/maps/index.js';
import GaugeCluster from '../../Components/GaugeCluster.vue';

const props = defineProps({
    bus: Object,
    userId: Number,
    mapId: {
        type: String,
        default: null,
    },
});

const user = computed(() => usePage().props?.auth?.user);
const canvasRef = ref(null);
const noBus = computed(() => !props.bus);
const isLoading = ref(true);
const initError = ref(null);

// Telemetry refs
const currentSpeed = ref(0);
const currentRPM = ref(800);
const currentGear = ref('1');
const currentFuel = ref(0);
const fuelCapacity = ref(100);
const connected = ref(false);

let physics = null;
let scene = null;
let network = null;
let drivetrain = null;
let audio = null;
let playerMesh = null;
let animFrame = null;
let lastTime = 0;
let _contactLogTimer = 0;
let _mapConfig = null;

// Input state
const keys = { w: false, a: false, s: false, d: false };
let shiftCooldown = 0;
let currentSteer = 0;  // current steering angle (lerped)

function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;

    // Gear shifting — E = up, Q = down
    if (k === 'e' && drivetrain && shiftCooldown <= 0) {
        drivetrain.shiftUp();
        shiftCooldown = 0.3;
    }
    if (k === 'q' && drivetrain && shiftCooldown <= 0) {
        drivetrain.shiftDown();
        shiftCooldown = 0.3;
    }
}

function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
}

function hexToInt(hex) {
    return parseInt((hex || '#FFB300').replace('#', ''), 16);
}

async function initGame() {
    if (!props.bus || !canvasRef.value) {
        isLoading.value = false;
        return;
    }

    // ── Local init (MUST succeed — no network dependency) ────────
    try {
        console.info('[Race] Step 1/5: Creating drivetrain...');
        drivetrain = new Drivetrain({
            engine_torque_nm: props.bus.engine_torque_nm,
            engine_hp: props.bus.engine_hp,
            idle_rpm: props.bus.idle_rpm,
            redline_rpm: props.bus.redline_rpm,
            peak_torque_rpm_low: props.bus.peak_torque_rpm_low,
            peak_torque_rpm_high: props.bus.peak_torque_rpm_high,
            torque_idle_nm: props.bus.torque_idle_nm,
            torque_redline_nm: props.bus.torque_redline_nm,
            gear_ratios: props.bus.gear_ratios,
            fuel_capacity_liters: props.bus.fuel_capacity_liters,
            current_fuel_liters: props.bus.current_fuel_liters,
            base_weight_kg: props.bus.base_weight_kg,
            drag_coefficient: props.bus.drag_coefficient,
            width_m: props.bus.width_m,
            height_m: props.bus.height_m,
        });
        fuelCapacity.value = props.bus.fuel_capacity_liters;
        currentFuel.value = props.bus.current_fuel_liters;
        console.info('[Race] Step 1/5: Drivetrain OK — gears:', drivetrain.gearCount, 'torque:', drivetrain.peakTorque, 'Nm');

        audio = new AudioManager();

        console.info('[Race] Step 2/5: Creating physics world + vehicle...');
        const mapConfig = getMapById(props.mapId || DEFAULT_MAP_ID);
        _mapConfig = mapConfig;
        console.info('[Race] Map:', mapConfig?.name || 'default');
        physics = new PhysicsWorld(mapConfig);
        physics.createVehicle({
            base_weight_kg: props.bus.base_weight_kg,
            suspension_stiffness: props.bus.suspension_stiffness,
            length_m: props.bus.length_m,
            width_m: props.bus.width_m,
            height_m: props.bus.height_m,
            wheelbase_m: props.bus.wheelbase_m,
            axle_track_m: props.bus.axle_track_m,
        });
        console.info('[Race] Step 2/5: Physics OK — wheels:', physics.vehicle?.wheelInfos?.length, 'mass:', physics.chassisBody?.mass);

        console.info('[Race] Step 3/5: Creating 3D scene...');
        scene = new SceneManager(canvasRef.value, mapConfig);
        const color = hexToInt(props.bus.paint_hex);
        const busVisualSpecs = {
            length_m: props.bus.length_m,
            width_m: props.bus.width_m,
            height_m: props.bus.height_m,
            wheelbase_m: props.bus.wheelbase_m,
            axle_track_m: props.bus.axle_track_m,
        };
        playerMesh = scene.createBusMesh(color, busVisualSpecs);
        console.info('[Race] Step 3/5: Scene OK — visual wheels:', playerMesh?.wheels?.length);

        // Fire-and-forget: load HDRI environment for PBR reflections
        scene.loadEnvironment('/models/env/outdoor.hdr');

        // Fire-and-forget: load GLB bus model (replaces procedural when ready)
        if (props.bus.glb_file) {
            scene.loadBusMeshGLB(props.bus.glb_file, color, busVisualSpecs, playerMesh)
                .then((glbMesh) => { if (glbMesh) playerMesh = glbMesh; });
        }

        // Input
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // Start game loop — runs even without network
        isLoading.value = false;
        lastTime = performance.now();
        console.info('[Race] Step 4/5: Starting game loop (physics + render)');
        gameLoop();
    } catch (err) {
        console.error('[Race] Failed to initialise game:', err);
        initError.value = err?.message || 'Error desconocido';
        isLoading.value = false;
        return;
    }

    // ── Network (non-fatal — game runs offline) ─────────────────
    console.info('[Race] Step 5/5: Connecting to game server...');
    try {
        network = new NetworkManager('ws://localhost:2567');
        network.onPlayerJoin((sessionId) => {
            scene?.addRemotePlayer(sessionId, 0x4488ff);
        });
        network.onPlayerUpdate((sessionId, pos) => {
            scene?.updateRemotePlayer(sessionId, pos);
        });
        network.onPlayerLeave((sessionId) => {
            scene?.removeRemotePlayer(sessionId);
        });

        await network.joinRace({
            userId: props.userId,
            torque: props.bus.engine_torque_nm,
            weight: props.bus.base_weight_kg,
        });
        connected.value = true;
        console.info('[Race] Step 5/5: Connected to game server');
    } catch (err) {
        console.warn('[Race] Step 5/5: Could not connect to game server (offline mode):', err?.message);
    }
}

function gameLoop() {
    animFrame = requestAnimationFrame(gameLoop);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = now;

    if (!physics || !physics.vehicle || !scene || !drivetrain) return;

    // Shift cooldown
    if (shiftCooldown > 0) shiftCooldown -= dt;

    // Drivetrain update
    const wheelSpeed = physics.getRearWheelSpeed();
    const throttleInput = keys.w ? 1.0 : 0;
    const isBraking = keys.s;
    const engineForce = drivetrain.update(wheelSpeed, throttleInput, isBraking, dt);

    // Velocity / speed (used by steering + telemetry + drag)
    const vel = physics.chassisBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z) * 3.6; // km/h

    // ── Gradual steering ───────────────────────────────────
    // Max steer angle is inversely proportional to wheelbase (longer
    // buses turn wider) and reduces at speed for realistic understeer.
    const wheelbase = props.bus?.wheelbase_m || 3.5;
    const baseMaxSteer = Math.min(0.30, 1.0 / wheelbase);  // ~0.26–0.29 rad
    const speedFactor = 1 - Math.min(speed / 120, 0.6);
    const maxSteer = baseMaxSteer * speedFactor;

    // Target: full lock when key held, zero when released (self-centering)
    let targetSteer = 0;
    if (keys.a) targetSteer = maxSteer;
    if (keys.d) targetSteer = -maxSteer;

    // Lerp rate: steer-in is fast, self-centering is faster for realism
    const steerRate = targetSteer !== 0 ? 4.0 : 8.0;
    currentSteer += (targetSteer - currentSteer) * Math.min(1, steerRate * dt);

    // Apply to rear wheels (indices 2, 3).
    // Negate: cannon-es wheel forward = contactNormal × axleLocal;
    // with axleLocal (-1,0,0) the internal forward points -Z, but our
    // bus front is +Z, so we flip the sign.
    physics.vehicle.applyEngineForce(-engineForce, 2);
    physics.vehicle.applyEngineForce(-engineForce, 3);

    // Steering on front wheels (indices 0, 1)
    physics.vehicle.setSteeringValue(currentSteer, 0);
    physics.vehicle.setSteeringValue(currentSteer, 1);

    // Manual brake (S key)
    const manualBrake = keys.s ? 80 : 0;
    for (let i = 0; i < 4; i++) {
        physics.vehicle.setBrake(manualBrake, i);
    }

    // Step physics
    physics.step(dt);

    // ── Aerodynamic drag + rolling resistance ────────────────
    // Applied as a post-step velocity reduction, NOT via applyForce().
    // cannon-es clears body.force after each internal sub-step, but
    // applyForce() only fires once per frame — when the world runs
    // multiple sub-steps the resistance is under-applied, and when
    // frames outpace the fixed timestep the force accumulates.
    // Decelerating the velocity directly after the step avoids both
    // problems and keeps drag frame-rate-independent.
    {
        const v = physics.chassisBody.velocity;
        const spd = Math.sqrt(v.x * v.x + v.z * v.z);
        if (spd > 0.05) {
            const resistance = drivetrain.computeResistance(spd);
            const decel = Math.min(spd, (resistance / physics.chassisBody.mass) * dt);
            const ratio = (spd - decel) / spd;
            v.x *= ratio;
            v.z *= ratio;
        }
    }

    // Diagnostic: log wheel ground contact once per second
    _contactLogTimer += dt;
    if (_contactLogTimer >= 1.0) {
        _contactLogTimer = 0;
        const contacts = physics.getWheelContacts();
        const force = engineForce;
        console.info('[Physics Engine] contacts:', contacts, 'engineForce:', Math.round(force), 'N, speed:', Math.round(speed), 'km/h');
    }

    // Sync visual
    scene.syncMeshToBody(playerMesh, physics.chassisBody, physics.wheelBodies);

    // Respawn safety — if bus falls below track, reset to map spawn
    if (physics.chassisBody.position.y < -10) {
        const spawn = _mapConfig?.spawnPosition || [0, 1.5, 0];
        physics.chassisBody.position.set(spawn[0], spawn[1], spawn[2]);
        physics.chassisBody.velocity.set(0, 0, 0);
        physics.chassisBody.angularVelocity.set(0, 0, 0);
        physics.chassisBody.quaternion.set(0, 0, 0, 1);
        currentSteer = 0;
    }

    // Update telemetry
    currentSpeed.value = Math.round(speed);
    currentRPM.value = Math.round(drivetrain.rpm);
    currentGear.value = drivetrain.gearLabel;
    currentFuel.value = Math.round(drivetrain.fuel * 10) / 10;

    // Engine audio — pitch/volume from RPM and throttle
    if (audio) {
        audio.update(drivetrain.rpm, drivetrain.throttle, drivetrain.redlineRPM);
    }

    // Camera — velocity-aware chase cam
    scene.updateCamera(playerMesh, vel);

    // Interpolate remote players
    scene.lerpRemotePlayers(0.15);

    // Network sync
    if (network && connected.value) {
        const pos = physics.chassisBody.position;
        network.sendPosition({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            rotation: playerMesh.rotation.y,
            speed,
        });
    }

    // Render
    scene.render();
}

// HUD computed
const busRedline = computed(() => props.bus?.redline_rpm || 3200);
const currentMapName = computed(() => {
    const mc = getMapById(props.mapId || DEFAULT_MAP_ID);
    return mc?.name || 'Pista Libre';
});

onMounted(() => {
    initGame().catch((err) => {
        console.error('[Race] Unhandled init error:', err);
        initError.value = err.message || 'Error desconocido';
        isLoading.value = false;
    });
});

onBeforeUnmount(() => {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    if (network) network.dispose();
    if (audio) audio.destroy();
    if (scene) scene.dispose();
    if (physics) physics.destroy();
});
</script>

<template>
    <div class="relative h-screen w-screen overflow-hidden bg-black">
        <!-- No bus state -->
        <div v-if="noBus" class="flex h-full items-center justify-center">
            <div class="text-center">
                <p class="text-xl text-gray-300">No tienes guagua equipada.</p>
                <Link href="/race" class="mt-4 inline-block text-amber-400 hover:text-amber-300">
                    Volver al Lobby →
                </Link>
            </div>
        </div>

        <!-- Loading state -->
        <div v-else-if="isLoading" class="flex h-full items-center justify-center">
            <p class="text-xl text-amber-400 animate-pulse">Cargando pista...</p>
        </div>

        <!-- Init error state -->
        <div v-else-if="initError" class="flex h-full items-center justify-center">
            <div class="text-center">
                <p class="text-xl text-red-400">Error al iniciar</p>
                <p class="mt-2 text-sm text-gray-500">{{ initError }}</p>
                <Link href="/race" class="mt-4 inline-block text-amber-400 hover:text-amber-300">
                    ← Volver al Lobby
                </Link>
            </div>
        </div>

        <!-- Game canvas -->
        <canvas v-show="!noBus && !isLoading && !initError" ref="canvasRef" class="block h-full w-full" />

        <!-- HUD Overlay -->
        <div v-if="!noBus && !isLoading && !initError" class="pointer-events-none absolute inset-0">
            <!-- Top bar -->
            <div class="flex items-center justify-between px-4 py-3">
                <div class="pointer-events-auto">
                    <Link href="/race" class="rounded bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/70">
                        ← Salir
                    </Link>
                </div>
                <div class="rounded bg-black/50 px-3 py-1.5 text-sm backdrop-blur">
                    <span class="text-gray-400">{{ user?.name }}</span>
                    <span class="ml-2 text-xs" :class="connected ? 'text-green-400' : 'text-red-400'">
                        {{ connected ? '● Online' : '● Offline' }}
                    </span>
                </div>
            </div>

            <!-- Gauge cluster — bottom center -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2">
                <div class="rounded-xl bg-black/70 px-4 py-3 backdrop-blur">
                    <GaugeCluster
                        :rpm="currentRPM"
                        :max-rpm="busRedline"
                        :speed="currentSpeed"
                        :gear="currentGear"
                        :fuel="currentFuel"
                        :fuel-capacity="fuelCapacity"
                    />
                </div>
            </div>

            <!-- Bus info — top right (below nav) -->
            <div class="absolute right-4 top-14 rounded bg-black/50 px-3 py-2 text-right text-xs backdrop-blur">
                <p class="text-amber-400">{{ bus?.model }}</p>
                <p class="text-gray-500">{{ bus?.generation }}</p>
                <p v-if="bus?.nickname" class="italic text-gray-600">"{{ bus.nickname }}"</p>
                <p class="mt-1 text-cyan-400">{{ currentMapName }}</p>
            </div>

            <!-- Controls hint — bottom left -->
            <div class="absolute bottom-4 left-4 rounded bg-black/50 px-3 py-2 text-xs text-gray-500 backdrop-blur">
                <p><kbd class="text-white">W</kbd> Acelerar · <kbd class="text-white">S</kbd> Frenar</p>
                <p><kbd class="text-white">A</kbd><kbd class="text-white">D</kbd> Girar</p>
                <p><kbd class="text-white">E</kbd> Subir marcha · <kbd class="text-white">Q</kbd> Bajar</p>
            </div>
        </div>
    </div>
</template>
