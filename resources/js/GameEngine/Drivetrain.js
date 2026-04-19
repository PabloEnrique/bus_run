/**
 * @module Drivetrain
 * Drivetrain simulation — RPM with engine inertia, torque curve, gear shifting,
 * fuel consumption.
 *
 * ## RPM Inertia Model
 * Instead of snapping RPM to wheel-derived speed (which stays at IDLE when
 * stationary, producing only 40 % torque), RPM now **lerps** toward a target:
 *
 *   targetRPM = max(wheelDerivedRPM, throttleTargetRPM)
 *   rpm += (targetRPM − rpm) × min(1, ENGINE_INERTIA × dt)
 *
 * `throttleTargetRPM` simulates the engine revving before the wheels catch up
 * (clutch engagement). This lets the bus produce strong launch force from a
 * standstill. `ENGINE_INERTIA` (5.0 s⁻¹) means RPM reaches ~95 % of target
 * in ≈ 0.6 s — responsive but not instant.
 *
 * ## Diesel Torque Curve
 * Normalised multiplier 0.3–1.0 peaking as a plateau between 1 800–2 500 RPM,
 * ramping from 0.4 at idle (800) and tapering to 0.3 at redline (3 200).
 *
 * ## Fuel Consumption
 * Proportional to `(RPM / REDLINE) × throttle × peakTorque`.
 */

/** @constant {number} Engine idle speed in RPM */
const IDLE_RPM = 800;
/** @constant {number} Engine rev limiter in RPM */
const REDLINE_RPM = 3200;
/** @constant {number} Start of peak torque plateau (RPM) */
const PEAK_TORQUE_RPM_LOW = 1800;
/** @constant {number} End of peak torque plateau (RPM) */
const PEAK_TORQUE_RPM_HIGH = 2500;
/** @constant {number} Final-drive (differential) ratio */
const FINAL_DRIVE_RATIO = 4.1;
/** @constant {number} Tyre rolling radius in metres — must match PhysicsWorld */
const WHEEL_RADIUS = 0.35;
/** @constant {number} Base fuel consumption rate (L / s / load-unit) */
const FUEL_RATE_BASE = 0.00008;
/**
 * @constant {number} Engine inertia factor (s⁻¹).
 * Controls how quickly RPM approaches its target.
 * Higher = faster response; 5.0 ≈ 95 % in 0.6 s.
 */
const ENGINE_INERTIA = 5.0;

