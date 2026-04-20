<script setup>
import { Link, useForm, usePage } from '@inertiajs/vue3';
import { computed, ref } from 'vue';

const props = defineProps({
    buses: Array,
    pricePerLiter: Number,
});

const user = computed(() => usePage().props.auth.user);
const flash = computed(() => usePage().props.flash);

const customAmounts = ref({});

function fuelPercent(bus) {
    if (bus.fuel_capacity_liters === 0) return 0;
    return Math.round((bus.current_fuel_liters / bus.fuel_capacity_liters) * 100);
}

function fuelBarColor(percent) {
    if (percent >= 70) return 'bg-green-500';
    if (percent >= 30) return 'bg-amber-500';
    return 'bg-red-500';
}

function maxCanBuy(bus) {
    const byCapacity = bus.fuel_capacity_liters - bus.current_fuel_liters;
    const byWallet = Math.floor(parseFloat(user.value.wallet_balance) / props.pricePerLiter);
    return Math.min(byCapacity, byWallet);
}

function refuel(garageId, liters) {
    if (liters <= 0) return;
    const form = useForm({
        garage_id: garageId,
        liters_to_buy: liters,
    });
    form.post('/gas-station/refuel', {
        preserveScroll: true,
    });
}

function fillTank(bus) {
    const liters = bus.fuel_capacity_liters - bus.current_fuel_liters;
    if (liters > 0) refuel(bus.garage_id, liters);
}

function refuelCustom(bus) {
    const liters = parseInt(customAmounts.value[bus.garage_id]) || 0;
    if (liters > 0) refuel(bus.garage_id, liters);
}
</script>

<template>
    <div class="min-h-screen bg-gray-900 text-white">
        <!-- Nav -->
        <nav class="flex items-center justify-between border-b border-gray-800 px-6 py-4">
            <Link href="/dashboard" class="text-xl font-bold text-amber-400">🚌 Hot Bus Drive</Link>
            <div class="flex items-center gap-4">
                <span class="font-mono text-sm text-green-400">${{ parseFloat(user?.wallet_balance || 0).toFixed(2) }}</span>
                <Link href="/dashboard" class="text-sm text-gray-400 hover:text-white">Dashboard</Link>
                <Link href="/garage" class="text-sm text-gray-400 hover:text-white">Garaje</Link>
            </div>
        </nav>

        <div class="mx-auto max-w-4xl px-6 py-8">
            <div class="mb-6 flex items-center justify-between">
                <h1 class="text-2xl font-bold">⛽ Gasolinera</h1>
                <div class="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2">
                    <span class="text-xs uppercase tracking-wider text-gray-500">Precio</span>
                    <p class="font-mono text-lg font-bold text-amber-400">${{ pricePerLiter }} / litro</p>
                </div>
            </div>

            <!-- Flash messages -->
            <div v-if="flash?.success" class="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                {{ flash.success }}
            </div>
            <div v-if="flash?.error" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {{ flash.error }}
            </div>

            <!-- Wallet -->
            <div class="mb-8 rounded-lg border border-amber-500/20 bg-amber-500/5 p-5 text-center">
                <p class="text-xs uppercase tracking-wider text-amber-400/70">Tu Billetera</p>
                <p class="mt-1 text-3xl font-bold text-amber-400">${{ parseFloat(user?.wallet_balance || 0).toFixed(2) }}</p>
            </div>

            <!-- Empty state -->
            <div v-if="buses.length === 0" class="rounded-lg border border-gray-800 bg-gray-800/50 p-12 text-center">
                <p class="text-lg text-gray-400">No tienes guaguas en tu garaje.</p>
                <Link href="/garage" class="mt-2 inline-block text-sm text-amber-400 hover:text-amber-300">Ir al Garaje →</Link>
            </div>

            <!-- Bus list -->
            <div v-else class="space-y-4">
                <div
                    v-for="bus in buses"
                    :key="bus.garage_id"
                    class="rounded-lg border border-gray-800 bg-gray-800/50 p-5"
                >
                    <div class="flex items-start justify-between">
                        <div>
                            <h2 class="text-lg font-semibold text-white">{{ bus.model }}</h2>
                            <p class="text-sm text-gray-400">{{ bus.generation }}</p>
                            <p v-if="bus.nickname" class="text-xs italic text-amber-400/70">"{{ bus.nickname }}"</p>
                        </div>
                        <div
                            class="h-6 w-6 rounded-full border border-gray-700"
                            :style="{ backgroundColor: bus.paint_hex }"
                        ></div>
                    </div>

                    <!-- Fuel bar -->
                    <div class="mt-4">
                        <div class="mb-1 flex items-center justify-between text-sm">
                            <span class="text-gray-400">Combustible</span>
                            <span class="font-mono text-gray-300">
                                {{ bus.current_fuel_liters }} / {{ bus.fuel_capacity_liters }} L
                            </span>
                        </div>
                        <div class="h-4 w-full overflow-hidden rounded-full bg-gray-700">
                            <div
                                class="h-full rounded-full transition-all duration-500"
                                :class="fuelBarColor(fuelPercent(bus))"
                                :style="{ width: fuelPercent(bus) + '%' }"
                            ></div>
                        </div>
                        <p class="mt-1 text-right text-xs text-gray-500">{{ fuelPercent(bus) }}%</p>
                    </div>

                    <!-- Refuel buttons -->
                    <div class="mt-4 flex flex-wrap items-center gap-2">
                        <button
                            v-for="amount in [5, 10, 25]"
                            :key="amount"
                            @click="refuel(bus.garage_id, amount)"
                            :disabled="amount > maxCanBuy(bus)"
                            class="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            +{{ amount }} L
                            <span class="ml-1 text-xs text-gray-400">${{ amount * pricePerLiter }}</span>
                        </button>

                        <button
                            @click="fillTank(bus)"
                            :disabled="bus.current_fuel_liters >= bus.fuel_capacity_liters || maxCanBuy(bus) <= 0"
                            class="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            🔝 Llenar
                            <span class="ml-1 text-xs text-amber-200">
                                ${{ (bus.fuel_capacity_liters - bus.current_fuel_liters) * pricePerLiter }}
                            </span>
                        </button>

                        <!-- Custom amount -->
                        <div class="flex items-center gap-1">
                            <input
                                v-model="customAmounts[bus.garage_id]"
                                type="number"
                                min="1"
                                :max="maxCanBuy(bus)"
                                placeholder="L"
                                class="w-16 rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-center text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                            />
                            <button
                                @click="refuelCustom(bus)"
                                :disabled="!customAmounts[bus.garage_id] || parseInt(customAmounts[bus.garage_id]) <= 0"
                                class="rounded-md bg-gray-700 px-2 py-1.5 text-sm text-white transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                ⛽
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
