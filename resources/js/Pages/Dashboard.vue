<script setup>
import { Link, usePage, router } from '@inertiajs/vue3';
import { computed } from 'vue';

const user = computed(() => usePage().props.auth.user);

function logout() {
    router.post('/logout');
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-gray-900 px-4">
        <div class="w-full max-w-md space-y-6 text-center">
            <h1 class="text-3xl font-bold text-amber-400">🚌 Hot Bus Drive</h1>
            <p class="text-lg text-gray-300">
                Welcome, <span class="font-semibold text-white">{{ user?.name }}</span>!
            </p>

            <div class="flex flex-col gap-3">
                <Link
                    href="/garage"
                    class="rounded-md bg-amber-500 px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-amber-400"
                >
                    🔧 Mi Garaje
                </Link>
                <Link
                    href="/gas-station"
                    class="rounded-md bg-green-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-500"
                >
                    ⛽ Gasolinera
                </Link>
                <Link
                    href="/race"
                    class="rounded-md bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                    🏁 Carrera
                </Link>
            </div>

            <Link
                v-if="user?.name === 'dev'"
                href="/admin/assign-buses"
                class="inline-block rounded-md border border-purple-600 px-6 py-2 text-sm font-semibold text-purple-400 transition hover:bg-purple-600 hover:text-white"
            >
                ⚙️ Admin — Asignar Guaguas
            </Link>

            <button
                @click="logout"
                class="rounded-md border border-gray-600 px-6 py-2 text-sm text-gray-300 transition hover:border-red-500 hover:text-red-400"
            >
                Logout
            </button>
        </div>
    </div>
</template>
