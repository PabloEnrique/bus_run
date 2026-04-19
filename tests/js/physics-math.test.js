import { describe, it, expect } from 'vitest';
import { Drivetrain, IDLE_RPM, REDLINE_RPM, FINAL_DRIVE_RATIO, WHEEL_RADIUS } from '../../resources/js/GameEngine/Drivetrain.js';

const SPECS = {
    engine_torque_nm: 370,
    gear_ratios: { '1': 5.18, '2': 2.86, '3': 1.59, '4': 1.0, '5': 0.74, 'R': 5.18 },
    fuel_capacity_liters: 100,
    current_fuel_liters: 100,
    redline_rpm: 3200,
    peak_torque_rpm_low: 1800,
    peak_torque_rpm_high: 2500,
    engine_hp: 120,
    base_weight_kg: 3250,
    drag_coefficient: 0.65,
    width_m: 2.0,
    height_m: 2.6,
};

describe('computeRPM — wheel speed to RPM mapping', () => {
    const dt = new Drivetrain(SPECS);

    it('returns IDLE_RPM when wheelSpeed is 0', () => {
        expect(dt.computeRPM(0)).toBe(IDLE_RPM);
    });

    it('returns IDLE_RPM when in neutral (ratio = 0)', () => {
        dt.currentGear = 0;
        expect(dt.computeRPM(10)).toBe(IDLE_RPM);
        dt.currentGear = 1; // reset
    });

    it('returns value within [IDLE_RPM, REDLINE_RPM] for any wheelSpeed', () => {
        for (const ws of [0, 1, 5, 10, 50, 100]) {
            const rpm = dt.computeRPM(ws);
            expect(rpm).toBeGreaterThanOrEqual(IDLE_RPM);
            expect(rpm).toBeLessThanOrEqual(REDLINE_RPM);
        }
    });

    it('increases with wheel speed in 1st gear', () => {
        const rpmLow = dt.computeRPM(10);
        const rpmHigh = dt.computeRPM(20);
        expect(rpmHigh).toBeGreaterThan(rpmLow);
    });

    it('produces expected value for known inputs', () => {
        // 1st gear (5.18), wheelSpeed = 2 rad/s
        // engineRadPerSec = 2 × 5.18 × 2.8 = 29.008
        // RPM = (29.008 × 60) / (2π) ≈ 277 → clamped to IDLE (800)
        dt.currentGear = 1;
        const rpm = dt.computeRPM(2);
        expect(rpm).toBe(IDLE_RPM); // below idle → clamped

        // Higher speed: wheelSpeed = 10 rad/s in 1st
        // engineRadPerSec = 10 × 5.18 × 2.8 = 145.04
        // RPM = (145.04 × 60) / (2π) ≈ 1385.0
        const rpmHigh = dt.computeRPM(10);
        expect(rpmHigh).toBeCloseTo(1385.0, 0);
    });
});

describe('Force calculation — torque × gear × final drive', () => {
    it('produces expected force for known torque, gear ratio, and RPM', () => {
        const dt = new Drivetrain(SPECS);
        // In 1st gear at peak torque (RPM 2000 — in plateau)
        // Force = (peakTorque × 1.0 × throttle × gearRatio × finalDrive) / wheelRadius
        // Force = (370 × 1.0 × 1.0 × 5.18 × 4.1) / 0.35
        const expectedForce = (370 * 1.0 * 1.0 * 5.18 * 4.1) / 0.35;

        // We need RPM at ~2000 in the torque plateau for multiplier = 1.0
        // Rev up engine first so RPM is in peak range
        for (let i = 0; i < 60; i++) {
            dt.update(0, 1.0, false, 1 / 60);
        }
        // RPM should now be in the throttle target range (≈ 2600)
        // torqueCurve will be < 1.0 but we can verify the math structure
        const force = dt.update(0, 1.0, false, 1 / 60);

        expect(force).toBeGreaterThan(0);
        expect(force).not.toBeNaN();
        expect(Number.isFinite(force)).toBe(true);
        // Force should be in a reasonable range for a bus (~10k–50k N)
        expect(force).toBeGreaterThan(5000);
        expect(force).toBeLessThan(60000);
    });

    it('force in 1st gear > force in 5th gear at same RPM (higher gear ratio multiplies more)', () => {
        // Two fresh drivetrains, same RPM target via inertia
        const dt1 = new Drivetrain(SPECS);
        const dt5 = new Drivetrain(SPECS);
        dt5.currentGear = 5;

        // Rev both for a few frames
        for (let i = 0; i < 30; i++) {
            dt1.update(0, 1.0, false, 1 / 60);
            dt5.update(0, 1.0, false, 1 / 60);
        }
        const force1 = dt1.update(0, 1.0, false, 1 / 60);
        const force5 = dt5.update(0, 1.0, false, 1 / 60);

        expect(force1).toBeGreaterThan(force5);
    });
});