export class Drivetrain {
    /**
     * @param {object} specs — bus catalog specs from the server
     * @param {number} specs.engine_torque_nm  — peak torque in Nm
     * @param {object} specs.gear_ratios       — e.g. { "1": 5.18, "2": 2.86, …, "R": 5.18 }
     * @param {number} specs.fuel_capacity_liters
     * @param {number} specs.current_fuel_liters
     */
    constructor(specs) {
        specs = specs || {};
        /** @type {number} Peak engine torque (Nm) */
        this.peakTorque = Number(specs.engine_torque_nm) || 400;

        // Parse gear ratios — forward gears sorted numerically, reverse separate
        const ratios = specs.gear_ratios || {};
        /** @type {number[]} Forward gear ratios sorted 1st → 6th */
        this.forwardGears = Object.entries(ratios)
            .filter(([k]) => k !== 'R')
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, v]) => Number(v));
        /** @type {number} Reverse gear ratio */
        this.reverseRatio = Number(ratios['R']) || this.forwardGears[0] || 4.0;

        /** @type {number} Current gear: -1 = R, 0 = N, 1–6 = forward */
        this.currentGear = 1;
        /** @type {number} Current engine RPM (smoothed via inertia) */
        this.rpm = IDLE_RPM;
        /** @type {number} Throttle position 0..1 */
        this.throttle = 0;
        /** @type {boolean} Whether the brake is engaged */
        this.braking = false;

        /** @type {number} Fuel tank capacity in litres */
        this.fuelCapacity = specs.fuel_capacity_liters || 100;
        /** @type {number} Current fuel level in litres */
        this.fuel = specs.current_fuel_liters ?? this.fuelCapacity;
    }

    /** @returns {number} Number of forward gears available */
    get gearCount() {
        return this.forwardGears.length;
    }

    /**
     * Current gear ratio (forward, reverse, or 0 for neutral).
     * @returns {number}
     */
    get currentRatio() {
        if (this.currentGear > 0 && this.currentGear <= this.forwardGears.length) {
            return this.forwardGears[this.currentGear - 1];
        }
        if (this.currentGear === -1) return this.reverseRatio;
        return 0; // neutral
    }

    /**
     * Gear label for HUD display.
     * @returns {string} "R", "N", or "1"–"6"
     */
    get gearLabel() {
        if (this.currentGear === -1) return 'R';
        if (this.currentGear === 0) return 'N';
        return String(this.currentGear);
    }

    /** @returns {boolean} True while fuel remains */
    get hasFuel() {
        return this.fuel > 0;
    }

    /**
     * Diesel torque curve — normalised multiplier (0.3 – 1.0).
     *
     * ```
     *  1.0 ┤         ┌────────┐
     *      │        /          \
     *  0.4 ├───────/            \
     *  0.3 ├                     ──── (redline)
     *      └──┬───┬──┬────────┬──┬──
     *        800 1800       2500 3200  RPM
     * ```
     *
     * @param {number} rpm — engine speed
     * @returns {number} Multiplier 0.3–1.0
     */
    torqueCurve(rpm) {
        if (rpm <= IDLE_RPM) return 0.4;
        if (rpm >= REDLINE_RPM) return 0.3;
        if (rpm >= PEAK_TORQUE_RPM_LOW && rpm <= PEAK_TORQUE_RPM_HIGH) return 1.0;

        if (rpm < PEAK_TORQUE_RPM_LOW) {
            const t = (rpm - IDLE_RPM) / (PEAK_TORQUE_RPM_LOW - IDLE_RPM);
            return 0.4 + t * 0.6;
        }
        const t = (rpm - PEAK_TORQUE_RPM_HIGH) / (REDLINE_RPM - PEAK_TORQUE_RPM_HIGH);
        return 1.0 - t * 0.7;
    }

    /**
     * Derive RPM from rear wheel angular speed via gear + final-drive ratios.
     *
     * Formula: `RPM = (wheelSpeed × gearRatio × finalDrive × 60) / (2π)`
     *
     * @param {number} wheelSpeed — average rear wheel speed in rad/s (absolute)
     * @returns {number} RPM clamped to [IDLE_RPM, REDLINE_RPM]
     */
    computeRPM(wheelSpeed) {
        const ratio = Math.abs(this.currentRatio);
        if (ratio === 0) return IDLE_RPM;
        const engineRadPerSec = wheelSpeed * ratio * FINAL_DRIVE_RATIO;
        const computedRPM = (engineRadPerSec * 60) / (2 * Math.PI);
        return Math.max(IDLE_RPM, Math.min(REDLINE_RPM, computedRPM));
    }

    /**
     * Main per-frame update. Computes engine RPM with inertia smoothing,
     * burns fuel, and returns the force (N) to apply to rear wheels.
     *
     * ### RPM Inertia
     * ```
     * targetRPM = max(wheelDerivedRPM, IDLE + throttle × 0.75 × (REDLINE − IDLE))
     * rpm += (targetRPM − rpm) × min(1, ENGINE_INERTIA × dt)
     * ```
     *
     * @param {number} wheelSpeed — average absolute rear wheel angular speed (rad/s)
     * @param {number} throttleInput — 0..1 (W key)
     * @param {boolean} isBraking
     * @param {number} dt — delta time in seconds
     * @returns {number} engineForce in Newtons (positive = forward, negative = reverse)
     */
    update(wheelSpeed, throttleInput, isBraking, dt) {
        this.throttle = throttleInput;
        this.braking = isBraking;

        // ── RPM with inertia ─────────────────────────────────
        const wheelRPM = this.computeRPM(wheelSpeed);
        // Throttle lets the engine rev independently of wheel speed (clutch model)
        const throttleTargetRPM = IDLE_RPM + this.throttle * (REDLINE_RPM - IDLE_RPM) * 0.75;
        const targetRPM = Math.max(wheelRPM, throttleTargetRPM);
        // Smooth approach — ENGINE_INERTIA controls responsiveness
        const alpha = Math.min(1, ENGINE_INERTIA * dt);
        this.rpm = this.rpm + (targetRPM - this.rpm) * alpha;
        // Clamp to safe range
        this.rpm = Math.max(IDLE_RPM, Math.min(REDLINE_RPM, this.rpm));

        // ── No fuel → engine dies ────────────────────────────
        if (!this.hasFuel) {
            this.rpm = 0;
            return 0;
        }

        // ── Fuel consumption ─────────────────────────────────
        const load = (this.rpm / REDLINE_RPM) * this.throttle;
        const consumption = FUEL_RATE_BASE * load * this.peakTorque * dt;
        this.fuel = Math.max(0, this.fuel - consumption);

        // ── Engine force ─────────────────────────────────────
        const ratio = this.currentRatio;
        if (ratio === 0 || this.throttle === 0) return 0;

        const torqueMultiplier = this.torqueCurve(this.rpm);
        const wheelTorque = this.peakTorque * torqueMultiplier * this.throttle
            * Math.abs(ratio) * FINAL_DRIVE_RATIO;
        const force = wheelTorque / WHEEL_RADIUS;

        return this.currentGear === -1 ? -force : force;
    }

    /** Shift up — clamp at max forward gear. */
    shiftUp() {
        if (this.currentGear < this.gearCount) {
            this.currentGear++;
        }
    }

    /** Shift down — goes through neutral (0) to reverse (-1). */
    shiftDown() {
        if (this.currentGear > -1) {
            this.currentGear--;
        }
    }
}

export { IDLE_RPM, REDLINE_RPM, ENGINE_INERTIA, FINAL_DRIVE_RATIO, WHEEL_RADIUS };
