<!-- file: resources/js/Components/BusWorkshop.vue -->
<!-- Workshop (Taller) panel for tuning bus engine parameters.
     Edits gear ratios, RPM range, torque band, and steering speed.
     Stores overrides per-bus in localStorage via TuningStore. -->
<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { getTuning, saveTuning, resetTuning } from '../GameEngine/TuningStore.js';

const props = defineProps({
    /** Full bus specs from catalog (original values) */
    bus: { type: Object, required: true },
    /** Whether we're in race mode (enables hot-reload messaging) */
    inRace: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'applied']);

// ── Load current tuning (overrides or original values) ────────
const tuning = reactive({
    engine_torque_nm: props.bus.engine_torque_nm,
    redline_rpm: props.bus.redline_rpm,
    idle_rpm: props.bus.idle_rpm,
    peak_torque_rpm_low: props.bus.peak_torque_rpm_low,
    peak_torque_rpm_high: props.bus.peak_torque_rpm_high,
    torque_idle_nm: props.bus.torque_idle_nm,
    torque_redline_nm: props.bus.torque_redline_nm,
    steering_speed: 1.0,
    gear_ratios: { ...props.bus.gear_ratios },
});

// Apply saved overrides on top of defaults
const saved = getTuning(props.bus.id);
if (saved && Object.keys(saved).length > 0) {
    for (const [key, val] of Object.entries(saved)) {
        if (key === 'gear_ratios' && typeof val === 'object') {
            tuning.gear_ratios = { ...val };
        } else if (key in tuning) {
            tuning[key] = val;
        }
    }
}

// ── Computed: forward gears sorted ────────────────────────────
const forwardGears = computed(() => {
    return Object.entries(tuning.gear_ratios)
        .filter(([k]) => k !== 'R')
        .sort(([a], [b]) => Number(a) - Number(b));
});

const reverseRatio = computed(() => tuning.gear_ratios['R'] ?? 4.0);

// ── Torque curve SVG preview points ───────────────────────────
const curvePath = computed(() => {
    const w = 280, h = 100;
    const anchors = [
        [0, 0],
        [tuning.idle_rpm, tuning.torque_idle_nm],
        [tuning.peak_torque_rpm_low, tuning.engine_torque_nm],
        [tuning.peak_torque_rpm_high, tuning.engine_torque_nm],
        [tuning.redline_rpm, tuning.torque_redline_nm],
    ];
    const maxRPM = tuning.redline_rpm || 3200;
    const maxTorque = Math.max(tuning.engine_torque_nm, tuning.torque_idle_nm, tuning.torque_redline_nm, 1);

    return anchors.map(([rpm, torque], i) => {
        const x = (rpm / maxRPM) * w;
        const y = h - (torque / maxTorque) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
});

// ── Gear editing ──────────────────────────────────────────────
function updateGear(gearKey, value) {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
        tuning.gear_ratios[gearKey] = num;
    }
}

function addGear() {
    const maxGear = Math.max(...forwardGears.value.map(([k]) => Number(k)), 0);
    const nextGear = String(maxGear + 1);
    // New gear has a lower ratio than the previous highest
    const prevRatio = tuning.gear_ratios[String(maxGear)] || 1.0;
    tuning.gear_ratios[nextGear] = Math.max(0.5, prevRatio - 0.3);
}

function removeGear() {
    const gears = forwardGears.value;
    if (gears.length <= 1) return; // Keep at least 1 gear
    const lastKey = gears[gears.length - 1][0];
    delete tuning.gear_ratios[lastKey];
}

function updateReverse(value) {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
        tuning.gear_ratios['R'] = num;
    }
}

// ── Save / Reset ──────────────────────────────────────────────
function save() {
    const overrides = {
        engine_torque_nm: tuning.engine_torque_nm,
        redline_rpm: tuning.redline_rpm,
        idle_rpm: tuning.idle_rpm,
        peak_torque_rpm_low: tuning.peak_torque_rpm_low,
        peak_torque_rpm_high: tuning.peak_torque_rpm_high,
        torque_idle_nm: tuning.torque_idle_nm,
        torque_redline_nm: tuning.torque_redline_nm,
        steering_speed: tuning.steering_speed,
        gear_ratios: { ...tuning.gear_ratios },
    };
    saveTuning(props.bus.id, overrides);
    emit('applied', overrides);
}

