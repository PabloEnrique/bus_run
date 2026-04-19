<script setup>
/**
 * GaugeCluster — SVG analog tachometer + speedometer + gear + fuel.
 *
 * Tachometer: 0–4500 RPM. Labels: 0, 1, 2, 3, 4, 4.5 (×1000).
 * Speedometer: 0–160 km/h.
 * Gear: large centre display.
 * Fuel: small arc gauge.
 */

const props = defineProps({
    rpm: { type: Number, default: 0 },
    maxRpm: { type: Number, default: 3200 },
    speed: { type: Number, default: 0 },
    gear: { type: String, default: '1' },
    fuel: { type: Number, default: 100 },
    fuelCapacity: { type: Number, default: 100 },
});

// ── Tachometer arc ───────────────────────────────────────────
// Arc from 225° (bottom-left) to -45° (bottom-right) = 270° sweep
const TACHO_START = 225;
const TACHO_SWEEP = 270;
const TACHO_MAX   = 4500;
const TACHO_R     = 90;
const TACHO_CX    = 110;
const TACHO_CY    = 110;

const TACHO_TICKS = [0, 1000, 2000, 3000, 4000, 4500];
const TACHO_LABELS = ['0', '1', '2', '3', '4', '4.5'];

// ── Speedometer arc ──────────────────────────────────────────
const SPEED_START = 225;
const SPEED_SWEEP = 270;
const SPEED_MAX   = 160;
const SPEED_R     = 90;
const SPEED_CX    = 110;
const SPEED_CY    = 110;

const SPEED_TICKS = [0, 20, 40, 60, 80, 100, 120, 140, 160];

