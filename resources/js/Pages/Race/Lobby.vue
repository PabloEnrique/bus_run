<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Link, usePage, router } from '@inertiajs/vue3';
import { NetworkManager } from '../../GameEngine/NetworkManager.js';

const props = defineProps({
    buses: Array,
    maps: Array,
});

const user = computed(() => usePage().props.auth.user);

const selectedBusId = ref(props.buses?.[0]?.id ?? null);
const selectedMapId = ref(props.maps?.[0]?.id ?? null);

const selectedBus = computed(() =>
    props.buses.find((b) => b.id === selectedBusId.value) || null,
);

// ── Room system state ────────────────────────────────────
const activeTab = ref('create'); // 'create' | 'join'
const roomCode = ref('');
const availableRooms = ref([]);
const isLoadingRooms = ref(false);
const isCreating = ref(false);
const isJoining = ref(false);
const errorMsg = ref('');
let pollTimer = null;
let networkManager = null;

const canCreate = computed(() => selectedBusId.value && selectedMapId.value && !isCreating.value);
const canJoinByCode = computed(() => roomCode.value.trim().length === 4 && selectedBusId.value && !isJoining.value);

function getMapName(mapId) {
    return props.maps.find((m) => m.id === mapId)?.name || mapId;
}

// ── Room list polling ────────────────────────────────────
async function fetchRooms() {
    try {
        isLoadingRooms.value = true;
        if (!networkManager) {
            networkManager = new NetworkManager('ws://localhost:2567');
        }
        availableRooms.value = await networkManager.listRooms();
    } catch {
        availableRooms.value = [];
    } finally {
        isLoadingRooms.value = false;
    }
}

