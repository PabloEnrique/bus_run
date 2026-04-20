<script setup>
import { Link, usePage, router } from '@inertiajs/vue3';
import { computed, ref } from 'vue';

const props = defineProps({
    users: Array,
    buses: Array,
});

const user = computed(() => usePage().props.auth.user);
const processing = ref(null); // "userId-busId" while request in flight

function hasBus(u, busId) {
    return u.bus_ids.includes(busId);
}

function toggle(u, busId) {
    const key = `${u.id}-${busId}`;
    if (processing.value === key) return;
    processing.value = key;

    const action = hasBus(u, busId) ? 'detach' : 'attach';

    router.post('/admin/assign-buses', {
        user_id: u.id,
        bus_id: busId,
        action,
    }, {
        preserveScroll: true,
        onFinish: () => { processing.value = null; },
    });
}

function logout() { router.post('/logout'); }
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

        <div class="mx-auto max-w-7xl px-6 py-8">
            <h1 class="mb-2 text-2xl font-bold">Asignar Guaguas</h1>
            <p class="mb-6 text-sm text-gray-400">
                Marca las casillas para asignar o remover guaguas del garaje de cada usuario.
            </p>

            <div class="overflow-x-auto rounded-lg border border-gray-800">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-800 bg-gray-800/60">
                            <th class="sticky left-0 z-10 bg-gray-800/90 px-4 py-3 text-left font-semibold text-gray-300">
                                Usuario
                            </th>
                            <th v-for="bus in buses" :key="bus.id"
                                class="min-w-[100px] px-3 py-3 text-center">
                                <div class="text-xs font-semibold text-white">{{ bus.model }}</div>
                                <div class="text-[10px] text-gray-500">{{ bus.generation }}</div>
                                <div class="mt-1 text-[10px] text-gray-600">{{ bus.engine_hp }} HP · {{ (bus.base_weight_kg / 1000).toFixed(1) }}t</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="u in users" :key="u.id"
                            class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td class="sticky left-0 z-10 bg-gray-900 px-4 py-3 font-medium text-white">
                                {{ u.name }}
                                <span class="ml-1 text-xs text-gray-600">#{{ u.id }}</span>
                            </td>
                            <td v-for="bus in buses" :key="bus.id"
                                class="px-3 py-3 text-center">
                                <button
                                    @click="toggle(u, bus.id)"
                                    :disabled="processing === `${u.id}-${bus.id}`"
                                    class="inline-flex h-6 w-6 items-center justify-center rounded transition-colors"
                                    :class="hasBus(u, bus.id)
                                        ? 'bg-amber-500 text-gray-900 hover:bg-amber-400'
                                        : 'bg-gray-700 text-gray-500 hover:bg-gray-600 hover:text-gray-300'"
                                >
                                    <svg v-if="processing === `${u.id}-${bus.id}`"
                                         class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10"
                                                stroke="currentColor" stroke-width="4" fill="none"/>
                                        <path class="opacity-75" fill="currentColor"
                                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                    <svg v-else-if="hasBus(u, bus.id)"
                                         class="h-4 w-4" fill="none" viewBox="0 0 24 24"
                                         stroke="currentColor" stroke-width="3">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                                    </svg>
                                    <span v-else class="text-xs">—</span>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="users.length === 0"
                 class="mt-6 rounded-lg border border-gray-800 bg-gray-800/50 p-8 text-center text-gray-400">
                No hay usuarios registrados.
            </div>
        </div>
    </div>
</template>
