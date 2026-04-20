/**
 * @module maps/city
 * City map configuration — grid streets with buildings and intersections.
 *
 * Layout: 4×4 city blocks (each 40×40m) with 12m-wide streets between them.
 * Total area: ~200×200m. Bordered by concrete barriers.
 * Spawn at the south-west intersection facing north (+Z).
 */
export default {
    id: 'city',
    name: 'Ciudad',
    description: 'Calles urbanas con edificios y cruces. Ideal para practicar maniobras.',
    thumbnail: null,

    // ── Ground ────────────────────────────────────────────────
    groundSize: 300,        // metres, square ground plane visual
    groundColor: 0x3a3a3a,  // dark grey asphalt

    // ── Spawn ─────────────────────────────────────────────────
    spawnPosition: [0, 1.3, -80],
    spawnRotation: 0,       // radians (facing +Z)

    // ── Visual properties ─────────────────────────────────────
    skyColor: 0x8fadc5,
    fogNear: 150,
    fogFar: 400,
    sunIntensity: 1.0,
    ambientIntensity: 0.7,

    /**
     * Walls — physics barriers (cannon-es Box bodies, mass=0).
     * Each: { position: [x,y,z], size: [halfW, halfH, halfL] }
     */
    walls: [
        // ── Outer boundary (200×200m perimeter) ──────────────
        // North wall
        { position: [0, 1, 100],  size: [102, 1, 0.5] },
        // South wall
        { position: [0, 1, -100], size: [102, 1, 0.5] },
        // East wall
        { position: [100, 1, 0],  size: [0.5, 1, 102] },
        // West wall
        { position: [-100, 1, 0], size: [0.5, 1, 102] },
    ],

    /**
     * Buildings — visual-only boxes (Three.js) + physics boxes (cannon-es).
     * Each: { position: [x,y,z], size: [w, h, d], color: hex }
     * Heights vary for visual interest.
     */
    buildings: [
        // ── Row 1 (Z = 60..80) ──────────────────────────────
        { position: [-65, 6, 70],  size: [30, 12, 20], color: 0x7a8b99 },
        { position: [-20, 8, 70],  size: [28, 16, 20], color: 0x8e7f6a },
        { position: [25, 5, 70],   size: [26, 10, 20], color: 0x6b8a7a },
        { position: [65, 10, 70],  size: [30, 20, 20], color: 0x9a8878 },

        // ── Row 2 (Z = 20..40) ──────────────────────────────
        { position: [-65, 7, 30],  size: [30, 14, 20], color: 0x8a7b6c },
        { position: [-20, 5, 30],  size: [28, 10, 20], color: 0x7b8c8a },
        { position: [25, 9, 30],   size: [26, 18, 20], color: 0x9c8d7e },
        { position: [65, 6, 30],   size: [30, 12, 20], color: 0x6a7b89 },

        // ── Row 3 (Z = -20..-40) ────────────────────────────
        { position: [-65, 8, -30], size: [30, 16, 20], color: 0x8b7c6d },
        { position: [-20, 6, -30], size: [28, 12, 20], color: 0x7c8d8b },
        { position: [25, 7, -30],  size: [26, 14, 20], color: 0x6b7a88 },
        { position: [65, 5, -30],  size: [30, 10, 20], color: 0x9b8c7d },

        // ── Row 4 (Z = -60..-80) ────────────────────────────
        { position: [-65, 9, -70], size: [30, 18, 20], color: 0x7a8b7a },
        { position: [-20, 5, -70], size: [28, 10, 20], color: 0x8e8f80 },
        { position: [25, 7, -70],  size: [26, 14, 20], color: 0x9a7b6c },
        { position: [65, 6, -70],  size: [30, 12, 20], color: 0x6c8b9a },
    ],

    /**
     * Lane markings — dashed white lines along streets.
     * Each: { start: [x, z], end: [x, z], axis: 'x' | 'z' }
     */
    laneMarkings: [
        // North-south streets (along Z axis)
        { x: -42, zStart: -95, zEnd: 95, axis: 'z' },
        { x: -5,  zStart: -95, zEnd: 95, axis: 'z' },
        { x: 42,  zStart: -95, zEnd: 95, axis: 'z' },

        // East-west streets (along X axis)
        { z: 50,  xStart: -95, xEnd: 95, axis: 'x' },
        { z: 10,  xStart: -95, xEnd: 95, axis: 'x' },
        { z: -50, xStart: -95, xEnd: 95, axis: 'x' },
    ],

    /**
     * Street lights — simple poles along streets.
     * Each: [x, z]
     */
    streetLights: [
        [-42, -90], [-42, -50], [-42, -10], [-42, 30], [-42, 70],
        [-5, -90],  [-5, -50],  [-5, -10],  [-5, 30],  [-5, 70],
        [42, -90],  [42, -50],  [42, -10],  [42, 30],  [42, 70],
    ],
};
