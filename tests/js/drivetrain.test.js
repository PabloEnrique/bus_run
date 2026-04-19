import { describe, it, expect } from 'vitest';
import { Drivetrain, CLUTCH_ENGAGE_TIME, IDLE_CREEP_FORCE } from '../../resources/js/GameEngine/Drivetrain.js';

const SPECS = {
    engine_torque_nm: 290,
    engine_hp: 120,
    idle_rpm: 750,
    redline_rpm: 3200,
    peak_torque_rpm_low: 1600,
    peak_torque_rpm_high: 2000,
    torque_idle_nm: 180,
    torque_redline_nm: 150,
    gear_ratios: { '1': 5.18, '2': 2.86, '3': 1.59, '4': 1.0, '5': 0.74, 'R': 5.18 },
    fuel_capacity_liters: 100,
    current_fuel_liters: 100,
    base_weight_kg: 3250,
    drag_coefficient: 0.65,
    width_m: 2.0,
    height_m: 2.6,
};

describe('Constructor & gear parsing', () => {
    it('parses forward gears sorted 1st → 5th', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.forwardGears).toEqual([5.18, 2.86, 1.59, 1.0, 0.74]);
        expect(dt.gearCount).toBe(5);
    });

    it('handles 6-speed gearbox', () => {
        const dt = new Drivetrain({
            ...SPECS,
            gear_ratios: { '1': 6.0, '2': 3.5, '3': 2.1, '4': 1.4, '5': 1.0, '6': 0.72, 'R': 6.0 },
        });
        expect(dt.gearCount).toBe(6);
    });

    it('starts in 1st gear at idle RPM', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.currentGear).toBe(1);
        expect(dt.rpm).toBe(750);
    });

    it('stores per-bus torque anchors', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.peakTorque).toBe(290);
        expect(dt.torqueIdleNm).toBe(180);
        expect(dt.torqueRedlineNm).toBe(150);
    });
});

describe('Direct drive — RPM tracks wheel speed rigidly', () => {
    it('RPM = 0 when bus is stationary (no inertia blending)', () => {
        const dt = new Drivetrain(SPECS);
        dt.update(0, 1.0, false, 1 / 60);
        // Auto-clutch kicks in: RPM should be held at idle
        expect(dt.rpm).toBe(dt.idleRPM);
    });

    it('RPM jumps instantly to match wheel speed (no gradual rise)', () => {
        const dt = new Drivetrain(SPECS);
        // wheelSpeed = 10 rad/s in 1st gear → RPM ≈ 1385
        dt.update(10, 1.0, false, 1 / 60);
        expect(dt.rpm).toBeCloseTo(1385, 0);
    });

    it('RPM drops instantly when wheel speed drops', () => {
        const dt = new Drivetrain(SPECS);
        dt.update(10, 1.0, false, 1 / 60);
        const highRPM = dt.rpm;
        dt.update(5, 0, false, 1 / 60);
        expect(dt.rpm).toBeLessThan(highRPM);
    });
});

describe('Auto-clutch at low RPM', () => {
    it('holds engine at idle when bus is stopped', () => {
        const dt = new Drivetrain(SPECS);
        dt.update(0, 0, false, 1 / 60);
        expect(dt.rpm).toBe(dt.idleRPM);
    });

    it('clutch disengages proportionally below idle RPM', () => {
        const dt = new Drivetrain(SPECS);
        // Very low wheel speed → rawRPM < idle → clutch < 1
        dt.update(1, 0, false, 1 / 60);
        expect(dt.clutch).toBeLessThan(1.0);
        expect(dt.clutch).toBeGreaterThanOrEqual(0);
    });

    it('clutch is fully engaged above idle RPM', () => {
        const dt = new Drivetrain(SPECS);
        // wheelSpeed = 10 → RPM ≈ 1385 > idle
        dt.update(10, 1.0, false, 1 / 60);
        expect(dt.clutch).toBe(1.0);
    });
});

describe('Fuel cut limiter', () => {
    it('cuts power when RPM reaches redline', () => {
        const dt = new Drivetrain(SPECS);
        // Force RPM to redline with very high wheel speed
        // In 5th gear (0.74): wheelSpeed = redline × 2π / (60 × 0.74 × 2.8)
        const wsRedline = (dt.redlineRPM * 2 * Math.PI) / (60 * 0.74 * 2.8);
        dt.currentGear = 5;
        const force = dt.update(wsRedline, 1.0, false, 1 / 60);
        expect(force).toBe(0);
        expect(dt._fuelCut).toBe(true);
    });

    it('resumes power when RPM drops below redline - 100', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = 5;
        // First hit redline
        const wsRedline = (dt.redlineRPM * 2 * Math.PI) / (60 * 0.74 * 2.8);
        dt.update(wsRedline, 1.0, false, 1 / 60);
        expect(dt._fuelCut).toBe(true);
        // Then drop below threshold
        const wsLow = ((dt.redlineRPM - 200) * 2 * Math.PI) / (60 * 0.74 * 2.8);
        const force = dt.update(wsLow, 1.0, false, 1 / 60);
        expect(dt._fuelCut).toBe(false);
        expect(force).toBeGreaterThan(0);
    });
});

