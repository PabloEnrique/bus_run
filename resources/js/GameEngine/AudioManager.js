/**
 * @module AudioManager
 * Synthetic diesel engine audio using Web Audio API OscillatorNode.
 * Pitch and volume are tied to RPM and throttle — no external audio
 * assets required.
 *
 * Usage:
 *   const audio = new AudioManager();
 *   // In game loop:
 *   audio.update(rpm, throttle, redlineRPM);
 *   // On cleanup:
 *   audio.destroy();
 *
 * The AudioContext is created on the first call to `update()` to satisfy
 * the browser's user-gesture requirement (the game loop runs after a
 * click/keypress).
 */

export class AudioManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        /** @type {OscillatorNode|null} */
        this.oscillator = null;
        /** @type {GainNode|null} */
        this.gain = null;
        /** @type {BiquadFilterNode|null} */
        this.filter = null;
        this._started = false;
    }

    /**
     * Lazily initialise the AudioContext and nodes.
     * Called on the first update() — this guarantees we're inside a
     * user-gesture-initiated call chain.
     * @private
     */
    _init() {
        if (this._started) return;
        this._started = true;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Main gain (master volume)
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.ctx.destination);

        // Low-pass filter to soften the sawtooth into a diesel rumble
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 300;
        this.filter.Q.value = 2.0;
        this.filter.connect(this.gain);

        // Sawtooth oscillator — base frequency mapped to idle RPM
        this.oscillator = this.ctx.createOscillator();
        this.oscillator.type = 'sawtooth';
        this.oscillator.frequency.value = 40;
        this.oscillator.connect(this.filter);
        this.oscillator.start();
    }

    /**
     * Update engine sound per frame.
     * @param {number} rpm — current engine RPM
     * @param {number} throttle — effective throttle 0–1
     * @param {number} redlineRPM — per-bus redline
     */
    update(rpm, throttle, redlineRPM) {
        if (!this._started) this._init();
        if (!this.ctx || this.ctx.state === 'closed') return;

        // Resume if suspended (browser autoplay policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const rpmNorm = Math.max(0, Math.min(1, rpm / (redlineRPM || 3200)));

        // Frequency: 40 Hz (idle rumble) → 120 Hz (redline whine)
        const freq = 40 + rpmNorm * 80;
        this.oscillator.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);

        // Filter cutoff opens with RPM — brighter sound at high revs
        const cutoff = 300 + rpmNorm * 600;
        this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.05);

        // Volume: base idle hum + throttle boost, capped at 0.15 to stay subtle
        const idleVol = 0.03;
        const throttleVol = throttle * 0.12;
        const vol = Math.min(0.15, idleVol + throttleVol * rpmNorm);
        this.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    }

    /**
     * Mute engine audio (e.g. on pause).
     */
    mute() {
        if (this.gain && this.ctx && this.ctx.state !== 'closed') {
            this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
        }
    }

    /**
     * Unmute engine audio (e.g. on resume).
     */
    unmute() {
        // Volume will be set correctly on the next update() call;
        // just resume the context in case it was suspended.
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Tear down audio nodes and close the context.
     */
    destroy() {
        if (this.oscillator) {
            try { this.oscillator.stop(); } catch (_) { /* already stopped */ }
            this.oscillator.disconnect();
            this.oscillator = null;
        }
        if (this.filter) {
            this.filter.disconnect();
            this.filter = null;
        }
        if (this.gain) {
            this.gain.disconnect();
            this.gain = null;
        }
        if (this.ctx && this.ctx.state !== 'closed') {
            this.ctx.close();
        }
        this.ctx = null;
        this._started = false;
    }
}
