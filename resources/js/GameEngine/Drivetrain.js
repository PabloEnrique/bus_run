/**
 * @module Drivetrain
 * Drivetrain simulation — per-bus powerband, RPM with engine inertia,
 * torque curve, gear shifting, aerodynamic drag, rolling resistance,
 * and fuel consumption.
 *
 * ## Per-Bus Powerband
 * Each bus defines its own `redline_rpm`, `peak_torque_rpm_low`,
 * `peak_torque_rpm_high`, and `engine_hp`. The torque curve shape is
 * the same but shifts according to these per-bus values.
 *
 * ## Aerodynamic Drag
 * `F_drag = 0.5 × ρ × Cd × A × v²` where:
 * - ρ = 1.225 kg/m³ (air density at sea level)
 * - Cd = drag_coefficient from bus specs (includes frontal area)
 * - v = vehicle speed in m/s
 * Top speed emerges naturally when drag + rolling resistance = engine force.
 *
 * ## Rolling Resistance
 * `F_roll = Crr × mass × g` (constant force opposing motion)
 */

/** @constant {number} Engine idle speed in RPM */
const IDLE_RPM = 800;
/** @constant {number} Default redline */
const DEFAULT_REDLINE_RPM = 3200;
/** @constant {number} Final-drive (differential) ratio */
const FINAL_DRIVE_RATIO = 4.1;
/** @constant {number} Tyre rolling radius in metres — must match PhysicsWorld */
const WHEEL_RADIUS = 0.35;
/** @constant {number} Base fuel consumption rate (L / s / load-unit) */
const FUEL_RATE_BASE = 0.00008;
/** @constant {number} Engine inertia factor (s⁻¹) */
const ENGINE_INERTIA = 5.0;
/** @constant {number} Air density at sea level (kg/m³) */
const AIR_DENSITY = 1.225;
/** @constant {number} Rolling resistance coefficient (asphalt) */
const ROLLING_RESISTANCE_COEFF = 0.012;
/** @constant {number} Gravity (m/s²) */
const GRAVITY = 9.82;

