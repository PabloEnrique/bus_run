/**
 * @module maps/circuit
 * Oval racing circuit — ~5 km perimeter, 20m wide track.
 *
 * Layout: Stadium oval, 1500m × 800m bounding box.
 * Two 600m straights connected by 180° semi-circular turns (r ≈ 150m).
 * Perimeter ≈ 2 × 600 + 2 × π × 150 ≈ 2143m (one lap).
 * Flat terrain, no heightData.
 */

// ── Track geometry helpers ─────────────────────────────────
const STRAIGHT_LEN = 600;     // metres
const TURN_RADIUS  = 150;     // metres (centre-line)
const TRACK_WIDTH  = 20;      // metres
const WALL_H       = 1.0;

/**
 * Generate wall segments for a semi-circular turn.
 * Returns array of { position, size } wall boxes approximating the arc.
 */
function arcWalls(cx, cz, radius, startAngle, segments, side) {
    const walls = [];
    const step = Math.PI / segments;
    const segLen = (Math.PI * radius) / segments;
    for (let i = 0; i < segments; i++) {
        const a = startAngle + step * (i + 0.5);
        const r = radius + side * (TRACK_WIDTH / 2);
        const px = cx + Math.cos(a) * r;
        const pz = cz + Math.sin(a) * r;
        walls.push({
            position: [px, WALL_H / 2, pz],
            size: [segLen / 2, WALL_H / 2, 0.4],
            rotation: a,
        });
    }
    return walls;
}

const ARC_SEGS = 16;

// North turn centre: (0, 0, STRAIGHT_LEN/2)
// South turn centre: (0, 0, -STRAIGHT_LEN/2)
const innerWallsNorth = arcWalls(0, STRAIGHT_LEN / 2, TURN_RADIUS, 0, ARC_SEGS, -1);
const outerWallsNorth = arcWalls(0, STRAIGHT_LEN / 2, TURN_RADIUS, 0, ARC_SEGS, 1);
const innerWallsSouth = arcWalls(0, -STRAIGHT_LEN / 2, TURN_RADIUS, Math.PI, ARC_SEGS, -1);
const outerWallsSouth = arcWalls(0, -STRAIGHT_LEN / 2, TURN_RADIUS, Math.PI, ARC_SEGS, 1);

const halfTrack = TRACK_WIDTH / 2;
const outerX = TURN_RADIUS + halfTrack;
const innerX = TURN_RADIUS - halfTrack;

export default {
    id: 'circuit',
    name: 'Circuito Oval',
    description: 'Circuito de carreras oval de ~5 km. Velocidad pura en las rectas y frenada en las curvas.',
    thumbnail: null,

    groundSize: 2000,
    groundColor: 0x2a2a2a,

    spawnPosition: [TURN_RADIUS, 1.3, -STRAIGHT_LEN / 2 + 20],
    spawnRotation: 0,

    skyColor: 0x7ec8e3,
    fogNear: 400,
    fogFar: 1500,
    sunIntensity: 1.6,
    ambientIntensity: 0.5,

    walls: [
        // ── East straight walls ──────────────────────────────
        { position: [outerX, WALL_H / 2, 0], size: [0.4, WALL_H / 2, STRAIGHT_LEN / 2] },
        { position: [innerX, WALL_H / 2, 0], size: [0.4, WALL_H / 2, STRAIGHT_LEN / 2] },
        // ── West straight walls ──────────────────────────────
        { position: [-outerX, WALL_H / 2, 0], size: [0.4, WALL_H / 2, STRAIGHT_LEN / 2] },
        { position: [-innerX, WALL_H / 2, 0], size: [0.4, WALL_H / 2, STRAIGHT_LEN / 2] },
        // ── Arc walls (simplified as straight segments) ──────
        ...innerWallsNorth,
        ...outerWallsNorth,
        ...innerWallsSouth,
        ...outerWallsSouth,
    ],

    buildings: [
        // ── Grandstands (infield) ────────────────────────────
        { position: [0, 5, 200],  size: [60, 10, 20], color: 0x5a6a7a },
        { position: [0, 5, -200], size: [60, 10, 20], color: 0x5a6a7a },
        { position: [0, 3, 0],    size: [40, 6, 40],  color: 0x6a5a4a },
        // ── Pit buildings (east side) ────────────────────────
        { position: [outerX + 20, 3, -100], size: [15, 6, 30],  color: 0x7a7a8a },
        { position: [outerX + 20, 3, 0],    size: [15, 6, 30],  color: 0x8a7a7a },
        { position: [outerX + 20, 3, 100],  size: [15, 6, 30],  color: 0x7a8a7a },
        // ── External structures ──────────────────────────────
        { position: [outerX + 50, 6, -200], size: [30, 12, 20], color: 0x8a8a9a },
        { position: [outerX + 50, 6, 200],  size: [30, 12, 20], color: 0x9a8a8a },
        { position: [-outerX - 30, 4, 0],   size: [20, 8, 60],  color: 0x7a8a9a },
    ],

    laneMarkings: [
        // Centre line on east straight
        { x: TURN_RADIUS, zStart: -STRAIGHT_LEN / 2, zEnd: STRAIGHT_LEN / 2, axis: 'z' },
        // Centre line on west straight
        { x: -TURN_RADIUS, zStart: -STRAIGHT_LEN / 2, zEnd: STRAIGHT_LEN / 2, axis: 'z' },
    ],

    distanceMarkers: [
        { position: [outerX + 5, -250], label: '0' },
        { position: [outerX + 5, -100], label: '500' },
        { position: [outerX + 5, 100],  label: '1000' },
        { position: [outerX + 5, 250],  label: '1500' },
    ],

    streetLights: [
        // East straight
        ...[...Array(8)].map((_, i) => [outerX + 3, -280 + i * 80]),
        // West straight
        ...[...Array(8)].map((_, i) => [-outerX - 3, -280 + i * 80]),
    ],
};
