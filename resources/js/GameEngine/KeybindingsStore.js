/**
 * @module KeybindingsStore
 * Reactive keybinding configuration persisted to localStorage.
 * Provides default WASD controls with ability to rebind any action.
 */
import { reactive, watch } from 'vue';

/** @constant {string} localStorage key for persisting bindings */
const STORAGE_KEY = 'hotbusdrive_keybindings';

/** @constant {object} Default key mappings (key values are KeyboardEvent.key lowercase) */
const DEFAULT_BINDINGS = {
    throttle:  'w',
    brake:     's',
    steerLeft: 'a',
    steerRight:'d',
    shiftUp:   'e',
    shiftDown: 'q',
    pause:     'escape',
};

/** Human-readable labels for each action */
export const ACTION_LABELS = {
    throttle:   'Acelerar',
    brake:      'Frenar',
    steerLeft:  'Girar izquierda',
    steerRight: 'Girar derecha',
    shiftUp:    'Subir marcha',
    shiftDown:  'Bajar marcha',
    pause:      'Pausar',
};

/**
 * Load saved bindings from localStorage, falling back to defaults.
 * @returns {object} merged keybinding map
 */
function loadBindings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults so new actions get their default key
            return { ...DEFAULT_BINDINGS, ...parsed };
        }
    } catch {
        // Corrupted data — fall back to defaults
    }
    return { ...DEFAULT_BINDINGS };
}

/**
 * Persist current bindings to localStorage.
 * @param {object} bindings
 */
function saveBindings(bindings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch {
        // Storage full or unavailable — silently ignore
    }
}

/** Reactive keybindings state */
export const keybindings = reactive(loadBindings());

// Auto-persist whenever a binding changes
watch(keybindings, (val) => saveBindings(val), { deep: true });

/**
 * Reset all bindings to defaults.
 */
export function resetBindings() {
    Object.assign(keybindings, DEFAULT_BINDINGS);
}

/**
 * Get the action name for a given key press.
 * @param {string} key — KeyboardEvent.key (lowercase)
 * @returns {string|null} action name or null if unbound
 */
export function getActionForKey(key) {
    const lower = key.toLowerCase();
    for (const [action, boundKey] of Object.entries(keybindings)) {
        if (boundKey === lower) return action;
    }
    return null;
}

/**
 * Check if a key corresponds to a specific action.
 * @param {string} key — KeyboardEvent.key (lowercase)
 * @param {string} action — action name (e.g. 'throttle')
 * @returns {boolean}
 */
export function isAction(key, action) {
    return key.toLowerCase() === keybindings[action];
}

export { DEFAULT_BINDINGS };
