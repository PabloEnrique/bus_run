<!-- file: resources/js/Components/ControlsConfig.vue -->
<!-- Key rebinding UI panel. Each action shows its current key;
     clicking enters "listening" mode to capture a new key. -->
<script setup>
import { ref } from 'vue';
import { keybindings, resetBindings, ACTION_LABELS } from '../GameEngine/KeybindingsStore.js';

const emit = defineEmits(['close']);

/** Which action is currently waiting for a keypress (null = none) */
const listeningAction = ref(null);

/**
 * Enter listening mode for a specific action.
 * The next keypress will be captured and bound.
 * @param {string} action — action name (e.g. 'throttle')
 */
function startListening(action) {
    listeningAction.value = action;
    // Attach a one-shot listener to capture the next key
    window.addEventListener('keydown', captureKey, { once: true });
}

/**
 * Capture a keypress and assign it to the listening action.
 * Prevents default to avoid triggering game controls.
 * @param {KeyboardEvent} e
 */
function captureKey(e) {
    e.preventDefault();
    e.stopPropagation();
    if (listeningAction.value) {
        keybindings[listeningAction.value] = e.key.toLowerCase();
    }
    listeningAction.value = null;
}

/**
 * Cancel listening mode without binding.
 */
function cancelListening() {
    listeningAction.value = null;
    window.removeEventListener('keydown', captureKey);
}

/**
 * Format key name for display (capitalize, handle special keys).
 * @param {string} key
 * @returns {string}
 */
function formatKey(key) {
    if (!key) return '—';
    if (key === ' ') return 'Espacio';
    if (key === 'escape') return 'ESC';
    if (key === 'arrowup') return '↑';
    if (key === 'arrowdown') return '↓';
    if (key === 'arrowleft') return '←';
    if (key === 'arrowright') return '→';
    return key.toUpperCase();
}

/** List of action keys to display in order */
const actions = ['throttle', 'brake', 'steerLeft', 'steerRight', 'shiftUp', 'shiftDown', 'pause'];
</script>

<template>
    <div class="w-80 rounded-xl bg-gray-900/95 p-5 backdrop-blur">
        <h3 class="mb-4 text-center text-lg font-bold text-amber-400">Configuración de Controles</h3>

        <div class="space-y-2">
            <div
                v-for="action in actions"
                :key="action"
                class="flex items-center justify-between rounded-lg bg-gray-800/60 px-3 py-2"
            >
                <!-- Action label -->
                <span class="text-sm text-gray-300">{{ ACTION_LABELS[action] }}</span>

                <!-- Key button: click to rebind -->
                <button
                    @click.stop="startListening(action)"
                    class="min-w-[60px] rounded border px-3 py-1 text-center text-sm font-mono transition"
                    :class="listeningAction === action
                        ? 'border-amber-400 bg-amber-400/20 text-amber-300 animate-pulse'
                        : 'border-gray-600 bg-gray-700 text-white hover:border-amber-400 hover:bg-gray-600'"
                >
                    {{ listeningAction === action ? '...' : formatKey(keybindings[action]) }}
                </button>
            </div>
        </div>

        <!-- Bottom actions -->
        <div class="mt-4 flex items-center justify-between">
            <button
                @click="resetBindings()"
                class="text-xs text-gray-500 hover:text-amber-400 transition"
            >
                Restaurar por defecto
            </button>
            <button
                @click="emit('close')"
                class="rounded bg-amber-500 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-400 transition"
            >
                Listo
            </button>
        </div>
    </div>
</template>
