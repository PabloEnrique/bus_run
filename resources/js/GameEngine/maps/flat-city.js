/**
 * @module maps/flat-city
 * Large flat city — ~1500 × 1500 m urban grid.
 *
 * Layout: 10×10 city blocks (each 120×120m) with 15m-wide streets.
 * Total area: ~1350 × 1350 m road grid inside a 1500m ground.
 * 80+ buildings, multiple intersections.
 * Spawn at the south-west corner facing north (+Z).
 */

const BLOCK  = 120;  // block size in metres
const STREET = 15;   // street width
const PITCH  = BLOCK + STREET; // 135m cell pitch
const GRID   = 10;   // 10×10 grid
const HALF   = (GRID * PITCH) / 2; // 675m

// ── Generate buildings (one per block, randomised height) ────
const HEIGHTS = [8, 10, 12, 14, 16, 18, 20, 22, 25, 30];
const COLORS = [0x7a8b99, 0x8e7f6a, 0x6b8a7a, 0x9a8878, 0x8a7b6c, 0x7b8c8a, 0x9c8d7e, 0x6a7b89, 0x8b7c6d, 0x7c8d8b];
const buildings = [];
for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
        const cx = -HALF + STREET / 2 + BLOCK / 2 + c * PITCH;
        const cz = -HALF + STREET / 2 + BLOCK / 2 + r * PITCH;
        const h = HEIGHTS[(r * GRID + c) % HEIGHTS.length];
        const col = COLORS[(r + c) % COLORS.length];
        // Slightly smaller than block so there's a sidewalk gap
        buildings.push({
            position: [cx, h / 2, cz],
            size: [BLOCK - 4, h, BLOCK - 4],
            color: col,
        });
    }
}

// ── Generate walls (outer perimeter) ─────────────────────────
const WALL_H = 1.5;
const PERIM = HALF + STREET;
const walls = [
    { position: [0, WALL_H / 2, PERIM],   size: [PERIM + 1, WALL_H / 2, 0.5] },
    { position: [0, WALL_H / 2, -PERIM],  size: [PERIM + 1, WALL_H / 2, 0.5] },
    { position: [PERIM, WALL_H / 2, 0],   size: [0.5, WALL_H / 2, PERIM + 1] },
    { position: [-PERIM, WALL_H / 2, 0],  size: [0.5, WALL_H / 2, PERIM + 1] },
];

// ── Generate lane markings (centre of each street) ───────────
const laneMarkings = [];
for (let i = 0; i <= GRID; i++) {
    const pos = -HALF + i * PITCH;
    // N-S streets
    laneMarkings.push({ x: pos, zStart: -HALF, zEnd: HALF, axis: 'z' });
    // E-W streets
    laneMarkings.push({ z: pos, xStart: -HALF, xEnd: HALF, axis: 'x' });
}

// ── Street lights at intersections ───────────────────────────
const streetLights = [];
for (let r = 0; r <= GRID; r += 2) {
    for (let c = 0; c <= GRID; c += 2) {
        const x = -HALF + c * PITCH;
        const z = -HALF + r * PITCH;
        streetLights.push([x + 4, z + 4]);
    }
}

export default {
    id: 'flat-city',
    name: 'Metrópoli',
    description: 'Ciudad extensa con más de 100 manzanas. Explora calles y avenidas a gran escala.',
    thumbnail: null,

    groundSize: 2000,
    groundColor: 0x3a3a3a,

    spawnPosition: [-HALF + STREET / 2, 1.3, -HALF + 20],
    spawnRotation: 0,

    skyColor: 0x8fadc5,
    fogNear: 300,
    fogFar: 1200,
    sunIntensity: 1.0,
    ambientIntensity: 0.7,

    walls,
    buildings,
    laneMarkings,
    streetLights,
    distanceMarkers: [],
};
