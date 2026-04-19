import { describe, it, expect } from 'vitest';
import { Drivetrain, IDLE_RPM, REDLINE_RPM, ENGINE_INERTIA } from '../../resources/js/GameEngine/Drivetrain.js';

/** Shared bus specs matching Mitsubishi Rosa 2nd Gen */
const SPECS = {
    engine_torque_nm: 370,
    gear_ratios: { '1': 5.18, '2': 2.86, '3': 1.59, '4': 1.0, '5': 0.74, 'R': 5.18 },
    fuel_capacity_liters: 100,
    current_fuel_liters: 100,
};

describe('Drivetrain — constructor & gear parsing', () => {
    it('parses forward gears as numbers sorted 1st → 5th', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.forwardGears).toEqual([5.18, 2.86, 1.59, 1.0, 0.74]);
        expect(dt.gearCount).toBe(5);
    });

    it('handles string values in gear_ratios gracefully', () => {
        const dt = new Drivetrain({
            ...SPECS,
            gear_ratios: { '1': '5.18', '2': '2.86', 'R': '5.18' },
        });
        expect(dt.forwardGears).toEqual([5.18, 2.86]);
        expect(dt.reverseRatio).toBe(5.18);
    });

    it('defaults to 400 Nm if engine_torque_nm is missing', () => {
        const dt = new Drivetrain({ gear_ratios: SPECS.gear_ratios });
        expect(dt.peakTorque).toBe(400);
    });

    it('starts in 1st gear with IDLE_RPM', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.currentGear).toBe(1);
        expect(dt.rpm).toBe(IDLE_RPM);
    });
});

describe('Drivetrain — torqueCurve', () => {
    const dt = new Drivetrain(SPECS);

    it('returns 0.4 at idle RPM', () => {
        expect(dt.torqueCurve(IDLE_RPM)).toBe(0.4);
    });

    it('returns 1.0 in peak plateau (1800–2500)', () => {
        expect(dt.torqueCurve(1800)).toBe(1.0);
        expect(dt.torqueCurve(2100)).toBe(1.0);
        expect(dt.torqueCurve(2500)).toBe(1.0);
    });

    it('returns 0.3 at redline', () => {
        expect(dt.torqueCurve(REDLINE_RPM)).toBe(0.3);
    });

    it('ramps between idle and peak (value between 0.4 and 1.0)', () => {
        const val = dt.torqueCurve(1300);
        expect(val).toBeGreaterThan(0.4);
        expect(val).toBeLessThan(1.0);
    });

    it('never returns NaN for any positive RPM', () => {
        for (let rpm = 0; rpm <= 4000; rpm += 100) {
            expect(dt.torqueCurve(rpm)).not.toBeNaN();
        }
    });
});

describe('Drivetrain — update() force output', () => {
    it('returns non-zero, non-NaN force in 1st gear at full throttle', () => {
        const dt = new Drivetrain(SPECS);
        const force = dt.update(0, 1.0, false, 1 / 60);
        expect(force).not.toBeNaN();
        expect(force).toBeGreaterThan(0);
    });

    it('returns 0 force when throttle is 0', () => {
        const dt = new Drivetrain(SPECS);
        const force = dt.update(5, 0, false, 1 / 60);
        expect(force).toBe(0);
    });

    it('returns 0 force in neutral gear', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = 0;
        const force = dt.update(0, 1.0, false, 1 / 60);
        expect(force).toBe(0);
    });

    it('returns negative force in reverse gear', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = -1;
        const force = dt.update(0, 1.0, false, 1 / 60);
        expect(force).toBeLessThan(0);
    });

    it('returns 0 force when fuel is empty', () => {
        const dt = new Drivetrain({ ...SPECS, current_fuel_liters: 0 });
        const force = dt.update(0, 1.0, false, 1 / 60);
        expect(force).toBe(0);
        expect(dt.rpm).toBe(0);
    });
});

describe('Drivetrain — RPM inertia (gradual rise)', () => {
    it('RPM at frame 1 is less than RPM at frame 10 when accelerating from standstill', () => {
        const dt = new Drivetrain(SPECS);
        const frameDt = 1 / 60;

        // Frame 1
        dt.update(0, 1.0, false, frameDt);
        const rpmFrame1 = dt.rpm;

        // Frames 2–10
        for (let i = 2; i <= 10; i++) {
            dt.update(0, 1.0, false, frameDt);
        }
        const rpmFrame10 = dt.rpm;

        expect(rpmFrame1).toBeGreaterThan(IDLE_RPM);
        expect(rpmFrame10).toBeGreaterThan(rpmFrame1);
    });

    it('RPM decays toward idle when throttle is released', () => {
        const dt = new Drivetrain(SPECS);
        const frameDt = 1 / 60;

        // Rev up for 30 frames
        for (let i = 0; i < 30; i++) {
            dt.update(0, 1.0, false, frameDt);
        }
        const highRPM = dt.rpm;

        // Release throttle for 30 frames
        for (let i = 0; i < 30; i++) {
            dt.update(0, 0, false, frameDt);
        }
        const decayedRPM = dt.rpm;

        expect(highRPM).toBeGreaterThan(1500);
        expect(decayedRPM).toBeLessThan(highRPM);
        expect(decayedRPM).toBeGreaterThanOrEqual(IDLE_RPM);
    });

    it('RPM never exceeds REDLINE_RPM', () => {
        const dt = new Drivetrain(SPECS);
        for (let i = 0; i < 300; i++) {
            dt.update(0, 1.0, false, 1 / 60);
        }
        expect(dt.rpm).toBeLessThanOrEqual(REDLINE_RPM);
    });

    it('RPM never goes below IDLE_RPM (while engine is running)', () => {
        const dt = new Drivetrain(SPECS);
        dt.update(0, 0, false, 1 / 60);
        expect(dt.rpm).toBeGreaterThanOrEqual(IDLE_RPM);
    });
});

describe('Drivetrain — gear shifting', () => {
    it('shiftUp increments gear', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.currentGear).toBe(1);
        dt.shiftUp();
        expect(dt.currentGear).toBe(2);
    });

    it('shiftUp clamps at max gear', () => {
        const dt = new Drivetrain(SPECS);
        for (let i = 0; i < 20; i++) dt.shiftUp();
        expect(dt.currentGear).toBe(dt.gearCount);
    });

    it('shiftDown goes 1 → N → R', () => {
        const dt = new Drivetrain(SPECS);
        dt.shiftDown(); // → N (0)
        expect(dt.currentGear).toBe(0);
        expect(dt.gearLabel).toBe('N');
        dt.shiftDown(); // → R (-1)
        expect(dt.currentGear).toBe(-1);
        expect(dt.gearLabel).toBe('R');
    });

    it('shiftDown clamps at reverse', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = -1;
        dt.shiftDown();
        expect(dt.currentGear).toBe(-1);
    });
});

describe('Drivetrain — fuel consumption', () => {
    it('burns fuel proportionally to load over many frames', () => {
        const dt = new Drivetrain(SPECS);
        const initialFuel = dt.fuel;
        for (let i = 0; i < 600; i++) { // 10 seconds at 60fps
            dt.update(0, 1.0, false, 1 / 60);
        }
        expect(dt.fuel).toBeLessThan(initialFuel);
        expect(dt.fuel).toBeGreaterThan(0);
    });
});
