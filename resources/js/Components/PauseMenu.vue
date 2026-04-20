<!-- file: resources/js/Components/PauseMenu.vue -->
<!-- Full-screen pause overlay with options:
     Continue, Controls Config, Workshop, and Exit to lobby. -->
<script setup>
import { ref } from 'vue';
import { Link } from '@inertiajs/vue3';
import ControlsConfig from './ControlsConfig.vue';
import BusWorkshop from './BusWorkshop.vue';

const props = defineProps({
    /** Current bus specs — passed to Workshop for tuning */
    bus: { type: Object, default: null },
});

const emit = defineEmits(['resume', 'tuning-applied']);

/** Which sub-panel is visible: null | 'controls' | 'workshop' */
const activePanel = ref(null);

/** Resume the game — emits event to parent (Track.vue) */
function resume() {
    activePanel.value = null;
    emit('resume');
}

/** Handle tuning applied from Workshop */
function onTuningApplied(overrides) {
    activePanel.value = null;
    emit('tuning-applied', overrides);
}
</script>

<template>
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <!-- Controls config sub-panel -->
        <ControlsConfig v-if="activePanel === 'controls'" @close="activePanel = null" />

        <!-- Workshop sub-panel -->
        <BusWorkshop v-else-if="activePanel === 'workshop' && bus" :bus="bus" :in-race="true"
            @close="activePanel = null" @applied="onTuningApplied" />

        <!-- Main pause menu -->
        <div v-else class="w-72 rounded-xl bg-gray-900/95 p-6 text-center backdrop-blur">
            <h2 class="mb-6 text-2xl font-bold text-amber-400">Pausa</h2>

            <div class="space-y-3">
                <!-- Continue -->
                <button
                    @click="resume"
                    class="w-full rounded-lg bg-amber-500 py-3 text-lg font-semibold text-black transition hover:bg-amber-400"
                >
                    Continuar
                </button>

                <!-- Controls Config -->
                <button
                    @click="activePanel = 'controls'"
                    class="w-full rounded-lg border border-gray-600 bg-gray-800 py-3 text-lg text-white transition hover:border-amber-400 hover:bg-gray-700"
                >
                    Configuración de Controles
                </button>

                <!-- Workshop -->
                <button
                    v-if="bus"
                    @click="activePanel = 'workshop'"
                    class="w-full rounded-lg border border-gray-600 bg-gray-800 py-3 text-lg text-white transition hover:border-amber-400 hover:bg-gray-700"
                >
                    🔧 Taller
                </button>

                <!-- Exit to lobby -->
                <Link
                    href="/race"
                    class="block w-full rounded-lg border border-red-800 bg-red-900/50 py-3 text-lg text-red-300 transition hover:bg-red-800"
                >
                    Salir
                </Link>
            </div>

            <p class="mt-4 text-xs text-gray-600">Presiona ESC para continuar</p>
        </div>
    </div>
</template>
