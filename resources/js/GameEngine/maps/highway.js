/**
 * @module maps/highway
 * Highway map configuration — long straight road with gentle curves,
 * guardrails, median, and distance markers.
 *
 * Layout: 800m long × 24m wide dual carriageway.
 * Two 10m lanes in each direction, 4m median.
 * Spawn at the south end facing north (+Z).
 */
export default {
    id: 'highway',
    name: 'Autopista',
    description: 'Autopista recta y larga. Perfecta para alcanzar velocidad máxima.',
    thumbnail: null,

    // ── Ground ────────────────────────────────────────────────
    groundSize: 1000,       // metres, square ground plane visual
    groundColor: 0x2e2e2e,  // slightly darker asphalt

    // ── Spawn ─────────────────────────────────────────────────
    spawnPosition: [6, 1.3, -350],
    spawnRotation: 0,       // facing +Z (north)

    // ── Visual properties ─────────────────────────────────────
    skyColor: 0xa5c8e1,
    fogNear: 250,
    fogFar: 700,
    sunIntensity: 1.4,
    ambientIntensity: 0.5,

    /**
     * Walls — guardrails along the highway edges + median barrier.
     * Highway runs along Z from -400 to +400 (800m).
     * Road: X from -12 to +12 (24m wide). Median: X from -2 to +2.
     */
    walls: [
        // ── Guardrails (outer edges) ─────────────────────────
        // East guardrail
        { position: [13, 0.5, 0],  size: [0.3, 0.5, 400] },
        // West guardrail
        { position: [-13, 0.5, 0], size: [0.3, 0.5, 400] },

        // ── Median barrier (center divider) ──────────────────
        { position: [0, 0.4, 0],   size: [0.4, 0.4, 400] },

        // ── End barriers (prevent driving off the ends) ──────
        // North end
        { position: [0, 0.5, 400], size: [13, 0.5, 0.5] },
        // South end
        { position: [0, 0.5, -400], size: [13, 0.5, 0.5] },
    ],

    /**
     * Buildings — roadside structures (gas stations, signs, trees).
     * Placed along the sides of the highway.
     */
    buildings: [
        // ── East side structures ─────────────────────────────
        { position: [25, 3, -300], size: [10, 6, 15],  color: 0x8a9aa8 },
        { position: [22, 2, -100], size: [8, 4, 8],    color: 0xa89a8a },
        { position: [28, 4, 100],  size: [12, 8, 12],  color: 0x7a8a78 },
        { position: [22, 2, 280],  size: [8, 4, 10],   color: 0x9a8a7a },

        // ── West side structures ─────────────────────────────
        { position: [-25, 3, -200], size: [10, 6, 12], color: 0x8a8a9a },
        { position: [-22, 2, 0],    size: [8, 4, 8],   color: 0x9a9a8a },
        { position: [-28, 4, 200],  size: [12, 8, 14], color: 0x788a7a },
        { position: [-22, 2, 350],  size: [8, 4, 10],  color: 0x8a7a9a },
    ],

    /**
     * Lane markings — dashed center lines for each carriageway.
     * East carriageway (X ≈ 6): lanes at X=3 and X=9
     * West carriageway (X ≈ -6): lanes at X=-3 and X=-9
     */
    laneMarkings: [
        // East carriageway center line
        { x: 6,  zStart: -395, zEnd: 395, axis: 'z' },
        // West carriageway center line
        { x: -6, zStart: -395, zEnd: 395, axis: 'z' },
    ],

    /**
     * Distance markers every 100m along the highway.
     * Each: { position: [x,z], label: string }
     */
    distanceMarkers: [
        { position: [14, -300], label: '100' },
        { position: [14, -200], label: '200' },
        { position: [14, -100], label: '300' },
        { position: [14, 0],    label: '400' },
        { position: [14, 100],  label: '500' },
        { position: [14, 200],  label: '600' },
        { position: [14, 300],  label: '700' },
    ],

    /**
     * Street lights along the highway.
     * Each: [x, z]
     */
    streetLights: [
        [14, -350], [14, -250], [14, -150], [14, -50],
        [14, 50],   [14, 150],  [14, 250],  [14, 350],
        [-14, -350], [-14, -250], [-14, -150], [-14, -50],
        [-14, 50],   [-14, 150],  [-14, 250],  [-14, 350],
    ],
};
