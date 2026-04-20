import * as CANNON from 'cannon-es';

/** @module PhysicsWorld — Track dimensions (metres) */
const OUTER_W = 160;   // outer width  (X axis)
const OUTER_H = 100;   // outer height (Z axis)
const TRACK_W = 20;    // lane width
const INNER_W = OUTER_W - TRACK_W * 2; // 120
const INNER_H = OUTER_H - TRACK_W * 2; //  60
const WALL_HEIGHT = 2;
const WALL_THICK = 0.5;

// ── Collision groups ─────────────────────────────────────
// RaycastVehicle raycasts use world.rayTest() which ignores collision
// groups, so the wheel rays always detect the ground even though the
// chassis body is set to pass through it.
const COLLISION_GROUND  = 1;
const COLLISION_WALL    = 2;
const COLLISION_VEHICLE = 4;

/**
 * Cannon-es physics world with RaycastVehicle, rectangular track and
 * material-based friction system.
 *
 * Materials:
 *  - trackMaterial — asphalt surface (high friction with tyres)
 *  - tireMaterial  — used on chassis body (RaycastVehicle wheels use frictionSlip)
 *  - wallMaterial  — barriers (low friction, some bounce)
 *
 * Contact pairs:
 *  | A            | B            | friction | restitution |
 *  |--------------|--------------|----------|-------------|
 *  | trackMaterial| tireMaterial | 0.6      | 0.05        |
 *  | tireMaterial | wallMaterial | 0.2      | 0.3         |
 */