describe('Gear shifting', () => {
    it('shiftUp increments gear', () => {
        const dt = new Drivetrain(SPECS);
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
        dt.shiftDown();
        expect(dt.currentGear).toBe(0);
        expect(dt.gearLabel).toBe('N');
        dt.shiftDown();
        expect(dt.currentGear).toBe(-1);
        expect(dt.gearLabel).toBe('R');
    });

    it('shiftDown clamps at reverse', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = -1;
        dt.shiftDown();
        expect(dt.currentGear).toBe(-1);
    });

    it('shift triggers clutch engagement ramp', () => {
        const dt = new Drivetrain(SPECS);
        dt.shiftUp();
        expect(dt._shiftClutchTimer).toBe(CLUTCH_ENGAGE_TIME);
    });
});

describe('Shift clutch engagement', () => {
    it('clutch ramps from 0 to 1 over ~CLUTCH_ENGAGE_TIME', () => {
        const dt = new Drivetrain(SPECS);
        dt.shiftUp();
        const frames = Math.ceil(CLUTCH_ENGAGE_TIME * 60);
        for (let i = 0; i < frames; i++) {
            dt.update(10, 1.0, false, 1 / 60);
        }
        expect(dt.clutch).toBeCloseTo(1.0, 1);
    });

    it('force is reduced during shift clutch engagement', () => {
        const dt1 = new Drivetrain(SPECS);
        const forceFullClutch = dt1.update(10, 1.0, false, 1 / 60);

        const dt2 = new Drivetrain(SPECS);
        dt2.shiftUp();
        dt2.update(10, 1.0, false, 1 / 60);
        const forcePartialClutch = dt2.update(10, 1.0, false, 1 / 60);

        expect(Math.abs(forcePartialClutch)).toBeLessThan(Math.abs(forceFullClutch));
    });
});

describe('Force output', () => {
    it('returns non-zero force in 1st gear at full throttle', () => {
        const dt = new Drivetrain(SPECS);
        const force = dt.update(5, 1.0, false, 1 / 60);
        expect(force).toBeGreaterThan(0);
    });

    it('returns 0 in neutral', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = 0;
        expect(dt.update(0, 1.0, false, 1 / 60)).toBe(0);
    });

    it('returns negative force in reverse', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = -1;
        expect(dt.update(5, 1.0, false, 1 / 60)).toBeLessThan(0);
    });

    it('returns 0 when fuel is empty', () => {
        const dt = new Drivetrain({ ...SPECS, current_fuel_liters: 0 });
        expect(dt.update(5, 1.0, false, 1 / 60)).toBe(0);
    });
});

describe('Idle creep', () => {
    it('produces forward force when in gear, no throttle, no brake', () => {
        const dt = new Drivetrain(SPECS);
        const force = dt.update(0, 0, false, 1 / 60);
        expect(force).toBeGreaterThan(0);
        expect(force).toBeLessThanOrEqual(IDLE_CREEP_FORCE);
    });

    it('no creep force when braking', () => {
        const dt = new Drivetrain(SPECS);
        expect(dt.update(0, 0, true, 1 / 60)).toBe(0);
    });

    it('no creep force in neutral', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = 0;
        expect(dt.update(0, 0, false, 1 / 60)).toBe(0);
    });

    it('negative creep force in reverse', () => {
        const dt = new Drivetrain(SPECS);
        dt.currentGear = -1;
        expect(dt.update(0, 0, false, 1 / 60)).toBeLessThan(0);
    });
});

describe('Non-linear throttle', () => {
    it('cubic: 50% input → ~12.5% effective', () => {
        const dt = new Drivetrain(SPECS);
        dt.update(5, 0.5, false, 1 / 60);
        expect(dt.throttle).toBeCloseTo(0.125, 2);
    });

    it('full input → full effective', () => {
        const dt = new Drivetrain(SPECS);
        dt.update(5, 1.0, false, 1 / 60);
        expect(dt.throttle).toBe(1.0);
    });
});

describe('Fuel consumption', () => {
    it('burns fuel over time', () => {
        const dt = new Drivetrain(SPECS);
        const initial = dt.fuel;
        for (let i = 0; i < 600; i++) dt.update(10, 1.0, false, 1 / 60);
        expect(dt.fuel).toBeLessThan(initial);
        expect(dt.fuel).toBeGreaterThan(0);
    });
});
