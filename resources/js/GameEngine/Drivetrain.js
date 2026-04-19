/**
 * @module Drivetrain
 * High-fidelity drivetrain — per-bus torque curve from JSON specs,
 * rigid RPM-to-wheel coupling (direct drive), fuel cut limiter,
 * automatic clutch slip at low RPM, and aerodynamic drag model.
 *
 * ## Torque Curve (5-point interpolation)
 * Built from per-bus anchor points every 50 RPM:
 *   (0, 0) → (idle_rpm, torque_idle) → (peak_start, peak_torque) →
 *   (peak_end, peak_torque) → (redline, torque_redline)
 *
 * ## Direct Drive
 * RPM = wheelSpeed × gearRatio × FINAL_DRIVE_RATIO × 60 / (2π).
 * No inertia blending — RPM is rigidly coupled to wheel rotation.
 *
 * ## Automatic Clutch
 * When computed RPM < idle_rpm, clutch disengages proportionally
 * (clutch = computedRPM / idle_rpm). Engine holds at idle RPM.
 *
 * ## Fuel Cut
 * When RPM >= max_rpm, engine force = 0. Resumes at max_rpm - 100.
 */

/** @constant {number} Final-drive (differential) ratio */
const FINAL_DRIVE_RATIO = 2.8;
/** @constant {number} Tyre rolling radius in metres — must match PhysicsWorld */
const WHEEL_RADIUS = 0.35;
/** @constant {number} Base fuel consumption rate (L / s / load-unit) */
const FUEL_RATE_BASE = 0.00008;
/** @constant {number} Air density at sea level (kg/m³) */
const AIR_DENSITY = 1.225;
/** @constant {number} Rolling resistance coefficient (asphalt) */
const ROLLING_RESISTANCE_COEFF = 0.008;
/** @constant {number} Gravity (m/s²) */
const GRAVITY = 9.82;
/** @constant {number} Idle creep force in Newtons */
const IDLE_CREEP_FORCE = 350;
/** @constant {number} Clutch engagement time in seconds (for gear shifts) */
const CLUTCH_ENGAGE_TIME = 0.8;
/** @constant {number} Step size for torque interpolation table */
const TORQUE_TABLE_STEP = 50;

/**
 * Build a linearly-interpolated torque lookup table (Nm) every TORQUE_TABLE_STEP RPM.
 *
 * Anchor points (5):
 *   (0, 0) → (idleRpm, idleTorque) → (peakStart, peakTorque) →
 *   (peakEnd, peakTorque) → (redline, redlineTorque)
 *
 * @param {number} idleRpm
 * @param {number} redline
 * @param {number} idleTorque    — Nm at idle
 * @param {number} peakTorque    — Nm at peak plateau
 * @param {number} peakStart     — RPM where peak plateau begins
 * @param {number} peakEnd       — RPM where peak plateau ends
 * @param {number} redlineTorque — Nm at redline
 * @returns {Float64Array} — torque[i] = Nm at RPM = i × TORQUE_TABLE_STEP
 */
function buildTorqueTable(idleRpm, redline, idleTorque, peakTorque, peakStart, peakEnd, redlineTorque) {
    const anchors = [
        [0, 0],
        [idleRpm, idleTorque],
        [peakStart, peakTorque],
        [peakEnd, peakTorque],
        [redline, redlineTorque],
    ];

    const size = Math.floor(redline / TORQUE_TABLE_STEP) + 2;
    const table = new Float64Array(size);

    for (let i = 0; i < size; i++) {
        const rpm = i * TORQUE_TABLE_STEP;
        if (rpm >= redline) {
            table[i] = redlineTorque;
            continue;
        }

        // Find surrounding anchors
        let lo = anchors[0];
        let hi = anchors[anchors.length - 1];
        for (let a = 0; a < anchors.length - 1; a++) {
            if (rpm >= anchors[a][0] && rpm <= anchors[a + 1][0]) {
                lo = anchors[a];
                hi = anchors[a + 1];
                break;
            }
        }

        const range = hi[0] - lo[0];
        if (range <= 0) {
            table[i] = lo[1];
        } else {
            const t = (rpm - lo[0]) / range;
            table[i] = lo[1] + t * (hi[1] - lo[1]);
        }
    }

    return table;
}