export class PhysicsWorld {
    /**
     * @param {object} [mapConfig] — map configuration from maps/*.js
     */
    constructor(mapConfig) {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.defaultContactMaterial.friction = 0.2;

        // ── Materials ────────────────────────────────────────
        this.trackMaterial   = new CANNON.Material('track');
        this.tireMaterial    = new CANNON.Material('tire');
        this.wallMaterial    = new CANNON.Material('wall');
        this.chassisMaterial = new CANNON.Material('chassis');

        // tire ↔ track — good forward traction, enough lateral grip for handling
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.trackMaterial, this.tireMaterial,
            { friction: 0.6, restitution: 0.05 },
        ));

        // tire / chassis ↔ wall — slippery bounce off barriers
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.tireMaterial, this.wallMaterial,
            { friction: 0.2, restitution: 0.3 },
        ));

        // chassis ↔ track — near-zero friction so chassis scraping doesn't block movement
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.chassisMaterial, this.trackMaterial,
            { friction: 0.01, restitution: 0.0 },
        ));

        // chassis ↔ wall
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.chassisMaterial, this.wallMaterial,
            { friction: 0.1, restitution: 0.3 },
        ));

        // ── Track geometry from map config ───────────────────
        this._mapConfig = mapConfig || null;
        this._createTrack(mapConfig);

        this.vehicle = null;
        this.chassisBody = null;
        this._hasHeightfield = this._hasHeightfield || false;
    }

    /**
     * Build the ground plane + walls/buildings from map config.
     * Falls back to a bare ground plane if no config is provided.
     * @param {object} [mapConfig]
     * @private
     */
    _createTrack(mapConfig) {
        // ── Ground geometry ──────────────────────────────────
        if (mapConfig?.heightData) {
            // Heightfield terrain — used for maps with elevation.
            //
            // Map data layout: data[r][c] where r→Z (rows), c→X (cols).
            //
            // Cannon-es Heightfield local frame:
            //   data[xi][yi] at local position (xi*el, yi*el, data[xi][yi])
            //   where height is in local Z.
            //
            // We feed the raw data (no transpose).  xi = row index, yi = col index.
            //
            // Rotation euler(-PI/2, 0, -PI/2) maps local→world as:
            //   world X = local Y  = yi * el  (cols → X)  ✓
            //   world Y = local Z  = data[xi][yi]  (height → up)  ✓
            //   world Z = local X  = xi * el  (rows → Z)  ✓
            //
            // This avoids transposing the data and gives exact 1:1 alignment
            // with the Three.js visual terrain.
            const data = mapConfig.heightData;
            const elSize = mapConfig.heightElementSize || 10;
            const rows = data.length;
            const cols = data[0].length;

            const shape = new CANNON.Heightfield(data, { elementSize: elSize });
            const ground = new CANNON.Body({
                mass: 0,
                shape,
                material: this.trackMaterial,
                collisionFilterGroup: COLLISION_GROUND,
            });
            // Centre the heightfield so it matches the Three.js terrain mesh
            // which spans X: [-cols*el/2, +cols*el/2], Z: [-rows*el/2, +rows*el/2].
            ground.position.set(
                -(cols * elSize) / 2,
                0,
                -(rows * elSize) / 2,
            );
            ground.quaternion.setFromEuler(-Math.PI / 2, 0, -Math.PI / 2);
            this.world.addBody(ground);
            this._hasHeightfield = true;
        } else {
            // Flat box ground — top surface flush at Y = 0.
            const GROUND_HALF = Math.max(500, mapConfig?.groundSize || 500);
            const ground = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(new CANNON.Vec3(GROUND_HALF, 0.5, GROUND_HALF)),
                material: this.trackMaterial,
                collisionFilterGroup: COLLISION_GROUND,
            });
            ground.position.set(0, -0.5, 0);
            this.world.addBody(ground);
        }

        if (!mapConfig) return;

        // ── Walls — solid barriers the bus cannot pass through ─
        if (mapConfig.walls) {
            for (const wall of mapConfig.walls) {
                const [hx, hy, hz] = wall.size;
                const [px, py, pz] = wall.position;
                const body = new CANNON.Body({
                    mass: 0,
                    shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
                    material: this.wallMaterial,
                    collisionFilterGroup: COLLISION_WALL,
                });
                body.position.set(px, py, pz);
                this.world.addBody(body);
            }
        }

        // ── Buildings — solid collision bodies ───────────────
        if (mapConfig.buildings) {
            for (const bldg of mapConfig.buildings) {
                const [w, h, d] = bldg.size;
                const [px, py, pz] = bldg.position;
                const body = new CANNON.Body({
                    mass: 0,
                    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
                    material: this.wallMaterial,
                    collisionFilterGroup: COLLISION_WALL,
                });
                body.position.set(px, py, pz);
                this.world.addBody(body);
            }
        }
    }

    /**
     * Create a RaycastVehicle from bus catalog specs.
     *
     * Chassis box, wheel positions, and suspension are derived from the
     * per-bus dimensions provided by the server.
     *
     * @param {object} busSpecs
     * @returns {CANNON.RaycastVehicle}
     */
    createVehicle(busSpecs) {
        const mass = busSpecs.base_weight_kg || 3500;

        // ── Dimensions from specs ────────────────────────────
        const length     = busSpecs.length_m    || 6.0;
        const width      = busSpecs.width_m     || 2.0;
        const height     = busSpecs.height_m    || 2.6;
        const wheelbase  = busSpecs.wheelbase_m || 3.5;
        const axleTrack  = busSpecs.axle_track_m || 1.6;

        // Chassis half-extents (cannon-es Box takes half-sizes)
        const halfW = width  / 2;
        const halfH = height / 4;   // visual half of lower body
        const halfL = length / 2;

        // cannon-es suspensionForce = (stiffness × displacement − damping × velocity) × chassisMass.
        const stiffness = 20;

        // Damping — ζ ≈ 0.6 (heavily damped like a loaded bus).
        const dampingCompression = 8.0;
        const dampingRelaxation  = 14.0;

        // Chassis — collides with GROUND + WALL + other VEHICLES.
        const chassisShape = new CANNON.Box(new CANNON.Vec3(halfW, halfH, halfL));
        this.chassisBody = new CANNON.Body({
            mass,
            material: this.chassisMaterial,
            angularDamping: 0.4,
            linearDamping: 0.05,
            collisionFilterGroup: COLLISION_VEHICLE,
            collisionFilterMask: COLLISION_GROUND | COLLISION_WALL | COLLISION_VEHICLE,
        });
        this.chassisBody.addShape(chassisShape);
        // Spawn position from map config, or default origin
        const spawn = this._mapConfig?.spawnPosition || [0, 1.3, 0];
        this.chassisBody.position.set(spawn[0], spawn[1], spawn[2]);
        if (this._mapConfig?.spawnRotation) {
            this.chassisBody.quaternion.setFromEuler(0, this._mapConfig.spawnRotation, 0);
        }

        const vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });

        // Wheel radius scales slightly with bus size
        const wheelRadius = 0.30 + (height - 2.5) * 0.1;  // ~0.31–0.35
        this._wheelRadius = wheelRadius; // used by hard-floor guarantee in step()
        const connectionY = -halfH;

        // Wheel connection points derived from wheelbase + axle track
        const frontZ =  wheelbase / 2;
        const rearZ  = -wheelbase / 2;
        const sideX  =  axleTrack / 2;

        const sharedWheel = {
            radius: wheelRadius,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            suspensionStiffness: stiffness,
            suspensionRestLength: 0.5,
            dampingRelaxation,
            dampingCompression,
            rollInfluence: 0.08,
            maxSuspensionForce: 50000,
            maxSuspensionTravel: 0.4,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        };

        // Front wheels — lower frictionSlip → understeer
        const frontWheel = { ...sharedWheel, frictionSlip: 1.8 };
        // Rear wheels — higher frictionSlip → stable rear
        const rearWheel  = { ...sharedWheel, frictionSlip: 3.0 };

        vehicle.addWheel({ ...frontWheel, chassisConnectionPointLocal: new CANNON.Vec3(-sideX, connectionY, frontZ) });
        vehicle.addWheel({ ...frontWheel, chassisConnectionPointLocal: new CANNON.Vec3( sideX, connectionY, frontZ) });
        vehicle.addWheel({ ...rearWheel,  chassisConnectionPointLocal: new CANNON.Vec3(-sideX, connectionY, rearZ) });
        vehicle.addWheel({ ...rearWheel,  chassisConnectionPointLocal: new CANNON.Vec3( sideX, connectionY, rearZ) });

        vehicle.addToWorld(this.world);
        console.log('[Physics] Wheels created:', vehicle.wheelInfos.length);

        // Kinematic wheel bodies for visual sync
        this.wheelBodies = vehicle.wheelInfos.map((wheel) => {
            const body = new CANNON.Body({
                mass: 0,
                type: CANNON.Body.KINEMATIC,
                collisionFilterGroup: 0,
            });
            body.addShape(new CANNON.Sphere(wheel.radius));
            this.world.addBody(body);
            return body;
        });

        this.vehicle = vehicle;
        return vehicle;
    }

    /**
     * Advance the physics simulation by one frame.
     * @param {number} dt — elapsed time in seconds (capped externally at 0.05)
     */
    step(dt) {
        this.world.step(1 / 60, dt, 5);

        // ── Hard floor guarantee ─────────────────────────────
        // If the chassis sinks so low that any wheel connection point goes
        // below the terrain surface, raycasts miss → springs produce zero
        // force → bus loses traction and gets stuck. After each step we
        // check all 4 connection points and push the chassis up if needed.
        // On heightfield maps, we skip the hard floor (terrain has variable
        // elevation) and instead rely on a generous fallback Y threshold.
        if (this.vehicle && this.chassisBody && !this._hasHeightfield) {
            let worstDeficit = 0;
            const pos  = this.chassisBody.position;
            const quat = this.chassisBody.quaternion;
            const tmp  = new CANNON.Vec3();

            // Minimum Y for connection points: at least one wheel radius
            // above the surface so the suspension ray always has room to hit.
            const safeY = this._wheelRadius || 0.32;

            for (const info of this.vehicle.wheelInfos) {
                quat.vmult(info.chassisConnectionPointLocal, tmp);
                const worldY = pos.y + tmp.y;
                const deficit = safeY - worldY;
                if (deficit > worstDeficit) worstDeficit = deficit;
            }

            if (worstDeficit > 0) {
                this.chassisBody.position.y += worstDeficit;
                // Kill downward velocity so it doesn't immediately sink again
                if (this.chassisBody.velocity.y < 0) {
                    this.chassisBody.velocity.y = 0;
                }
                // Dampen pitch/roll oscillation that caused the deficit
                this.chassisBody.angularVelocity.x *= 0.8;
                this.chassisBody.angularVelocity.z *= 0.8;
            }
        }

        // Sync wheel bodies to raycast results
        if (this.vehicle) {
            this.vehicle.wheelInfos.forEach((wheel, i) => {
                this.vehicle.updateWheelTransform(i);
                const t = wheel.worldTransform;
                this.wheelBodies[i].position.copy(t.position);
                this.wheelBodies[i].quaternion.copy(t.quaternion);
                // Visual clamp: wheel centre never below its own radius
                if (this.wheelBodies[i].position.y < wheel.radius) {
                    this.wheelBodies[i].position.y = wheel.radius;
                }
            });
        }
    }

    /**
     * Diagnostic: returns array of booleans indicating ground contact per wheel.
     * Call from game loop to verify raycasts are hitting the track.
     * @returns {boolean[]}
     */
    getWheelContacts() {
        if (!this.vehicle) return [];
        return this.vehicle.wheelInfos.map((w) => w.isInContact);
    }

    /** Average absolute angular speed of the rear wheels (indices 2, 3) in rad/s */
    getRearWheelSpeed() {
        if (!this.vehicle) return 0;
        const w2 = Math.abs(this.vehicle.wheelInfos[2]?.deltaRotation || 0) / (1 / 60);
        const w3 = Math.abs(this.vehicle.wheelInfos[3]?.deltaRotation || 0) / (1 / 60);
        return (w2 + w3) / 2;
    }

    /** Tear down the physics world and remove the vehicle. */
    destroy() {
        if (this.vehicle) {
            this.vehicle.removeFromWorld(this.world);
        }
        this.world = null;
    }
}

export { OUTER_W, OUTER_H, INNER_W, INNER_H, TRACK_W, WALL_HEIGHT };
