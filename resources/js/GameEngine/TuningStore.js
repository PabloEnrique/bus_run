/**
 * @module TuningStore
 * Per-bus tuning overrides persisted to localStorage.
 * Each bus has its own tuning profile keyed by bus catalog ID.
 * Overrides are merged on top of the original bus specs at race time.
 */
import { reactive } from 'vue';

/** @constant {string} localStorage key prefix */
const STORAGE_PREFIX = 'hotbusdrive_tuning_';

/**
 * Tunable parameter keys and their default multiplier/value info.
 * steering_speed is a multiplier (1.0 = default), everything else
 * is an absolute value override.
 */
const TUNABLE_KEYS = [
    'gear_ratios',
    'redline_rpm',
    'idle_rpm',
    'peak_torque_rpm_low',
    'peak_torque_rpm_high',
    'torque_idle_nm',
    'torque_redline_nm',
    'engine_torque_nm',
    'steering_speed',
];

/**
 * Load tuning overrides for a specific bus from localStorage.
 * @param {number|string} busId
 * @returns {object|null} overrides object or null if none saved
 */
function loadFromStorage(busId) {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + busId);
        if (raw) return JSON.parse(raw);
    } catch {
        // Corrupted data — ignore
    }
    return null;
}

/**
 * Persist tuning overrides for a specific bus to localStorage.
 * @param {number|string} busId
 * @param {object} overrides
 */
function persistToStorage(busId, overrides) {
    try {
        localStorage.setItem(STORAGE_PREFIX + busId, JSON.stringify(overrides));
    } catch {
        // Storage full or unavailable
    }
}

/**
 * Remove tuning overrides for a specific bus from localStorage.
 * @param {number|string} busId
 */
function removeFromStorage(busId) {
    try {
        localStorage.removeItem(STORAGE_PREFIX + busId);
    } catch {
        // Ignore
    }
}

/**
 * Get tuning overrides for a bus. Returns a reactive object
 * containing only the overridden fields (not full bus specs).
 * @param {number|string} busId
 * @returns {object} reactive overrides (may be empty)
 */
export function getTuning(busId) {
    const saved = loadFromStorage(busId);
    return reactive(saved || {});
}

/**
 * Check if a bus has any custom tuning saved.
 * @param {number|string} busId
 * @returns {boolean}
 */
export function hasTuning(busId) {
    return loadFromStorage(busId) !== null;
}

/**
 * Save tuning overrides for a bus. Only stores the provided fields.
 * @param {number|string} busId
 * @param {object} overrides — partial object with tunable fields
 */
export function saveTuning(busId, overrides) {
    // Filter to only tunable keys to prevent storing garbage
    const clean = {};
    for (const key of TUNABLE_KEYS) {
        if (key in overrides && overrides[key] !== undefined) {
            clean[key] = overrides[key];
        }
    }
    persistToStorage(busId, clean);
}

/**
 * Reset tuning for a bus back to catalog defaults (remove overrides).
 * @param {number|string} busId
 */
export function resetTuning(busId) {
    removeFromStorage(busId);
}

/**
 * Merge bus catalog specs with any saved tuning overrides.
 * Returns a new object with overrides taking precedence.
 * Adds steering_speed = 1.0 if not present in overrides.
 * @param {object} busSpecs — original bus catalog specs
 * @param {number|string} busId
 * @returns {object} merged specs ready for Drivetrain constructor
 */
export function getMergedSpecs(busId, busSpecs) {
    const overrides = loadFromStorage(busId) || {};
    const merged = { ...busSpecs };

    for (const key of TUNABLE_KEYS) {
        if (key in overrides && overrides[key] !== undefined) {
            merged[key] = overrides[key];
        }
    }

    // Ensure steering_speed always has a value
    if (!merged.steering_speed) {
        merged.steering_speed = 1.0;
    }

    return merged;
}

export { TUNABLE_KEYS, STORAGE_PREFIX };
