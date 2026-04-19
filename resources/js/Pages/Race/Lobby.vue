<script setup>
import { ref, computed } from 'vue';
import { Link, usePage, router } from '@inertiajs/vue3';

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

const canStart = computed(() => selectedBusId.value && selectedMapId.value);

function startDrive() {
    if (!canStart.value) return;
    router.get('/race/play', {
        bus: selectedBusId.value,
        map: selectedMapId.value,
    });
}

function logout() {
    router.post('/logout');
}
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
            <h1 class="mb-8 text-2xl font-bold">Recorrido Libre</h1>

            <!-- Empty garage -->
            <div v-if="buses.length === 0" class="rounded-lg border border-gray-800 bg-gray-800/50 p-12 text-center">
                <p class="text-lg text-gray-400">No tienes guaguas todavía.</p>
                <p class="mt-2 text-sm text-gray-500">Visita el garaje para adquirir tu primer vehículo.</p>
                <Link href="/garage" class="mt-4 inline-block rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">
                    Ir al Garaje
                </Link>
            </div>

            <template v-else>
                <!-- ── Bus selection ─────────────────────────────── -->
                <section class="mb-10">
                    <h2 class="mb-4 text-lg font-semibold text-gray-300">Elige tu guagua</h2>
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <button
                            v-for="bus in buses"
                            :key="bus.id"
                            @click="selectedBusId = bus.id"
                            class="rounded-lg border p-4 text-left transition"
                            :class="selectedBusId === bus.id
                                ? 'border-amber-500 bg-amber-500/10'
                                : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'"
                        >
                            <div
                                class="mb-3 h-1.5 w-full rounded-full"
                                :style="{ backgroundColor: bus.paint_hex }"
                            ></div>
                            <h3 class="font-semibold" :class="selectedBusId === bus.id ? 'text-amber-400' : 'text-white'">
                                {{ bus.model }}
                            </h3>
                            <p class="text-sm text-gray-400">{{ bus.generation }}</p>
                            <p v-if="bus.nickname" class="mt-1 text-xs italic text-amber-400/70">"{{ bus.nickname }}"</p>
                            <div class="mt-3 flex gap-4 text-xs text-gray-500">
                                <span>{{ bus.engine_hp }} HP</span>
                                <span>{{ bus.base_weight_kg.toLocaleString() }} kg</span>
                                <span>{{ bus.fuel_capacity_liters }} L</span>
                            </div>
                        </button>
                    </div>
                </section>

                <!-- ── Map selection ─────────────────────────────── -->
                <section class="mb-10">
                    <h2 class="mb-4 text-lg font-semibold text-gray-300">Elige el mapa</h2>
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <button
                            v-for="map in maps"
                            :key="map.id"
                            @click="selectedMapId = map.id"
                            class="rounded-lg border p-5 text-left transition"
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

                <!-- ── Selected summary + start ──────────────────── -->
                <div class="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 p-5">
                    <div v-if="selectedBus" class="text-sm">
                        <span class="text-gray-500">Guagua:</span>
                        <span class="ml-1 font-semibold text-amber-400">{{ selectedBus.model }}</span>
                        <span class="ml-1 text-gray-600">{{ selectedBus.generation }}</span>
                        <span class="mx-3 text-gray-700">|</span>
                        <span class="text-gray-500">Mapa:</span>
                        <span class="ml-1 font-semibold text-cyan-400">{{ maps.find(m => m.id === selectedMapId)?.name }}</span>
                    </div>
                    <div v-else class="text-sm text-gray-500">Selecciona una guagua y un mapa</div>
                    <button
                        @click="startDrive"
                        :disabled="!canStart"
                        class="rounded-md px-6 py-3 text-sm font-bold transition"
                        :class="canStart
                            ? 'bg-amber-500 text-black hover:bg-amber-400'
                            : 'cursor-not-allowed bg-gray-700 text-gray-500'"
                    >
                        Iniciar Recorrido
                    </button>
                </div>
            </template>
        </div>
    </div>
</template>
