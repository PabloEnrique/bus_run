<script setup>
import { Link, usePage, router } from '@inertiajs/vue3';
import { computed } from 'vue';

const props = defineProps({
    bus: Object,
});

const user = computed(() => usePage().props.auth.user);

const forwardGears = computed(() => {
    return Object.entries(props.bus.gear_ratios)
        .filter(([key]) => key !== 'R')
        .sort(([a], [b]) => Number(a) - Number(b));
});

const reverseRatio = computed(() => props.bus.gear_ratios['R'] ?? null);

const powerToWeight = computed(() => {
    return (props.bus.engine_torque_nm / props.bus.base_weight_kg).toFixed(3);
});

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
                <button @click="logout" class="text-sm text-gray-500 hover:text-red-400">Logout</button>
            </div>
        </nav>

        <div class="mx-auto max-w-3xl px-6 py-8">
            <!-- Back link -->
            <Link href="/garage" class="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-amber-400">
                ← Volver al Garaje
            </Link>

            <!-- Header -->
            <div class="mt-4 flex items-start justify-between">
                <div>
                    <h1 class="text-3xl font-bold">{{ bus.model }}</h1>
                    <p class="mt-1 text-lg text-gray-400">{{ bus.generation }}</p>
                    <p v-if="bus.nickname" class="mt-1 text-sm italic text-amber-400/70">"{{ bus.nickname }}"</p>
                </div>
                <div
                    class="h-10 w-10 rounded-full border-2 border-gray-700"
                    :style="{ backgroundColor: bus.paint_hex }"
                    :title="bus.paint_hex"
                ></div>
            </div>

            <!-- Main specs -->
            <div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div class="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                    <p class="text-xs uppercase tracking-wider text-gray-500">Torque</p>
                    <p class="mt-1 text-2xl font-bold text-amber-300">{{ bus.engine_torque_nm }}</p>
                    <p class="text-xs text-gray-500">Nm</p>
                </div>
                <div class="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                    <p class="text-xs uppercase tracking-wider text-gray-500">Peso</p>
                    <p class="mt-1 text-2xl font-bold text-blue-300">{{ bus.base_weight_kg.toLocaleString() }}</p>
                    <p class="text-xs text-gray-500">kg</p>
                </div>
                <div class="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                    <p class="text-xs uppercase tracking-wider text-gray-500">Combustible</p>
                    <p class="mt-1 text-2xl font-bold text-green-300">{{ bus.fuel_capacity_liters }}</p>
                    <p class="text-xs text-gray-500">litros</p>
                </div>
                <div class="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                    <p class="text-xs uppercase tracking-wider text-gray-500">Suspensión</p>
                    <p class="mt-1 text-2xl font-bold text-purple-300">{{ bus.suspension_stiffness }}</p>
                    <p class="text-xs text-gray-500">rigidez</p>
                </div>
            </div>

            <!-- Power-to-weight -->
            <div class="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                <p class="text-xs uppercase tracking-wider text-amber-400/70">Relación Torque / Peso</p>
                <p class="mt-1 text-xl font-bold text-amber-400">{{ powerToWeight }} Nm/kg</p>
            </div>

            <!-- Gear ratios table -->
            <div class="mt-8">
                <h2 class="mb-3 text-lg font-semibold text-gray-300">Relaciones de Transmisión</h2>
                <div class="overflow-hidden rounded-lg border border-gray-800">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-800/80">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs uppercase tracking-wider text-gray-500">Marcha</th>
                                <th class="px-4 py-2 text-right text-xs uppercase tracking-wider text-gray-500">Ratio</th>
                                <th class="px-4 py-2 text-right text-xs uppercase tracking-wider text-gray-500">Visualización</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800">
                            <tr v-for="[gear, ratio] in forwardGears" :key="gear" class="hover:bg-gray-800/50">
                                <td class="px-4 py-2 font-mono font-semibold text-white">{{ gear }}ª</td>
                                <td class="px-4 py-2 text-right font-mono text-gray-300">{{ ratio.toFixed(2) }}</td>
                                <td class="px-4 py-2 text-right">
                                    <div class="ml-auto h-2 rounded-full bg-amber-400/80" :style="{ width: `${(ratio / 6) * 100}%` }"></div>
                                </td>
                            </tr>
                            <tr v-if="reverseRatio" class="hover:bg-gray-800/50">
                                <td class="px-4 py-2 font-mono font-semibold text-red-400">R</td>
                                <td class="px-4 py-2 text-right font-mono text-gray-300">{{ reverseRatio.toFixed(2) }}</td>
                                <td class="px-4 py-2 text-right">
                                    <div class="ml-auto h-2 rounded-full bg-red-400/80" :style="{ width: `${(reverseRatio / 6) * 100}%` }"></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>
