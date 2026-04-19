<script setup>
import { Link, usePage, router } from '@inertiajs/vue3';
import { computed } from 'vue';

const props = defineProps({
    buses: Array,
});

const user = computed(() => usePage().props.auth.user);

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
                <Link href="/dashboard" class="text-sm text-gray-400 hover:text-white">Dashboard</Link>
                <button @click="logout" class="text-sm text-gray-500 hover:text-red-400">Logout</button>
            </div>
        </nav>

        <div class="mx-auto max-w-5xl px-6 py-8">
            <h1 class="mb-6 text-2xl font-bold">Mi Garaje</h1>

            <!-- Empty state -->
            <div v-if="buses.length === 0" class="rounded-lg border border-gray-800 bg-gray-800/50 p-12 text-center">
                <p class="text-lg text-gray-400">No tienes guaguas todavía.</p>
                <p class="mt-2 text-sm text-gray-500">Completa tu primera carrera para desbloquear vehículos.</p>
            </div>

            <!-- Bus grid -->
            <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                    v-for="bus in buses"
                    :key="bus.id"
                    :href="`/garage/${bus.id}`"
                    class="group rounded-lg border border-gray-800 bg-gray-800/50 p-5 transition hover:border-amber-500/50 hover:bg-gray-800"
                >
                    <!-- Color accent bar -->
                    <div
                        class="mb-4 h-2 w-full rounded-full"
                        :style="{ backgroundColor: bus.paint_hex }"
                    ></div>

                    <h2 class="text-lg font-semibold text-white group-hover:text-amber-400">
                        {{ bus.model }}
                    </h2>
                    <p class="text-sm text-gray-400">{{ bus.generation }}</p>

                    <div v-if="bus.nickname" class="mt-1 text-xs italic text-amber-400/70">
                        "{{ bus.nickname }}"
                    </div>

                    <!-- Quick stats -->
                    <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span class="text-gray-500">Torque</span>
                            <p class="font-mono font-semibold text-amber-300">{{ bus.engine_torque_nm }} Nm</p>
                        </div>
                        <div>
                            <span class="text-gray-500">Peso</span>
                            <p class="font-mono font-semibold text-blue-300">{{ bus.base_weight_kg.toLocaleString() }} kg</p>
                        </div>
                        <div>
                            <span class="text-gray-500">Combustible</span>
                            <p class="font-mono font-semibold text-green-300">{{ bus.fuel_capacity_liters }} L</p>
                        </div>
                        <div>
                            <span class="text-gray-500">Marchas</span>
                            <p class="font-mono font-semibold text-purple-300">{{ Object.keys(bus.gear_ratios).filter(k => k !== 'R').length }}</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    </div>
</template>