function restore() {
    resetTuning(props.bus.id);
    // Reset reactive state to original bus specs
    tuning.engine_torque_nm = props.bus.engine_torque_nm;
    tuning.redline_rpm = props.bus.redline_rpm;
    tuning.idle_rpm = props.bus.idle_rpm;
    tuning.peak_torque_rpm_low = props.bus.peak_torque_rpm_low;
    tuning.peak_torque_rpm_high = props.bus.peak_torque_rpm_high;
    tuning.torque_idle_nm = props.bus.torque_idle_nm;
    tuning.torque_redline_nm = props.bus.torque_redline_nm;
    tuning.steering_speed = 1.0;
    tuning.gear_ratios = { ...props.bus.gear_ratios };
}

/** Which section is expanded */
const activeSection = ref('motor');
</script>

<template>
    <div class="w-[380px] max-h-[90vh] overflow-y-auto rounded-xl bg-gray-900/95 p-5 backdrop-blur">
        <h3 class="mb-1 text-center text-lg font-bold text-amber-400">🔧 Taller</h3>
        <p class="mb-4 text-center text-xs text-gray-500">{{ bus.model }} — {{ bus.generation }}</p>

        <!-- Torque curve preview -->
        <div class="mb-4 rounded-lg bg-gray-800/60 p-3">
            <p class="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Curva de Torque</p>
            <svg viewBox="0 0 280 100" class="w-full h-20">
                <!-- Grid lines -->
                <line x1="0" y1="100" x2="280" y2="100" stroke="#374151" stroke-width="0.5" />
                <line x1="0" y1="50" x2="280" y2="50" stroke="#374151" stroke-width="0.5" stroke-dasharray="4" />
                <line x1="0" y1="0" x2="280" y2="0" stroke="#374151" stroke-width="0.5" />
                <!-- Curve -->
                <path :d="curvePath" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round" />
                <!-- Peak band highlight -->
                <rect
                    :x="(tuning.peak_torque_rpm_low / tuning.redline_rpm) * 280"
                    y="0"
                    :width="((tuning.peak_torque_rpm_high - tuning.peak_torque_rpm_low) / tuning.redline_rpm) * 280"
                    height="100"
                    fill="#f59e0b"
                    fill-opacity="0.08"
                />
            </svg>
            <div class="flex justify-between text-[9px] text-gray-600 mt-1">
                <span>0 RPM</span>
                <span>{{ tuning.idle_rpm }}</span>
                <span class="text-amber-500">{{ tuning.peak_torque_rpm_low }}–{{ tuning.peak_torque_rpm_high }}</span>
                <span class="text-red-400">{{ tuning.redline_rpm }}</span>
            </div>
        </div>

        <!-- Section tabs -->
        <div class="mb-3 flex gap-1 text-xs">
            <button
                v-for="s in ['motor', 'torque', 'transmision', 'direccion']"
                :key="s"
                @click="activeSection = s"
                class="flex-1 rounded-md py-1.5 text-center transition"
                :class="activeSection === s ? 'bg-amber-500 text-black font-semibold' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'"
            >
                {{ { motor: 'Motor', torque: 'Torque', transmision: 'Transmisión', direccion: 'Dirección' }[s] }}
            </button>
        </div>

        <!-- ── Motor section ────────────────────────────── -->
        <div v-if="activeSection === 'motor'" class="space-y-3">
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Torque Máximo</span>
                    <span class="font-mono text-amber-300">{{ tuning.engine_torque_nm }} Nm</span>
                </label>
                <input type="range" v-model.number="tuning.engine_torque_nm" min="100" max="1200" step="5"
                    class="w-full accent-amber-500" />
            </div>
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>RPM Ralentí</span>
                    <span class="font-mono text-amber-300">{{ tuning.idle_rpm }}</span>
                </label>
                <input type="range" v-model.number="tuning.idle_rpm" min="400" max="1500" step="25"
                    class="w-full accent-amber-500" />
            </div>
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Línea Roja</span>
                    <span class="font-mono text-red-400">{{ tuning.redline_rpm }} RPM</span>
                </label>
                <input type="range" v-model.number="tuning.redline_rpm" min="2000" max="8000" step="50"
                    class="w-full accent-red-500" />
            </div>
        </div>

        <!-- ── Torque band section ──────────────────────── -->
        <div v-if="activeSection === 'torque'" class="space-y-3">
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Torque en Ralentí</span>
                    <span class="font-mono text-amber-300">{{ tuning.torque_idle_nm }} Nm</span>
                </label>
                <input type="range" v-model.number="tuning.torque_idle_nm" min="50" max="800" step="5"
                    class="w-full accent-amber-500" />
            </div>
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Torque en Línea Roja</span>
                    <span class="font-mono text-amber-300">{{ tuning.torque_redline_nm }} Nm</span>
                </label>
                <input type="range" v-model.number="tuning.torque_redline_nm" min="50" max="800" step="5"
                    class="w-full accent-amber-500" />
            </div>
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Banda Inicio</span>
                    <span class="font-mono text-amber-300">{{ tuning.peak_torque_rpm_low }} RPM</span>
                </label>
                <input type="range" v-model.number="tuning.peak_torque_rpm_low" min="800" max="5000" step="25"
                    class="w-full accent-amber-500" />
            </div>
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Banda Fin</span>
                    <span class="font-mono text-amber-300">{{ tuning.peak_torque_rpm_high }} RPM</span>
                </label>
                <input type="range" v-model.number="tuning.peak_torque_rpm_high" min="1000" max="7000" step="25"
                    class="w-full accent-amber-500" />
            </div>
        </div>

        <!-- ── Transmission section ─────────────────────── -->
        <div v-if="activeSection === 'transmision'" class="space-y-3">
            <div v-for="[gear, ratio] in forwardGears" :key="gear" class="flex items-center gap-3">
                <span class="w-8 text-right font-mono text-sm font-semibold text-white">{{ gear }}ª</span>
                <input
                    type="number"
                    :value="ratio"
                    @input="updateGear(gear, $event.target.value)"
                    min="0.1"
                    max="10"
                    step="0.05"
                    class="flex-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-right font-mono text-sm text-gray-200 focus:border-amber-500 focus:outline-none"
                />
                <!-- Visual bar -->
                <div class="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-amber-400/80 rounded-full" :style="{ width: `${Math.min((ratio / 6) * 100, 100)}%` }"></div>
                </div>
            </div>

            <!-- Reverse -->
            <div class="flex items-center gap-3 pt-2 border-t border-gray-800">
                <span class="w-8 text-right font-mono text-sm font-semibold text-red-400">R</span>
                <input
                    type="number"
                    :value="reverseRatio"
                    @input="updateReverse($event.target.value)"
                    min="0.1"
                    max="10"
                    step="0.05"
                    class="flex-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-right font-mono text-sm text-gray-200 focus:border-red-500 focus:outline-none"
                />
                <div class="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-red-400/80 rounded-full" :style="{ width: `${Math.min((reverseRatio / 6) * 100, 100)}%` }"></div>
                </div>
            </div>

            <!-- Add / Remove gear buttons -->
            <div class="flex gap-2 pt-2">
                <button @click="addGear" class="flex-1 rounded border border-gray-700 bg-gray-800 py-1 text-xs text-gray-300 hover:border-amber-500 hover:text-amber-400 transition">
                    + Agregar marcha
                </button>
                <button @click="removeGear" :disabled="forwardGears.length <= 1"
                    class="flex-1 rounded border border-gray-700 bg-gray-800 py-1 text-xs transition"
                    :class="forwardGears.length <= 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:border-red-500 hover:text-red-400'">
                    − Quitar última
                </button>
            </div>
        </div>

        <!-- ── Steering section ─────────────────────────── -->
        <div v-if="activeSection === 'direccion'" class="space-y-3">
            <div>
                <label class="flex items-center justify-between text-xs text-gray-400">
                    <span>Velocidad de Dirección</span>
                    <span class="font-mono text-amber-300">{{ tuning.steering_speed.toFixed(1) }}x</span>
                </label>
                <input type="range" v-model.number="tuning.steering_speed" min="0.5" max="3.0" step="0.1"
                    class="w-full accent-amber-500" />
                <div class="flex justify-between text-[9px] text-gray-600 mt-1">
                    <span>Lento 0.5x</span>
                    <span>Normal 1.0x</span>
                    <span>Rápido 3.0x</span>
                </div>
            </div>
        </div>

        <!-- ── Bottom actions ───────────────────────────── -->
        <div class="mt-5 flex items-center justify-between gap-2">
            <button @click="restore" class="text-xs text-gray-500 hover:text-red-400 transition">
                Restaurar Original
            </button>
            <div class="flex gap-2">
                <button @click="emit('close')" class="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition">
                    Cerrar
                </button>
                <button @click="save" class="rounded bg-amber-500 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-400 transition">
                    {{ inRace ? 'Aplicar' : 'Guardar' }}
                </button>
            </div>
        </div>
    </div>
</template>