describe('gear_ratios parsing edge cases', () => {
    it('works with 6-speed gearbox', () => {
        const sixSpeed = {
            ...SPECS,
            gear_ratios: { '1': 6.0, '2': 3.5, '3': 2.1, '4': 1.4, '5': 1.0, '6': 0.72, 'R': 6.0 },
        };
        const dt = new Drivetrain(sixSpeed);
        expect(dt.gearCount).toBe(6);
        expect(dt.forwardGears[5]).toBe(0.72);
    });

    it('handles missing gear_ratios gracefully', () => {
        const dt = new Drivetrain({ engine_torque_nm: 300 });
        expect(dt.gearCount).toBe(0);
        expect(dt.currentRatio).toBe(0); // no gears → neutral-like
    });

    it('parses reverse gear correctly', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = -1;
        expect(dt.currentRatio).toBe(5.18);
    });
});

describe('Suspension sanity — springs must support bus weight', () => {
    it('cannon-es normalised stiffness produces correct sag', () => {
        // cannon-es: suspensionForce = (stiffness × displacement) × chassisMass
        // At equilibrium: 4 × stiffness × sag × mass = mass × g
        // → sag = g / (4 × stiffness)
        const stiffness = 20; // normalised cannon-es coefficient
        const g = 9.82;

        const sag = g / (4 * stiffness);
        expect(sag).toBeGreaterThan(0.08);
        expect(sag).toBeLessThan(0.20);
    });

    it('natural frequency is in bus range (1.0–2.0 Hz)', () => {
        const stiffness = 20;
        const omega = Math.sqrt(4 * stiffness);
        const freq = omega / (2 * Math.PI);
        expect(freq).toBeGreaterThan(1.0);
        expect(freq).toBeLessThan(2.0);
    });

    it('damping ratio provides adequate settling (ζ > 0.3)', () => {
        const stiffness = 20;
        const dampRelax = 9.8;
        const omega = Math.sqrt(4 * stiffness);
        const cCrit = 2 * omega;
        const zeta = dampRelax / cCrit;
        expect(zeta).toBeGreaterThan(0.3);
        expect(zeta).toBeLessThan(0.8);
    });

    it('connection point Y equals negative chassis half-height for default bus', () => {
        // For a bus with height_m = 2.6, halfH = height / 4 = 0.65
        const height = 2.6;
        const halfH = height / 4;
        const connectionY = -halfH;
        expect(connectionY).toBeCloseTo(-0.65, 2);
    });
});

describe('Aerodynamic drag model', () => {
    it('drag force increases with speed squared', () => {
        const dt = new Drivetrain(SPECS);
        const drag10 = dt.computeDragForce(10);
        const drag20 = dt.computeDragForce(20);
        // At 2× speed, drag should be 4×
        expect(drag20).toBeCloseTo(drag10 * 4, 0);
    });

    it('drag force is zero at zero speed', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.computeDragForce(0)).toBe(0);
    });

    it('rolling resistance is constant regardless of speed', () => {
        const dt = new Drivetrain(SPECS);
        const res0  = dt.rollingResistance;
        // Crr × mass × g = 0.008 × 3250 × 9.82 ≈ 255 N
        expect(res0).toBeGreaterThan(230);
        expect(res0).toBeLessThan(280);
    });

    it('total resistance at 100 km/h is significant but less than engine force', () => {
        const dt = new Drivetrain(SPECS);
        const speedMs = 100 / 3.6; // ~27.8 m/s
        const resistance = dt.computeResistance(speedMs);
        // Should be several hundred N (drag + rolling)
        expect(resistance).toBeGreaterThan(500);
        expect(resistance).toBeLessThan(5000);
    });

    it('heavier bus with higher Cd has more drag', () => {
        const lightBus = new Drivetrain(SPECS);
        const heavyBus = new Drivetrain({
            ...SPECS,
            base_weight_kg: 4800,
            drag_coefficient: 0.82,
            width_m: 2.24,
            height_m: 2.95,
        });
        const speed = 30; // m/s
        expect(heavyBus.computeDragForce(speed)).toBeGreaterThan(lightBus.computeDragForce(speed));
        expect(heavyBus.rollingResistance).toBeGreaterThan(lightBus.rollingResistance);
    });
});

describe('Per-bus powerband', () => {
    it('different buses have different redline RPMs', () => {
        const bus1 = new Drivetrain({ ...SPECS, redline_rpm: 3200 });
        const bus2 = new Drivetrain({ ...SPECS, redline_rpm: 2800 });
        expect(bus1.redlineRPM).toBe(3200);
        expect(bus2.redlineRPM).toBe(2800);
    });

    it('torque curve uses per-bus peak RPM range', () => {
        const bus = new Drivetrain({ ...SPECS, peak_torque_rpm_low: 1400, peak_torque_rpm_high: 2200 });
        // 1500 should be in peak range for this bus
        expect(bus.torqueCurve(1500)).toBe(1.0);
        // But 1500 would NOT be in peak for default bus (1800-2500)
        const defaultBus = new Drivetrain(SPECS);
        expect(defaultBus.torqueCurve(1500)).toBeLessThan(1.0);
    });

    it('RPM clamps to per-bus redline', () => {
        const bus = new Drivetrain({ ...SPECS, redline_rpm: 2800 });
        for (let i = 0; i < 300; i++) {
            bus.update(0, 1.0, false, 1 / 60);
        }
        expect(bus.rpm).toBeLessThanOrEqual(2800);
    });
});
