<script setup>
import { usePage, router } from '@inertiajs/vue3';
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
            <p class="text-sm text-gray-500">Dashboard coming soon — garage, lobby, and races.</p>

            <button
                @click="logout"
                class="rounded-md border border-gray-600 px-6 py-2 text-sm text-gray-300 transition hover:border-red-500 hover:text-red-400"
            >
                Logout
            </button>
        </div>
    </div>
</template>
