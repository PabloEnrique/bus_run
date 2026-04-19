<script setup>
import { useForm, Link } from '@inertiajs/vue3';

const form = useForm({
    name: '',
    password: '',
    password_confirmation: '',
});

function submit() {
    form.post('/register');
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-gray-900 px-4">
        <div class="w-full max-w-sm space-y-6">
            <div class="text-center">
                <h1 class="text-3xl font-bold text-amber-400">🚌 Hot Bus Drive</h1>
                <p class="mt-2 text-sm text-gray-400">Create your driver account</p>
            </div>

            <form @submit.prevent="submit" class="space-y-4">
                <div>
                    <label for="name" class="block text-sm font-medium text-gray-300">Username</label>
                    <input
                        id="name"
                        v-model="form.name"
                        type="text"
                        autocomplete="username"
                        required
                        class="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="your_username"
                    />
                    <p v-if="form.errors.name" class="mt-1 text-sm text-red-400">{{ form.errors.name }}</p>
                </div>

                <div>
                    <label for="password" class="block text-sm font-medium text-gray-300">Password</label>
                    <input
                        id="password"
                        v-model="form.password"
                        type="password"
                        autocomplete="new-password"
                        required
                        class="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="••••••"
                    />
                    <p v-if="form.errors.password" class="mt-1 text-sm text-red-400">{{ form.errors.password }}</p>
                </div>

                <div>
                    <label for="password_confirmation" class="block text-sm font-medium text-gray-300">Confirm Password</label>
                    <input
                        id="password_confirmation"
                        v-model="form.password_confirmation"
                        type="password"
                        autocomplete="new-password"
                        required
                        class="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="••••••"
                    />
                </div>

                <button
                    type="submit"
                    :disabled="form.processing"
                    class="w-full rounded-md bg-amber-500 px-4 py-2 font-semibold text-gray-900 transition hover:bg-amber-400 disabled:opacity-50"
                >
                    <span v-if="form.processing">Creating account...</span>
                    <span v-else>Register</span>
                </button>
            </form>

            <p class="text-center text-sm text-gray-400">
                Already have an account?
                <Link href="/login" class="font-medium text-amber-400 hover:text-amber-300">Sign In</Link>
            </p>
        </div>
    </div>
</template>
