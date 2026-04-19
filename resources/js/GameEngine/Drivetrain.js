/**
 * Drivetrain simulation — RPM, torque curve, gear shifting, fuel consumption.
 *
 * Diesel torque curve peaks between 1800–2500 RPM then tapers off.
 * Fuel consumption is proportional to engine load (RPM × throttle).
 */

const IDLE_RPM = 800;
const REDLINE_RPM = 3200;
const PEAK_TORQUE_RPM_LOW = 1800;
const PEAK_TORQUE_RPM_HIGH = 2500;
const FINAL_DRIVE_RATIO = 4.1;
const WHEEL_RADIUS = 0.35; // metres — must match PhysicsWorld
const FUEL_RATE_BASE = 0.00008; // litres per second per unit load

export class Drivetrain {
    /**
     * @param {object} specs
     * @param {number} specs.engine_torque_nm  — peak torque in Nm
     * @param {object} specs.gear_ratios       — { "1": 5.18, "2": 2.86, …, "R": 5.18 }
     * @param {number} specs.fuel_capacity_liters
     * @param {number} specs.current_fuel_liters
     */
    constructor(specs) {
        this.peakTorque = specs.engine_torque_nm || 400;

        // Parse gear ratios — forward gears sorted numerically, reverse separate
        const ratios = specs.gear_ratios || {};
        this.forwardGears = Object.entries(ratios)
            .filter(([k]) => k !== 'R')
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, v]) => v);
        this.reverseRatio = ratios['R'] || this.forwardGears[0] || 4.0;

        this.currentGear = 1; // 1-indexed; 0 = neutral, -1 = reverse
        this.rpm = IDLE_RPM;
        this.throttle = 0; // 0..1
        this.braking = false;

        // Fuel
        this.fuelCapacity = specs.fuel_capacity_liters || 100;
        this.fuel = specs.current_fuel_liters ?? this.fuelCapacity;
    }

    /** Number of forward gears available */
    get gearCount() {
        return this.forwardGears.length;
    }

    /** Current gear ratio (forward, reverse, or 0 for neutral) */
    get currentRatio() {
        if (this.currentGear > 0 && this.currentGear <= this.forwardGears.length) {
            return this.forwardGears[this.currentGear - 1];
        }
        if (this.currentGear === -1) return this.reverseRatio;
        return 0; // neutral
    }

    /** Gear label for HUD */
    get gearLabel() {
        if (this.currentGear === -1) return 'R';
        if (this.currentGear === 0) return 'N';
        return String(this.currentGear);
    }

    get hasFuel() {
        return this.fuel > 0;
    }

    /**
     * Diesel torque curve — normalised multiplier 0..1.
     * Plateau between PEAK_TORQUE_RPM_LOW and PEAK_TORQUE_RPM_HIGH,
     * ramps up from idle and drops off toward redline.
     */
    torqueCurve(rpm) {
        if (rpm <= IDLE_RPM) return 0.4;
        if (rpm >= REDLINE_RPM) return 0.3;
        if (rpm >= PEAK_TORQUE_RPM_LOW && rpm <= PEAK_TORQUE_RPM_HIGH) return 1.0;

        // Ramp up (idle → peak)
        if (rpm < PEAK_TORQUE_RPM_LOW) {
            const t = (rpm - IDLE_RPM) / (PEAK_TORQUE_RPM_LOW - IDLE_RPM);
            return 0.4 + t * 0.6;
        }
        // Taper off (peak → redline)
        const t = (rpm - PEAK_TORQUE_RPM_HIGH) / (REDLINE_RPM - PEAK_TORQUE_RPM_HIGH);
        return 1.0 - t * 0.7;
    }

    /**
     * Compute RPM from wheel angular speed and current gear.
     * @param {number} wheelSpeed — average rear wheel speed in rad/s (absolute)
     */
    computeRPM(wheelSpeed) {
        const ratio = Math.abs(this.currentRatio);
        if (ratio === 0) return IDLE_RPM;
        const engineRadPerSec = wheelSpeed * ratio * FINAL_DRIVE_RATIO;
        const computedRPM = (engineRadPerSec * 60) / (2 * Math.PI);
        return Math.max(IDLE_RPM, Math.min(REDLINE_RPM, computedRPM));
    }

    /**
     * Main update — call every frame.
     * Returns the engineForce to apply to rear wheels.
     *
     * @param {number} wheelSpeed — average absolute rear wheel angular speed (rad/s)
     * @param {number} throttleInput — 0..1 (W key)
     * @param {boolean} isBraking
     * @param {number} dt — delta time in seconds
     * @returns {number} engineForce in Newtons
     */
    update(wheelSpeed, throttleInput, isBraking, dt) {
        this.throttle = throttleInput;
        this.braking = isBraking;

        // RPM
        this.rpm = this.computeRPM(wheelSpeed);

        // No fuel — engine dies
        if (!this.hasFuel) {
            this.rpm = 0;
            return 0;
        }

        // Fuel consumption — proportional to (RPM/REDLINE) × throttle
        const load = (this.rpm / REDLINE_RPM) * this.throttle;
        const consumption = FUEL_RATE_BASE * load * this.peakTorque * dt;
        this.fuel = Math.max(0, this.fuel - consumption);

        // Engine force
        const ratio = this.currentRatio;
        if (ratio === 0 || this.throttle === 0) return 0;

        const torqueMultiplier = this.torqueCurve(this.rpm);
        const wheelTorque = this.peakTorque * torqueMultiplier * this.throttle
            * Math.abs(ratio) * FINAL_DRIVE_RATIO;
        const force = wheelTorque / WHEEL_RADIUS;

        // Reverse direction
        return ratio < 0 ? -force : (this.currentGear === -1 ? -force : force);
    }

    /** Shift up — clamp at max gear */
    shiftUp() {
        if (this.currentGear < this.gearCount) {
            this.currentGear++;
        }
    }

    /** Shift down — goes through neutral to reverse */
    shiftDown() {
        if (this.currentGear > -1) {
            this.currentGear--;
        }
    }
}

export { IDLE_RPM, REDLINE_RPM };
