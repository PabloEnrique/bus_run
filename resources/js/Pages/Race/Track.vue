<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { usePage, Link } from '@inertiajs/vue3';
import { PhysicsWorld } from '../../GameEngine/PhysicsWorld.js';
import { SceneManager } from '../../GameEngine/SceneManager.js';
import { NetworkManager } from '../../GameEngine/NetworkManager.js';

const props = defineProps({
    bus: Object,
    userId: Number,
});

const user = computed(() => usePage().props.auth.user);
const canvasRef = ref(null);
const currentSpeed = ref(0);
const connected = ref(false);
const noBus = computed(() => !props.bus);

let physics = null;
let scene = null;
let network = null;
let playerMesh = null;
let animFrame = null;
let lastTime = 0;

// Input state
const keys = { w: false, a: false, s: false, d: false };

function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
}

function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
}

function hexToInt(hex) {
    return parseInt((hex || '#FFB300').replace('#', ''), 16);
}

async function initGame() {
    if (!props.bus || !canvasRef.value) return;

    // Physics
    physics = new PhysicsWorld();
    physics.createVehicle({
        base_weight_kg: props.bus.base_weight_kg,
        suspension_stiffness: props.bus.suspension_stiffness,
    });

    // Scene
    scene = new SceneManager(canvasRef.value);
    const color = hexToInt(props.bus.paint_hex);
    playerMesh = scene.createBusMesh(color);

    // Network
    network = new NetworkManager('ws://localhost:2567');
    network.onPlayerJoin((sessionId, player) => {
        scene.addRemotePlayer(sessionId, 0x4488ff);
    });
    network.onPlayerUpdate((sessionId, pos) => {
        scene.updateRemotePlayer(sessionId, pos);
    });
    network.onPlayerLeave((sessionId) => {
        scene.removeRemotePlayer(sessionId);
    });

    try {
        await network.joinRace({
            userId: props.userId,
            torque: props.bus.engine_torque_nm,
            weight: props.bus.base_weight_kg,
        });
        connected.value = true;
    } catch (err) {
        console.warn('[Race] Could not connect to game server:', err.message);
    }

    // Input
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Start loop
    lastTime = performance.now();
    gameLoop();
}

function gameLoop() {
    animFrame = requestAnimationFrame(gameLoop);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (!physics || !physics.vehicle || !scene) return;

    // Input → physics
    const maxForce = (props.bus.engine_torque_nm || 400) * 3;
    const maxSteer = 0.4;
    const brakeForce = 50;

    let engineForce = 0;
    let steering = 0;
    let brake = 0;

    if (keys.w) engineForce = maxForce;
    if (keys.s) { engineForce = -maxForce * 0.5; brake = brakeForce; }
    if (keys.a) steering = maxSteer;
    if (keys.d) steering = -maxSteer;

    // Apply to rear wheels (indices 2, 3)
    physics.vehicle.applyEngineForce(engineForce, 2);
    physics.vehicle.applyEngineForce(engineForce, 3);

    // Steering on front wheels (indices 0, 1)
    physics.vehicle.setSteeringValue(steering, 0);
    physics.vehicle.setSteeringValue(steering, 1);

    // Brake on all wheels
    for (let i = 0; i < 4; i++) {
        physics.vehicle.setBrake(keys.s ? brake : 0, i);
    }

    // Step physics
    physics.step(dt);

    // Sync visual
    scene.syncMeshToBody(playerMesh, physics.chassisBody, physics.wheelBodies);

    // Speed HUD
    const vel = physics.chassisBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z) * 3.6; // m/s → km/h
    currentSpeed.value = Math.round(speed);

    // Camera
    scene.updateCamera(playerMesh);

    // Network sync
    if (network && connected.value) {
        const pos = physics.chassisBody.position;
        const euler = playerMesh.rotation;
        network.sendPosition({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            rotation: euler.y,
            speed: speed,
        });
    }

    // Render
    scene.render();
}

onMounted(() => {
    initGame();
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

        <!-- Game canvas -->
        <canvas v-show="!noBus" ref="canvasRef" class="block h-full w-full" />

        <!-- HUD Overlay -->
        <div v-if="!noBus" class="pointer-events-none absolute inset-0">
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

            <!-- Bottom HUD -->
            <div class="absolute bottom-6 left-1/2 -translate-x-1/2">
                <div class="rounded-xl bg-black/60 px-8 py-4 text-center backdrop-blur">
                    <p class="text-4xl font-bold tabular-nums text-white">{{ currentSpeed }}</p>
                    <p class="text-xs uppercase tracking-widest text-gray-400">km/h</p>
                </div>
            </div>

            <!-- Bus info -->
            <div class="absolute bottom-6 right-4 rounded bg-black/50 px-3 py-2 text-right text-xs backdrop-blur">
                <p class="text-amber-400">{{ bus?.model }}</p>
                <p class="text-gray-500">{{ bus?.generation }}</p>
                <p v-if="bus?.nickname" class="italic text-gray-600">"{{ bus.nickname }}"</p>
            </div>

            <!-- Controls hint -->
            <div class="absolute bottom-6 left-4 rounded bg-black/50 px-3 py-2 text-xs text-gray-500 backdrop-blur">
                <p><kbd class="text-white">W</kbd> Acelerar</p>
                <p><kbd class="text-white">S</kbd> Frenar</p>
                <p><kbd class="text-white">A</kbd><kbd class="text-white">D</kbd> Girar</p>
            </div>
        </div>
    </div>
</template>