function polarToXY(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function valueToAngle(value, max, startDeg, sweepDeg) {
    const fraction = Math.min(1, Math.max(0, value / max));
    // Sweep goes clockwise: startDeg down to startDeg - sweepDeg
    return startDeg - fraction * sweepDeg;
}

function arcPath(cx, cy, r, startDeg, endDeg) {
    const s = polarToXY(cx, cy, r, startDeg);
    const e = polarToXY(cx, cy, r, endDeg);
    const sweep = startDeg - endDeg;
    const large = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function needlePath(cx, cy, r, angleDeg) {
    const tip = polarToXY(cx, cy, r - 8, angleDeg);
    const base1 = polarToXY(cx, cy, 6, angleDeg + 90);
    const base2 = polarToXY(cx, cy, 6, angleDeg - 90);
    return `M ${tip.x} ${tip.y} L ${base1.x} ${base1.y} L ${base2.x} ${base2.y} Z`;
}
</script>

<template>
    <div class="flex items-end gap-3">
        <!-- ── Tachometer ──────────────────────────────────── -->
        <div class="relative">
            <svg width="220" height="220" viewBox="0 0 220 220">
                <!-- Background arc -->
                <path
                    :d="arcPath(TACHO_CX, TACHO_CY, TACHO_R, TACHO_START, TACHO_START - TACHO_SWEEP)"
                    fill="none" stroke="#333" stroke-width="8" stroke-linecap="round"
                />
                <!-- Red zone (last 15% before max_rpm) -->
                <path
                    :d="arcPath(TACHO_CX, TACHO_CY, TACHO_R,
                        valueToAngle(maxRpm * 0.85, TACHO_MAX, TACHO_START, TACHO_SWEEP),
                        valueToAngle(TACHO_MAX, TACHO_MAX, TACHO_START, TACHO_SWEEP))"
                    fill="none" stroke="#ef4444" stroke-width="8" stroke-linecap="round" opacity="0.6"
                />
                <!-- Tick marks & labels -->
                <template v-for="(tick, i) in TACHO_TICKS" :key="'tt'+i">
                    <line
                        :x1="polarToXY(TACHO_CX, TACHO_CY, TACHO_R - 4, valueToAngle(tick, TACHO_MAX, TACHO_START, TACHO_SWEEP)).x"
                        :y1="polarToXY(TACHO_CX, TACHO_CY, TACHO_R - 4, valueToAngle(tick, TACHO_MAX, TACHO_START, TACHO_SWEEP)).y"
                        :x2="polarToXY(TACHO_CX, TACHO_CY, TACHO_R + 4, valueToAngle(tick, TACHO_MAX, TACHO_START, TACHO_SWEEP)).x"
                        :y2="polarToXY(TACHO_CX, TACHO_CY, TACHO_R + 4, valueToAngle(tick, TACHO_MAX, TACHO_START, TACHO_SWEEP)).y"
                        stroke="#888" stroke-width="2"
                    />
                    <text
                        :x="polarToXY(TACHO_CX, TACHO_CY, TACHO_R - 18, valueToAngle(tick, TACHO_MAX, TACHO_START, TACHO_SWEEP)).x"
                        :y="polarToXY(TACHO_CX, TACHO_CY, TACHO_R - 18, valueToAngle(tick, TACHO_MAX, TACHO_START, TACHO_SWEEP)).y"
                        fill="#ccc" font-size="12" text-anchor="middle" dominant-baseline="central"
                    >{{ TACHO_LABELS[i] }}</text>
                </template>
                <!-- Needle -->
                <path
                    :d="needlePath(TACHO_CX, TACHO_CY, TACHO_R, valueToAngle(rpm, TACHO_MAX, TACHO_START, TACHO_SWEEP))"
                    fill="#f59e0b" class="transition-all duration-75"
                />
                <!-- Centre cap -->
                <circle :cx="TACHO_CX" :cy="TACHO_CY" r="8" fill="#444" />
                <!-- RPM digital readout -->
                <text :x="TACHO_CX" :y="TACHO_CY + 30" fill="#fff" font-size="18" font-weight="bold"
                    text-anchor="middle" font-family="monospace">{{ rpm }}</text>
                <text :x="TACHO_CX" :y="TACHO_CY + 45" fill="#666" font-size="9"
                    text-anchor="middle">rpm × 1000</text>
            </svg>
        </div>

        <!-- ── Gear indicator ──────────────────────────────── -->
        <div class="flex flex-col items-center justify-center pb-8">
            <span class="text-5xl font-bold text-amber-400 tabular-nums">{{ gear }}</span>
            <span class="text-[10px] uppercase tracking-widest text-gray-600">marcha</span>
            <!-- Fuel mini-bar -->
            <div class="mt-3 w-14">
                <div class="flex items-baseline justify-between">
                    <span class="text-[9px] text-gray-500">⛽</span>
                    <span class="font-mono text-[9px] text-gray-500">{{ Math.round((fuel / fuelCapacity) * 100) }}%</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                        class="h-full rounded-full transition-all duration-300"
                        :class="fuel / fuelCapacity > 0.5 ? 'bg-green-500' : fuel / fuelCapacity > 0.2 ? 'bg-amber-500' : 'bg-red-500'"
                        :style="{ width: Math.round((fuel / fuelCapacity) * 100) + '%' }"
                    />
                </div>
            </div>
        </div>

        <!-- ── Speedometer ─────────────────────────────────── -->
        <div class="relative">
            <svg width="220" height="220" viewBox="0 0 220 220">
                <!-- Background arc -->
                <path
                    :d="arcPath(SPEED_CX, SPEED_CY, SPEED_R, SPEED_START, SPEED_START - SPEED_SWEEP)"
                    fill="none" stroke="#333" stroke-width="8" stroke-linecap="round"
                />
                <!-- Tick marks & labels -->
                <template v-for="tick in SPEED_TICKS" :key="'st'+tick">
                    <line
                        :x1="polarToXY(SPEED_CX, SPEED_CY, SPEED_R - 4, valueToAngle(tick, SPEED_MAX, SPEED_START, SPEED_SWEEP)).x"
                        :y1="polarToXY(SPEED_CX, SPEED_CY, SPEED_R - 4, valueToAngle(tick, SPEED_MAX, SPEED_START, SPEED_SWEEP)).y"
                        :x2="polarToXY(SPEED_CX, SPEED_CY, SPEED_R + 4, valueToAngle(tick, SPEED_MAX, SPEED_START, SPEED_SWEEP)).x"
                        :y2="polarToXY(SPEED_CX, SPEED_CY, SPEED_R + 4, valueToAngle(tick, SPEED_MAX, SPEED_START, SPEED_SWEEP)).y"
                        stroke="#888" stroke-width="2"
                    />
                    <text
                        :x="polarToXY(SPEED_CX, SPEED_CY, SPEED_R - 18, valueToAngle(tick, SPEED_MAX, SPEED_START, SPEED_SWEEP)).x"
                        :y="polarToXY(SPEED_CX, SPEED_CY, SPEED_R - 18, valueToAngle(tick, SPEED_MAX, SPEED_START, SPEED_SWEEP)).y"
                        fill="#ccc" font-size="11" text-anchor="middle" dominant-baseline="central"
                    >{{ tick }}</text>
                </template>
                <!-- Needle -->
                <path
                    :d="needlePath(SPEED_CX, SPEED_CY, SPEED_R, valueToAngle(speed, SPEED_MAX, SPEED_START, SPEED_SWEEP))"
                    fill="#f59e0b" class="transition-all duration-75"
                />
                <!-- Centre cap -->
                <circle :cx="SPEED_CX" :cy="SPEED_CY" r="8" fill="#444" />
                <!-- Speed digital readout -->
                <text :x="SPEED_CX" :y="SPEED_CY + 30" fill="#fff" font-size="22" font-weight="bold"
                    text-anchor="middle" font-family="monospace">{{ speed }}</text>
                <text :x="SPEED_CX" :y="SPEED_CY + 45" fill="#666" font-size="9"
                    text-anchor="middle">km/h</text>
            </svg>
        </div>
    </div>
</template>