export class Drivetrain {
    /**
     * @param {object} specs — bus catalog specs from the server
     * @param {number} specs.engine_torque_nm
     * @param {number} [specs.engine_hp]
     * @param {number} [specs.redline_rpm]
     * @param {number} [specs.peak_torque_rpm_low]
     * @param {number} [specs.peak_torque_rpm_high]
     * @param {object} specs.gear_ratios
     * @param {number} specs.fuel_capacity_liters
     * @param {number} [specs.current_fuel_liters]
     * @param {number} [specs.base_weight_kg]
     * @param {number} [specs.drag_coefficient]
     * @param {number} [specs.width_m]
     * @param {number} [specs.height_m]
     */
    constructor(specs) {
        specs = specs || {};

        // ── Per-bus powerband ────────────────────────────────
        this.peakTorque       = Number(specs.engine_torque_nm)     || 400;
        this.engineHP         = Number(specs.engine_hp)            || 150;
        this.redlineRPM       = Number(specs.redline_rpm)          || DEFAULT_REDLINE_RPM;
        this.peakTorqueRPMLow = Number(specs.peak_torque_rpm_low)  || 1800;
        this.peakTorqueRPMHigh= Number(specs.peak_torque_rpm_high) || 2500;

        // ── Drag model ───────────────────────────────────────
        // drag_coefficient from specs is Cd (pure). Frontal area ≈ width × height × 0.85
        const busWidth  = Number(specs.width_m)  || 2.0;
        const busHeight = Number(specs.height_m) || 2.6;
        const Cd = Number(specs.drag_coefficient) || 0.70;
        const frontalArea = busWidth * busHeight * 0.85;
        /** @type {number} Precomputed 0.5 × ρ × Cd × A for drag force calc */
        this.dragFactor = 0.5 * AIR_DENSITY * Cd * frontalArea;

        // ── Rolling resistance ────────────────────────────────
        const mass = Number(specs.base_weight_kg) || 3500;
        /** @type {number} Constant rolling resistance force in N */
        this.rollingResistance = ROLLING_RESISTANCE_COEFF * mass * GRAVITY;

        // Parse gear ratios
        const ratios = specs.gear_ratios || {};
        this.forwardGears = Object.entries(ratios)
            .filter(([k]) => k !== 'R')
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, v]) => Number(v));
        this.reverseRatio = Number(ratios['R']) || this.forwardGears[0] || 4.0;

        this.currentGear = 1;
        this.rpm = IDLE_RPM;
        this.throttle = 0;
        this.braking = false;

        this.fuelCapacity = specs.fuel_capacity_liters || 100;
        this.fuel = specs.current_fuel_liters ?? this.fuelCapacity;
    }

    get gearCount() { return this.forwardGears.length; }

    get currentRatio() {
        if (this.currentGear > 0 && this.currentGear <= this.forwardGears.length) {
            return this.forwardGears[this.currentGear - 1];
        }
        if (this.currentGear === -1) return this.reverseRatio;
        return 0;
    }

    get gearLabel() {
        if (this.currentGear === -1) return 'R';
        if (this.currentGear === 0) return 'N';
        return String(this.currentGear);
    }

    get hasFuel() { return this.fuel > 0; }

    /**
     * Diesel torque curve — normalised multiplier (0.3–1.0).
     * Uses per-bus RPM breakpoints.
     */
    torqueCurve(rpm) {
        if (rpm <= IDLE_RPM) return 0.4;
        if (rpm >= this.redlineRPM) return 0.3;
        if (rpm >= this.peakTorqueRPMLow && rpm <= this.peakTorqueRPMHigh) return 1.0;

        if (rpm < this.peakTorqueRPMLow) {
            const t = (rpm - IDLE_RPM) / (this.peakTorqueRPMLow - IDLE_RPM);
            return 0.4 + t * 0.6;
        }
        const t = (rpm - this.peakTorqueRPMHigh) / (this.redlineRPM - this.peakTorqueRPMHigh);
        return 1.0 - t * 0.7;
    }

    computeRPM(wheelSpeed) {
        const ratio = Math.abs(this.currentRatio);
        if (ratio === 0) return IDLE_RPM;
        const engineRadPerSec = wheelSpeed * ratio * FINAL_DRIVE_RATIO;
        const computedRPM = (engineRadPerSec * 60) / (2 * Math.PI);
        return Math.max(IDLE_RPM, Math.min(this.redlineRPM, computedRPM));
    }

    /**
     * Compute aerodynamic drag force in Newtons.
     * @param {number} speedMs — vehicle speed in m/s
     * @returns {number} drag force (always positive, opposes motion)
     */
    computeDragForce(speedMs) {
        return this.dragFactor * speedMs * speedMs;
    }

    /**
     * Compute total resistance (drag + rolling) in Newtons.
     * @param {number} speedMs — vehicle speed in m/s
     * @returns {number} total resistance force (positive, opposes motion)
     */
    computeResistance(speedMs) {
        return this.computeDragForce(speedMs) + this.rollingResistance;
    }

    /**
     * Main per-frame update. Returns engine force (N) for rear wheels.
     * Drag and rolling resistance are returned separately via computeResistance().
     */
    update(wheelSpeed, throttleInput, isBraking, dt) {
        this.throttle = throttleInput;
        this.braking = isBraking;

        // ── RPM with inertia ─────────────────────────────────
        const wheelRPM = this.computeRPM(wheelSpeed);
        const throttleTargetRPM = IDLE_RPM + this.throttle * (this.redlineRPM - IDLE_RPM) * 0.75;
        const targetRPM = Math.max(wheelRPM, throttleTargetRPM);
        const alpha = Math.min(1, ENGINE_INERTIA * dt);
        this.rpm = this.rpm + (targetRPM - this.rpm) * alpha;
        this.rpm = Math.max(IDLE_RPM, Math.min(this.redlineRPM, this.rpm));

        // ── No fuel → engine dies ────────────────────────────
        if (!this.hasFuel) {
            this.rpm = 0;
            return 0;
        }

        // ── Fuel consumption ─────────────────────────────────
        const load = (this.rpm / this.redlineRPM) * this.throttle;
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

    shiftUp() {
        if (this.currentGear < this.gearCount) this.currentGear++;
    }

    shiftDown() {
        if (this.currentGear > -1) this.currentGear--;
    }
}

export { IDLE_RPM, DEFAULT_REDLINE_RPM as REDLINE_RPM, ENGINE_INERTIA, FINAL_DRIVE_RATIO, WHEEL_RADIUS };