function startPolling() {
    fetchRooms();
    pollTimer = setInterval(fetchRooms, 5000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// ── Create room → navigate to Track ─────────────────────
async function createRoom() {
    if (!canCreate.value) return;
    errorMsg.value = '';
    isCreating.value = true;

    try {
        if (!networkManager) {
            networkManager = new NetworkManager('ws://localhost:2567');
        }
        const result = await networkManager.createRoom({
            mapId: selectedMapId.value,
            userId: String(user.value?.id),
            weight: selectedBus.value?.base_weight_kg || 0,
            paintHex: selectedBus.value?.paint_hex || '#FFB300',
            busModel: selectedBus.value?.model || '',
        });

        // Leave the room — Track.vue will reconnect by code
        await networkManager.leave();

        router.get('/race/play', {
            bus: selectedBusId.value,
            map: result.mapId || selectedMapId.value,
            room: result.roomCode,
        });
    } catch (err) {
        console.error('[Lobby] createRoom error:', err);
        errorMsg.value = err?.message?.includes('undefined')
            ? 'No se pudo conectar al servidor de juego. Verifica que esté corriendo.'
            : (err?.message || 'Error al crear la sala.');
        isCreating.value = false;
    }
}

// ── Join by code → navigate to Track ────────────────────
async function joinByCode() {
    if (!canJoinByCode.value) return;
    errorMsg.value = '';
    isJoining.value = true;

    try {
        if (!networkManager) {
            networkManager = new NetworkManager('ws://localhost:2567');
        }
        const code = roomCode.value.trim().toUpperCase();
        const result = await networkManager.joinByCode(code, {
            userId: String(user.value?.id),
            weight: selectedBus.value?.base_weight_kg || 0,
            paintHex: selectedBus.value?.paint_hex || '#FFB300',
            busModel: selectedBus.value?.model || '',
        });

        await networkManager.leave();

        router.get('/race/play', {
            bus: selectedBusId.value,
            map: result.mapId,
            room: code,
        });
    } catch (err) {
        console.error('[Lobby] joinByCode error:', err);
        errorMsg.value = err?.message?.includes('undefined')
            ? 'No se pudo conectar al servidor de juego. Verifica que esté corriendo.'
            : (err?.message || 'Sala no encontrada.');
        isJoining.value = false;
    }
}

// ── Join from room list → navigate to Track ─────────────
async function joinRoom(room) {
    if (!selectedBusId.value || isJoining.value) return;
    errorMsg.value = '';
    isJoining.value = true;

    try {
        router.get('/race/play', {
            bus: selectedBusId.value,
            map: room.mapId,
            room: room.roomCode,
        });
    } catch (err) {
        errorMsg.value = err?.message || 'Error al unirse.';
        isJoining.value = false;
    }
}

// ── Solo drive (no room) ────────────────────────────────
function startSolo() {
    if (!selectedBusId.value || !selectedMapId.value) return;
    router.get('/race/play', {
        bus: selectedBusId.value,
        map: selectedMapId.value,
    });
}

function logout() {
    router.post('/logout');
}

onMounted(() => startPolling());
onBeforeUnmount(() => {
    stopPolling();
    networkManager?.dispose();
});
</script>

<template>
    <div class="min-h-screen bg-gray-900 text-white">
        <!-- Nav -->
        <nav class="flex items-center justify-between border-b border-gray-800 px-6 py-4">
            <Link href="/dashboard" class="text-xl font-bold text-amber-400">🚌 Hot Bus Drive</Link>
            <div class="flex items-center gap-4">
                <span class="text-sm text-gray-400">{{ user?.name }}</span>
                <Link href="/garage" class="text-sm text-gray-400 hover:text-white">Garaje</Link>
                <Link href="/dashboard" class="text-sm text-gray-400 hover:text-white">Dashboard</Link>
                <button @click="logout" class="text-sm text-gray-500 hover:text-red-400">Logout</button>
            </div>
        </nav>

        <div class="mx-auto max-w-5xl px-6 py-8">
            <h1 class="mb-8 text-2xl font-bold">Multijugador</h1>

            <!-- Empty garage -->
            <div v-if="buses.length === 0" class="rounded-lg border border-gray-800 bg-gray-800/50 p-12 text-center">
                <p class="text-lg text-gray-400">No tienes guaguas todavía.</p>
                <p class="mt-2 text-sm text-gray-500">Visita el garaje para adquirir tu primer vehículo.</p>
                <Link href="/garage" class="mt-4 inline-block rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">
                    Ir al Garaje
                </Link>
            </div>

            <template v-else>
                <!-- ── Bus selection (shared) ────────────────────── -->
                <section class="mb-8">
                    <h2 class="mb-4 text-lg font-semibold text-gray-300">Tu guagua</h2>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <button
                            v-for="bus in buses"
                            :key="bus.id"
                            @click="selectedBusId = bus.id"
                            class="rounded-lg border p-3 text-left transition"
                            :class="selectedBusId === bus.id
                                ? 'border-amber-500 bg-amber-500/10'
                                : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'"
                        >
                            <div class="mb-2 h-1 w-full rounded-full" :style="{ backgroundColor: bus.paint_hex }"></div>
                            <h3 class="text-sm font-semibold" :class="selectedBusId === bus.id ? 'text-amber-400' : 'text-white'">
                                {{ bus.model }}
                            </h3>
                            <p class="text-xs text-gray-400">{{ bus.generation }}</p>
                            <div class="mt-2 flex gap-3 text-xs text-gray-500">
                                <span>{{ bus.engine_hp }} HP</span>
                                <span>{{ bus.base_weight_kg?.toLocaleString() }} kg</span>
                            </div>
                        </button>
                    </div>
                </section>

                <!-- ── Tab switcher ──────────────────────────────── -->
                <div class="mb-6 flex gap-1 rounded-lg bg-gray-800/50 p-1">
                    <button
                        @click="activeTab = 'create'"
                        class="flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition"
                        :class="activeTab === 'create'
                            ? 'bg-amber-500 text-black'
                            : 'text-gray-400 hover:text-white'"
                    >
                        Crear Sala
                    </button>
                    <button
                        @click="activeTab = 'join'"
                        class="flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition"
                        :class="activeTab === 'join'
                            ? 'bg-cyan-500 text-black'
                            : 'text-gray-400 hover:text-white'"
                    >
                        Unirse a Sala
                    </button>
                </div>

                <!-- Error message -->
                <div v-if="errorMsg" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {{ errorMsg }}
                </div>

                <!-- ═══════ CREATE TAB ═══════ -->
                <div v-if="activeTab === 'create'">
                    <!-- Map selection -->
                    <section class="mb-6">
                        <h2 class="mb-4 text-lg font-semibold text-gray-300">Elige el mapa</h2>
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                v-for="map in maps"
                                :key="map.id"
                                @click="selectedMapId = map.id"
                                class="rounded-lg border p-4 text-left transition"
                                :class="selectedMapId === map.id
                                    ? 'border-cyan-500 bg-cyan-500/10'
                                    : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'"
                            >
                                <h3 class="font-semibold" :class="selectedMapId === map.id ? 'text-cyan-400' : 'text-white'">
                                    {{ map.name }}
                                </h3>
                                <p v-if="map.description" class="mt-1 text-sm text-gray-400">{{ map.description }}</p>
                            </button>
                        </div>
                    </section>

                    <!-- Create actions -->
                    <div class="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-800/50 p-5">
                        <div class="flex-1 text-sm">
                            <span class="text-gray-500">Guagua:</span>
                            <span class="ml-1 font-semibold text-amber-400">{{ selectedBus?.model }}</span>
                            <span class="mx-2 text-gray-700">|</span>
                            <span class="text-gray-500">Mapa:</span>
                            <span class="ml-1 font-semibold text-cyan-400">{{ maps.find(m => m.id === selectedMapId)?.name }}</span>
                        </div>
                        <button
                            @click="createRoom"
                            :disabled="!canCreate"
                            class="rounded-md px-6 py-3 text-sm font-bold transition"
                            :class="canCreate
                                ? 'bg-amber-500 text-black hover:bg-amber-400'
                                : 'cursor-not-allowed bg-gray-700 text-gray-500'"
                        >
                            {{ isCreating ? 'Creando...' : 'Crear Sala' }}
                        </button>
                    </div>

                    <!-- Solo mode link -->
                    <div class="mt-4 text-center">
                        <button
                            @click="startSolo"
                            :disabled="!selectedBusId || !selectedMapId"
                            class="text-sm text-gray-500 underline hover:text-gray-300"
                        >
                            O conducir solo sin sala
                        </button>
                    </div>
                </div>

                <!-- ═══════ JOIN TAB ═══════ -->
                <div v-if="activeTab === 'join'">
                    <!-- Join by code -->
                    <section class="mb-8">
                        <h2 class="mb-3 text-lg font-semibold text-gray-300">Unirse con código</h2>
                        <div class="flex items-center gap-3">
                            <input
                                v-model="roomCode"
                                type="text"
                                maxlength="4"
                                placeholder="ABCD"
                                class="w-32 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-center text-lg font-mono font-bold uppercase tracking-widest text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                                @keyup.enter="joinByCode"
                            />
                            <button
                                @click="joinByCode"
                                :disabled="!canJoinByCode"
                                class="rounded-md px-6 py-3 text-sm font-bold transition"
                                :class="canJoinByCode
                                    ? 'bg-cyan-500 text-black hover:bg-cyan-400'
                                    : 'cursor-not-allowed bg-gray-700 text-gray-500'"
                            >
                                {{ isJoining ? 'Uniendo...' : 'Unirse' }}
                            </button>
                        </div>
                        <p v-if="!selectedBusId" class="mt-2 text-xs text-yellow-500">Selecciona una guagua primero</p>
                    </section>

                    <!-- Available rooms list -->
                    <section>
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-lg font-semibold text-gray-300">Salas disponibles</h2>
                            <button @click="fetchRooms" class="text-xs text-gray-500 hover:text-white" :disabled="isLoadingRooms">
                                {{ isLoadingRooms ? 'Cargando...' : 'Actualizar' }}
                            </button>
                        </div>

                        <div v-if="availableRooms.length === 0" class="rounded-lg border border-gray-800 bg-gray-800/50 p-8 text-center">
                            <p class="text-gray-500">{{ isLoadingRooms ? 'Buscando salas...' : 'No hay salas activas' }}</p>
                            <p class="mt-1 text-xs text-gray-600">Crea una para empezar a jugar</p>
                        </div>

                        <div v-else class="space-y-2">
                            <div
                                v-for="room in availableRooms"
                                :key="room.roomId"
                                class="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 px-5 py-4 transition hover:border-gray-700"
                            >
                                <div class="flex items-center gap-6">
                                    <span class="font-mono text-lg font-bold tracking-widest text-cyan-400">{{ room.roomCode }}</span>
                                    <div>
                                        <p class="text-sm font-semibold text-white">{{ getMapName(room.mapId) }}</p>
                                        <p class="text-xs text-gray-500">
                                            {{ room.clients }}/{{ room.maxClients }} jugadores
                                        </p>
                                    </div>
                                </div>
                                <button
                                    @click="joinRoom(room)"
                                    :disabled="!selectedBusId || isJoining || room.clients >= room.maxClients"
                                    class="rounded-md px-4 py-2 text-sm font-semibold transition"
                                    :class="selectedBusId && room.clients < room.maxClients
                                        ? 'bg-cyan-500 text-black hover:bg-cyan-400'
                                        : 'cursor-not-allowed bg-gray-700 text-gray-500'"
                                >
                                    {{ room.clients >= room.maxClients ? 'Llena' : 'Unirse' }}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </template>
        </div>
    </div>
</template>
