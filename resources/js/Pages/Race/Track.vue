<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { usePage, Link } from '@inertiajs/vue3';
import { PhysicsWorld } from '../../GameEngine/PhysicsWorld.js';
import { SceneManager } from '../../GameEngine/SceneManager.js';
import { NetworkManager } from '../../GameEngine/NetworkManager.js';
import { Drivetrain, REDLINE_RPM } from '../../GameEngine/Drivetrain.js';

const props = defineProps({
    bus: Object,
    userId: Number,
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
let playerMesh = null;
let animFrame = null;
let lastTime = 0;
let _contactLogTimer = 0;

// Input state
const keys = { w: false, a: false, s: false, d: false };
let shiftCooldown = 0;

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
            gear_ratios: props.bus.gear_ratios,
            fuel_capacity_liters: props.bus.fuel_capacity_liters,
            current_fuel_liters: props.bus.current_fuel_liters,
        });
        fuelCapacity.value = props.bus.fuel_capacity_liters;
        currentFuel.value = props.bus.current_fuel_liters;
        console.info('[Race] Step 1/5: Drivetrain OK — gears:', drivetrain.gearCount, 'torque:', drivetrain.peakTorque, 'Nm');

        console.info('[Race] Step 2/5: Creating physics world + vehicle...');
        physics = new PhysicsWorld();
        physics.createVehicle({
            base_weight_kg: props.bus.base_weight_kg,
            suspension_stiffness: props.bus.suspension_stiffness,
        });
        console.info('[Race] Step 2/5: Physics OK — wheels:', physics.vehicle?.wheelInfos?.length, 'mass:', physics.chassisBody?.mass);

        console.info('[Race] Step 3/5: Creating 3D scene...');
        scene = new SceneManager(canvasRef.value);
        const color = hexToInt(props.bus.paint_hex);
        playerMesh = scene.createBusMesh(color);
        console.info('[Race] Step 3/5: Scene OK — visual wheels:', playerMesh?.wheels?.length);

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

    // Steering — reduces at high speed for realistic understeer
    const vel = physics.chassisBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z) * 3.6; // km/h
    const maxSteer = 0.4 * (1 - Math.min(speed / 100, 0.65));
    let steering = 0;
    if (keys.a) steering = maxSteer;
    if (keys.d) steering = -maxSteer;

    // Apply to rear wheels (indices 2, 3).
    // Negate: cannon-es wheel forward = contactNormal × axleLocal;
    // with axleLocal (-1,0,0) the internal forward points -Z, but our
    // bus front is +Z, so we flip the sign.
    physics.vehicle.applyEngineForce(-engineForce, 2);
    physics.vehicle.applyEngineForce(-engineForce, 3);

    // Steering on front wheels (indices 0, 1)
    physics.vehicle.setSteeringValue(steering, 0);
    physics.vehicle.setSteeringValue(steering, 1);

    // Brake
    const brakeForce = keys.s ? 80 : 0;
    for (let i = 0; i < 4; i++) {
        physics.vehicle.setBrake(brakeForce, i);
    }

    // Step physics
    physics.step(dt);

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

    // Respawn safety — if bus falls below track, reset near equilibrium
    if (physics.chassisBody.position.y < -10) {
        physics.chassisBody.position.set(0, 1.5, 0);
        physics.chassisBody.velocity.set(0, 0, 0);
        physics.chassisBody.angularVelocity.set(0, 0, 0);
        physics.chassisBody.quaternion.set(0, 0, 0, 1);
    }

    // Update telemetry
    currentSpeed.value = Math.round(speed);
    currentRPM.value = Math.round(drivetrain.rpm);
    currentGear.value = drivetrain.gearLabel;
    currentFuel.value = Math.round(drivetrain.fuel * 10) / 10;

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

// RPM bar width for HUD (0–100%)
const rpmPercent = computed(() => Math.min(100, (currentRPM.value / REDLINE_RPM) * 100));
const rpmColor = computed(() => {
    if (currentRPM.value > 2800) return 'bg-red-500';
    if (currentRPM.value > 2200) return 'bg-amber-500';
    return 'bg-green-500';
});
const fuelPercent = computed(() => {
    if (fuelCapacity.value === 0) return 0;
    return Math.round((currentFuel.value / fuelCapacity.value) * 100);
});
const fuelBarColor = computed(() => {
    if (fuelPercent.value > 50) return 'bg-green-500';
    if (fuelPercent.value > 20) return 'bg-amber-500';
    return 'bg-red-500';
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
                <Link href="/garage" class="mt-4 inline-block text-amber-400 hover:text-amber-300">
                    Ir al Garaje →
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
                <Link href="/dashboard" class="mt-4 inline-block text-amber-400 hover:text-amber-300">
                    ← Volver al Dashboard
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
                    <Link href="/dashboard" class="rounded bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/70">
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

            <!-- Telemetry panel — bottom center -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2">
                <div class="flex items-end gap-4 rounded-xl bg-black/70 px-6 py-4 backdrop-blur">
                    <!-- Speedometer -->
                    <div class="text-center">
                        <p class="text-5xl font-bold tabular-nums text-white">{{ currentSpeed }}</p>
                        <p class="text-[10px] uppercase tracking-widest text-gray-500">km/h</p>
                    </div>

                    <!-- Divider -->
                    <div class="h-16 w-px bg-gray-700"></div>

                    <!-- RPM + Gear -->
                    <div class="w-40">
                        <!-- RPM number -->
                        <div class="mb-1 flex items-baseline justify-between">
                            <span class="text-xs text-gray-500">RPM</span>
                            <span class="font-mono text-sm tabular-nums text-gray-300">{{ currentRPM }}</span>
                        </div>
                        <!-- RPM bar -->
                        <div class="h-3 w-full overflow-hidden rounded-full bg-gray-800">
                            <div
                                class="h-full rounded-full transition-all duration-75"
                                :class="rpmColor"
                                :style="{ width: rpmPercent + '%' }"
                            ></div>
                        </div>
                        <!-- Gear indicator -->
                        <div class="mt-2 text-center">
                            <span class="text-3xl font-bold text-amber-400">{{ currentGear }}</span>
                            <span class="ml-1 text-xs text-gray-600">marcha</span>
                        </div>
                    </div>

                    <!-- Divider -->
                    <div class="h-16 w-px bg-gray-700"></div>

                    <!-- Fuel -->
                    <div class="w-28">
                        <div class="mb-1 flex items-baseline justify-between">
                            <span class="text-xs text-gray-500">⛽ Fuel</span>
                            <span class="font-mono text-xs tabular-nums text-gray-400">{{ currentFuel }} L</span>
                        </div>
                        <div class="h-3 w-full overflow-hidden rounded-full bg-gray-800">
                            <div
                                class="h-full rounded-full transition-all duration-300"
                                :class="fuelBarColor"
                                :style="{ width: fuelPercent + '%' }"
                            ></div>
                        </div>
                        <p class="mt-1 text-center text-[10px] text-gray-600">{{ fuelPercent }}%</p>
                    </div>
                </div>
            </div>

            <!-- Bus info — top right (below nav) -->
            <div class="absolute right-4 top-14 rounded bg-black/50 px-3 py-2 text-right text-xs backdrop-blur">
                <p class="text-amber-400">{{ bus?.model }}</p>
                <p class="text-gray-500">{{ bus?.generation }}</p>
                <p v-if="bus?.nickname" class="italic text-gray-600">"{{ bus.nickname }}"</p>
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
