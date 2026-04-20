import { describe, it, expect } from 'vitest';
import { Drivetrain, FINAL_DRIVE_RATIO, WHEEL_RADIUS, buildTorqueTable, TORQUE_TABLE_STEP } from '../../resources/js/GameEngine/Drivetrain.js';

const SPECS = {
    engine_torque_nm: 290,
    gear_ratios: { '1': 5.18, '2': 2.86, '3': 1.59, '4': 1.0, '5': 0.74, 'R': 5.18 },
    fuel_capacity_liters: 100,
    current_fuel_liters: 100,
    idle_rpm: 750,
    redline_rpm: 3200,
    peak_torque_rpm_low: 1600,
    peak_torque_rpm_high: 2000,
    torque_idle_nm: 180,
    torque_redline_nm: 150,
    engine_hp: 120,
    base_weight_kg: 3250,
    drag_coefficient: 0.65,
    width_m: 2.0,
    height_m: 2.6,
};

describe('buildTorqueTable — 5-point interpolation', () => {
    const table = buildTorqueTable(750, 3200, 180, 290, 1600, 2000, 150);

    it('returns 0 Nm at RPM 0', () => {
        expect(table[0]).toBe(0);
    });

    it('returns idle torque at idle RPM', () => {
        const idx = 750 / TORQUE_TABLE_STEP;
        expect(table[idx]).toBeCloseTo(180, 0);
    });

    it('returns peak torque at peak_start RPM', () => {
        const idx = 1600 / TORQUE_TABLE_STEP;
        expect(table[idx]).toBeCloseTo(290, 0);
    });

    it('returns peak torque at peak_end RPM', () => {
        const idx = 2000 / TORQUE_TABLE_STEP;
        expect(table[idx]).toBeCloseTo(290, 0);
    });

    it('returns redline torque at redline RPM', () => {
        const idx = 3200 / TORQUE_TABLE_STEP;
        expect(table[idx]).toBeCloseTo(150, 0);
    });

    it('interpolates linearly between idle and peak_start', () => {
        const rpm = 1150;
        const idx = rpm / TORQUE_TABLE_STEP;
        const lo = Math.floor(idx);
        const t = idx - lo;
        const val = table[lo] * (1 - t) + table[lo + 1] * t;
        expect(val).toBeGreaterThan(180);
        expect(val).toBeLessThan(290);
    });

    it('table values increase from idle to peak_start', () => {
        const idleIdx = Math.ceil(750 / TORQUE_TABLE_STEP);
        const peakIdx = Math.floor(1600 / TORQUE_TABLE_STEP);
        for (let i = idleIdx; i < peakIdx; i++) {
            expect(table[i + 1]).toBeGreaterThanOrEqual(table[i]);
        }
    });

    it('table values decrease from peak_end to redline', () => {
        const peakEndIdx = Math.ceil(2000 / TORQUE_TABLE_STEP);
        const redlineIdx = Math.floor(3200 / TORQUE_TABLE_STEP);
        for (let i = peakEndIdx; i < redlineIdx; i++) {
            expect(table[i + 1]).toBeLessThanOrEqual(table[i]);
        }
    });
});

describe('Drivetrain.torqueCurve — Nm lookup', () => {
    const dt = new Drivetrain(SPECS);

    it('returns actual Nm at idle', () => {
        expect(dt.torqueCurve(750)).toBeCloseTo(180, 0);
    });

    it('returns peak torque in plateau', () => {
        expect(dt.torqueCurve(1800)).toBeCloseTo(290, 0);
    });

    it('returns redline torque at redline', () => {
        expect(dt.torqueCurve(3200)).toBeCloseTo(150, 0);
    });

    it('returns 0 at RPM 0', () => {
        expect(dt.torqueCurve(0)).toBe(0);
    });

    it('never returns NaN', () => {
        for (let rpm = 0; rpm <= 4000; rpm += 100) {
            expect(dt.torqueCurve(rpm)).not.toBeNaN();
        }
    });
});

describe('computeRPM — rigid direct-drive coupling', () => {
    const dt = new Drivetrain(SPECS);

    it('returns idle_rpm in neutral', () => {
        dt.currentGear = 0;
        expect(dt.computeRPM(10)).toBe(dt.idleRPM);
        dt.currentGear = 1;
    });

    it('returns 0 when wheelSpeed is 0 (direct drive)', () => {
        expect(dt.computeRPM(0)).toBe(0);
    });

    it('increases linearly with wheel speed', () => {
        const rpm5 = dt.computeRPM(5);
        const rpm10 = dt.computeRPM(10);
        expect(rpm10).toBeCloseTo(rpm5 * 2, 0);
    });

    it('produces expected RPM for known inputs', () => {
        dt.currentGear = 1;
        // engineRadPerSec = 10 × 5.18 × 2.8 = 145.04
        // RPM = (145.04 × 60) / (2π) ≈ 1385
        expect(dt.computeRPM(10)).toBeCloseTo(1385, 0);
    });

    it('clamps at redline', () => {
        expect(dt.computeRPM(100)).toBeLessThanOrEqual(dt.redlineRPM);
    });
});

describe('Force — torque(Nm) × gear × finalDrive', () => {
    it('1st gear force > 5th gear force at same wheel speed', () => {
        const dt1 = new Drivetrain(SPECS);
        const dt5 = new Drivetrain(SPECS);
        dt5.currentGear = 5;
        const force1 = dt1.update(10, 1.0, false, 1 / 60);
        const force5 = dt5.update(10, 1.0, false, 1 / 60);
        expect(force1).toBeGreaterThan(force5);
    });

    it('produces positive non-NaN force', () => {
        const dt = new Drivetrain(SPECS);
        const force = dt.update(5, 1.0, false, 1 / 60);
        expect(force).toBeGreaterThan(0);
        expect(Number.isFinite(force)).toBe(true);
    });
});

describe('Suspension sanity', () => {
    it('normalised stiffness produces correct sag', () => {
        const sag = 9.82 / (4 * 20);
        expect(sag).toBeGreaterThan(0.08);
        expect(sag).toBeLessThan(0.20);
    });

    it('natural frequency is in bus range (1.0–2.0 Hz)', () => {
        const freq = Math.sqrt(4 * 20) / (2 * Math.PI);
        expect(freq).toBeGreaterThan(1.0);
        expect(freq).toBeLessThan(2.0);
    });
});

describe('Aerodynamic drag', () => {
    const dt = new Drivetrain(SPECS);

    it('drag force ∝ v²', () => {
        expect(dt.computeDragForce(20)).toBeCloseTo(dt.computeDragForce(10) * 4, 0);
    });

    it('zero at zero speed', () => {
        expect(dt.computeDragForce(0)).toBe(0);
    });

    it('rolling resistance ≈ 255 N for 3250 kg bus', () => {
        expect(dt.rollingResistance).toBeGreaterThan(230);
        expect(dt.rollingResistance).toBeLessThan(280);
    });
});

describe('Per-bus powerband', () => {
    it('different buses produce different peak torque', () => {
        const bus1 = new Drivetrain({ ...SPECS, engine_torque_nm: 290 });
        const bus2 = new Drivetrain({ ...SPECS, engine_torque_nm: 700 });
        expect(bus2.torqueCurve(1800)).toBeGreaterThan(bus1.torqueCurve(1800));
    });

    it('respects per-bus idle RPM', () => {
        const bus700 = new Drivetrain({ ...SPECS, idle_rpm: 700 });
        expect(bus700.idleRPM).toBe(700);
    });
});
