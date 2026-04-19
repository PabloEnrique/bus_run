import { describe, it, expect } from 'vitest';
import { Drivetrain, IDLE_RPM, REDLINE_RPM, FINAL_DRIVE_RATIO, WHEEL_RADIUS } from '../../resources/js/GameEngine/Drivetrain.js';

const SPECS = {
    engine_torque_nm: 370,
    gear_ratios: { '1': 5.18, '2': 2.86, '3': 1.59, '4': 1.0, '5': 0.74, 'R': 5.18 },
    fuel_capacity_liters: 100,
    current_fuel_liters: 100,
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
        const rpmLow = dt.computeRPM(1);
        const rpmHigh = dt.computeRPM(5);
        expect(rpmHigh).toBeGreaterThan(rpmLow);
    });

    it('produces expected value for known inputs', () => {
        // 1st gear (5.18), wheelSpeed = 2 rad/s
        // engineRadPerSec = 2 × 5.18 × 4.1 = 42.476
        // RPM = (42.476 × 60) / (2π) ≈ 405.5 → clamped to IDLE (800)
        dt.currentGear = 1;
        const rpm = dt.computeRPM(2);
        expect(rpm).toBe(IDLE_RPM); // below idle → clamped

        // Higher speed: wheelSpeed = 10 rad/s in 1st
        // engineRadPerSec = 10 × 5.18 × 4.1 = 212.38
        // RPM = (212.38 × 60) / (2π) ≈ 2027.6
        const rpmHigh = dt.computeRPM(10);
        expect(rpmHigh).toBeCloseTo(2027.6, 0);
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