export class Drivetrain {
    /**
     * @param {object} specs — bus catalog specs from the server
     */
    constructor(specs) {
        specs = specs || {};

        // ── Per-bus engine parameters ────────────────────────
        this.peakTorque       = Number(specs.engine_torque_nm)       || 400;
        this.engineHP         = Number(specs.engine_hp)              || 150;
        this.idleRPM          = Number(specs.idle_rpm)               || 800;
        this.redlineRPM       = Number(specs.redline_rpm)            || 3200;
        this.peakTorqueRPMLow = Number(specs.peak_torque_rpm_low)    || 1800;
        this.peakTorqueRPMHigh= Number(specs.peak_torque_rpm_high)   || 2500;
        this.torqueIdleNm     = Number(specs.torque_idle_nm)         || 150;
        this.torqueRedlineNm  = Number(specs.torque_redline_nm)      || 120;

        // ── Build torque interpolation table ─────────────────
        this._torqueTable = buildTorqueTable(
            this.idleRPM, this.redlineRPM,
            this.torqueIdleNm, this.peakTorque,
            this.peakTorqueRPMLow, this.peakTorqueRPMHigh,
            this.torqueRedlineNm,
        );

        // ── Drag model ───────────────────────────────────────
        const busWidth  = Number(specs.width_m)  || 2.0;
        const busHeight = Number(specs.height_m) || 2.6;
        const Cd = Number(specs.drag_coefficient) || 0.70;
        const frontalArea = busWidth * busHeight * 0.35;
        this.dragFactor = 0.5 * AIR_DENSITY * Cd * frontalArea;

        // ── Rolling resistance ────────────────────────────────
        const mass = Number(specs.base_weight_kg) || 3500;
        this.rollingResistance = ROLLING_RESISTANCE_COEFF * mass * GRAVITY;

        // ── Gear ratios ──────────────────────────────────────
        const ratios = specs.gear_ratios || {};
        this.forwardGears = Object.entries(ratios)
            .filter(([k]) => k !== 'R')
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, v]) => Number(v));
        this.reverseRatio = Number(ratios['R']) || this.forwardGears[0] || 4.0;

        this.currentGear = 1;
        this.rpm = this.idleRPM;
        this.throttle = 0;
        this.braking = false;

        // ── Clutch state ─────────────────────────────────────
        /** 0 = fully disengaged, 1 = fully engaged */
        this.clutch = 1.0;
        /** Shift-triggered clutch timer (0 = no shift in progress) */
        this._shiftClutchTimer = 0;

        // ── Fuel cut state ───────────────────────────────────
        this._fuelCut = false;

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
     * Lookup torque (Nm) from the interpolated table.
     * @param {number} rpm
     * @returns {number} torque in Nm
     */
    torqueCurve(rpm) {
        if (rpm <= 0) return 0;
        if (rpm >= this.redlineRPM) return this.torqueRedlineNm;

        const idx = rpm / TORQUE_TABLE_STEP;
        const lo = Math.floor(idx);
        const hi = lo + 1;

        if (hi >= this._torqueTable.length) return this._torqueTable[lo] || 0;

        const t = idx - lo;
        return this._torqueTable[lo] * (1 - t) + this._torqueTable[hi] * t;
    }

    /**
     * Rigid RPM computation from wheel speed — direct drive, no slip.
     * @param {number} wheelSpeed — angular speed in rad/s
     * @returns {number} engine RPM (clamped to [0, redlineRPM])
     */
    computeRPM(wheelSpeed) {
        const ratio = Math.abs(this.currentRatio);
        if (ratio === 0) return this.idleRPM;
        const engineRadPerSec = wheelSpeed * ratio * FINAL_DRIVE_RATIO;
        const computedRPM = (engineRadPerSec * 60) / (2 * Math.PI);
        return Math.max(0, Math.min(this.redlineRPM, computedRPM));
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
     *
     * Direct drive model:
     *  1. Compute RPM rigidly from wheel speed
     *  2. Auto-clutch when RPM < idle_rpm
     *  3. Fuel cut when RPM >= max_rpm
     *  4. Look up torque from interpolation table
     *  5. Force = torque × throttle × gear × finalDrive / wheelRadius × clutch
     *
     * @param {number} wheelSpeed — rear wheel angular speed (rad/s)
     * @param {number} throttleInput — 0..1 raw input
     * @param {boolean} isBraking
     * @param {number} dt — frame delta in seconds
     * @returns {number} engine force in Newtons
     */
    update(wheelSpeed, throttleInput, isBraking, dt) {
        // ── Non-linear throttle (cubic) ──────────────────────
        this.throttle = throttleInput * throttleInput * throttleInput;
        this.braking = isBraking;

        // ── Rigid RPM from wheel speed ───────────────────────
        const rawRPM = this.computeRPM(wheelSpeed);

        // ── Auto-clutch at low RPM ───────────────────────────
        // When wheel-driven RPM is below idle, disengage clutch
        // proportionally so the engine stays at idle RPM.
        let autoClutch = 1.0;
        if (rawRPM < this.idleRPM && this.currentGear !== 0) {
            autoClutch = this.idleRPM > 0 ? rawRPM / this.idleRPM : 0;
            this.rpm = this.idleRPM;
        } else {
            this.rpm = rawRPM;
        }

        // ── Shift clutch ramp ────────────────────────────────
        // After a gear change, shift clutch ramps 0 → 1
        if (this._shiftClutchTimer > 0) {
            this._shiftClutchTimer = Math.max(0, this._shiftClutchTimer - dt);
            this.clutch = 1.0 - (this._shiftClutchTimer / CLUTCH_ENGAGE_TIME);
        } else {
            this.clutch = autoClutch;
        }

        // ── No fuel → engine dies ────────────────────────────
        if (!this.hasFuel) {
            this.rpm = 0;
            return 0;
        }

        // ── Fuel cut limiter ─────────────────────────────────
        if (this.rpm >= this.redlineRPM) {
            this._fuelCut = true;
        } else if (this._fuelCut && this.rpm < this.redlineRPM - 100) {
            this._fuelCut = false;
        }

        // ── Fuel consumption ─────────────────────────────────
        const load = (this.rpm / this.redlineRPM) * this.throttle;
        const consumption = FUEL_RATE_BASE * load * this.peakTorque * dt;
        this.fuel = Math.max(0, this.fuel - consumption);

        // ── Engine force ─────────────────────────────────────
        const ratio = this.currentRatio;
        if (ratio === 0) return 0;  // neutral → no force

        // Fuel cut active → no power
        if (this._fuelCut) return 0;

        // Idle creep: when in gear, no throttle, no brake → gentle forward push.
        // Creep bypasses auto-clutch — it's the torque converter / idle engagement.
        if (this.throttle === 0) {
            if (!this.braking && this.currentGear !== 0) {
                const sign = this.currentGear === -1 ? -1 : 1;
                return sign * IDLE_CREEP_FORCE;
            }
            return 0;
        }

        // Torque from interpolated table (actual Nm)
        const torqueNm = this.torqueCurve(this.rpm);
        const wheelTorque = torqueNm * this.throttle
            * Math.abs(ratio) * FINAL_DRIVE_RATIO;
        const force = (wheelTorque / WHEEL_RADIUS) * this.clutch;

        return this.currentGear === -1 ? -force : force;
    }

    shiftUp() {
        if (this.currentGear < this.gearCount) {
            this.currentGear++;
            this._shiftClutchTimer = CLUTCH_ENGAGE_TIME;
        }
    }

    shiftDown() {
        if (this.currentGear > -1) {
            this.currentGear--;
            this._shiftClutchTimer = CLUTCH_ENGAGE_TIME;
        }
    }
}

export {
    FINAL_DRIVE_RATIO,
    WHEEL_RADIUS,
    CLUTCH_ENGAGE_TIME,
    IDLE_CREEP_FORCE,
    TORQUE_TABLE_STEP,
    buildTorqueTable,
};
