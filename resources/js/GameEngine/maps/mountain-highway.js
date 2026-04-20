/**
 * @module maps/mountain-highway
 * Mountain highway with elevation changes — ~5.6 km long.
 *
 * Layout: Dual carriageway (24m wide) running along Z from -2800 to +2800.
 * Terrain: Sinusoidal hills with ±15m elevation.
 * Uses heightData for CANNON.Heightfield physics + THREE.js terrain mesh.
 */

const ROAD_LENGTH = 5600;     // metres total
const ROAD_WIDTH  = 24;       // metres
const HALF_LEN    = ROAD_LENGTH / 2;

// ── Generate heightfield data ────────────────────────────────
// Grid: 10m cells covering the playable area.
const ELEMENT_SIZE = 10;      // metres per cell
const GRID_W = 80;            // columns (X: -400m to +400m)
const GRID_D = 580;           // rows    (Z: -2900m to +2900m)

/**
 * Build 2D height array.
 * Road zone (|x| < 15m from centre) is flat.
 * Outside road: gentle rolling hills.
 * Along Z: sinusoidal elevation with period ~800m, amplitude ±15m.
 */
function generateHeightData() {
    const data = [];
    for (let r = 0; r < GRID_D; r++) {
        const row = [];
        const z = -HALF_LEN - 100 + r * ELEMENT_SIZE;
        // Base elevation: sinusoidal along Z
        const baseY = Math.sin(z / 130) * 12 + Math.sin(z / 300) * 8;
        for (let c = 0; c < GRID_W; c++) {
            const x = -(GRID_W * ELEMENT_SIZE) / 2 + c * ELEMENT_SIZE;
            // Road zone: flatten to base elevation
            const distFromCentre = Math.abs(x);
            if (distFromCentre < ROAD_WIDTH / 2 + 5) {
                // Flat road surface at base elevation
                row.push(baseY);
            } else {
                // Terrain rises on the sides
                const sideRise = (distFromCentre - ROAD_WIDTH / 2 - 5) * 0.15;
                row.push(baseY + sideRise + Math.sin(x / 50) * 3);
            }
        }
        data.push(row);
    }
    return data;
}

const heightData = generateHeightData();

// ── Walls (guardrails) ───────────────────────────────────────
// Guardrails follow the terrain, placed as many segments.
const SEGMENT_LEN = 100;
const NUM_SEGMENTS = Math.floor(ROAD_LENGTH / SEGMENT_LEN);
const walls = [];

for (let i = 0; i < NUM_SEGMENTS; i++) {
    const z = -HALF_LEN + SEGMENT_LEN / 2 + i * SEGMENT_LEN;
    const zIdx = Math.floor((z + HALF_LEN + 100) / ELEMENT_SIZE);
    const midRow = heightData[Math.min(zIdx, GRID_D - 1)] || heightData[0];
    const midCol = Math.floor(GRID_W / 2);
    const baseY = midRow[midCol] || 0;

    // East guardrail
    walls.push({ position: [13, baseY + 0.5, z], size: [0.3, 0.5, SEGMENT_LEN / 2] });
    // West guardrail
    walls.push({ position: [-13, baseY + 0.5, z], size: [0.3, 0.5, SEGMENT_LEN / 2] });
}

// Median barrier (centre)
for (let i = 0; i < NUM_SEGMENTS; i++) {
    const z = -HALF_LEN + SEGMENT_LEN / 2 + i * SEGMENT_LEN;
    const zIdx = Math.floor((z + HALF_LEN + 100) / ELEMENT_SIZE);
    const midRow = heightData[Math.min(zIdx, GRID_D - 1)] || heightData[0];
    const midCol = Math.floor(GRID_W / 2);
    const baseY = midRow[midCol] || 0;
    walls.push({ position: [0, baseY + 0.4, z], size: [0.4, 0.4, SEGMENT_LEN / 2] });
}

// End barriers
walls.push({ position: [0, 0.5, HALF_LEN], size: [13, 0.5, 0.5] });
walls.push({ position: [0, 0.5, -HALF_LEN], size: [13, 0.5, 0.5] });

// ── Spawn (elevated to match terrain at spawn Z) ─────────────
const spawnZ = -HALF_LEN + 100;
const spawnZIdx = Math.floor((spawnZ + HALF_LEN + 100) / ELEMENT_SIZE);
const spawnRow = heightData[Math.min(spawnZIdx, GRID_D - 1)] || heightData[0];
const spawnY = (spawnRow[Math.floor(GRID_W / 2)] || 0) + 1.5;

// ── Buildings (roadside) ─────────────────────────────────────
const buildings = [];
for (let i = 0; i < 12; i++) {
    const z = -HALF_LEN + 400 + i * 450;
    const side = i % 2 === 0 ? 1 : -1;
    const zIdx = Math.floor((z + HALF_LEN + 100) / ELEMENT_SIZE);
    const row = heightData[Math.min(zIdx, GRID_D - 1)] || heightData[0];
    const baseY = row[Math.floor(GRID_W / 2)] || 0;
    buildings.push({
        position: [side * 28, baseY + 3, z],
        size: [12, 6, 15],
        color: [0x8a9aa8, 0xa89a8a, 0x7a8a78, 0x9a8a7a, 0x8a8a9a, 0x788a7a][i % 6],
    });
}

// ── Lane markings ────────────────────────────────────────────
const laneMarkings = [
    { x: 6,  zStart: -HALF_LEN + 5, zEnd: HALF_LEN - 5, axis: 'z' },
    { x: -6, zStart: -HALF_LEN + 5, zEnd: HALF_LEN - 5, axis: 'z' },
];

// ── Distance markers every 500m ──────────────────────────────
const distanceMarkers = [];
for (let d = 500; d < ROAD_LENGTH; d += 500) {
    distanceMarkers.push({ position: [15, -HALF_LEN + d], label: String(d) });
}

// ── Street lights every 200m ─────────────────────────────────
const streetLights = [];
for (let z = -HALF_LEN + 100; z < HALF_LEN; z += 200) {
    streetLights.push([15, z]);
    streetLights.push([-15, z]);
}

export default {
    id: 'mountain-highway',
    name: 'Autopista de Montaña',
    description: 'Autopista de 5.6 km con subidas y bajadas pronunciadas. Pon a prueba tu motor en pendientes.',
    thumbnail: null,

    groundSize: 6000,
    groundColor: 0x2e2e2e,

    // Heightfield
    heightData,
    heightElementSize: ELEMENT_SIZE,

    spawnPosition: [6, spawnY, spawnZ],
    spawnRotation: 0,

    skyColor: 0x8ab4d0,
    fogNear: 500,
    fogFar: 2500,
    sunIntensity: 1.3,
    ambientIntensity: 0.5,

    walls,
    buildings,
    laneMarkings,
    distanceMarkers,
    streetLights,
};
