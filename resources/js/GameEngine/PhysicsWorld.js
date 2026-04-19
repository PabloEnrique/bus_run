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
    constructor() {
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

        // ── Track geometry ───────────────────────────────────
        this._createTrack();

        this.vehicle = null;
        this.chassisBody = null;
    }

    /**
     * Build a large flat driveway — a single ground plane at Y = 0
     * with no walls or obstacles.
     * @private
     */
    _createTrack() {
        // Large flat ground plane at Y = 0
        const ground = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: this.trackMaterial,
            collisionFilterGroup: COLLISION_GROUND,
        });
        ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        ground.position.set(0, 0, 0);
        this.world.addBody(ground);
    }

    /**
     * Create a RaycastVehicle from bus catalog specs.
     *
     * Front wheels use lower frictionSlip (1.8) for natural understeer;
     * rear wheels use higher frictionSlip (3.0) for a stable rear axle.
     *
     * @param {{ base_weight_kg: number, suspension_stiffness: number }} busSpecs
     * @returns {CANNON.RaycastVehicle}
     */
    createVehicle(busSpecs) {
        const mass = busSpecs.base_weight_kg || 3500;

        // cannon-es suspensionForce = (stiffness × displacement − damping × velocity) × chassisMass.
        // The stiffness is a NORMALISED coefficient (not N/m) — it gets multiplied by mass.
        // Static sag = g / (4 × stiffness).  Target sag ≈ 0.12 m → stiffness ≈ 20.
        // Natural freq = sqrt(4 × k) / 2π ≈ 1.4 Hz — realistic for a city bus.
        const stiffness = 20;

        // Damping — ζ ≈ 0.6 (heavily damped like a loaded bus).
        // Critical = 2 × sqrt(4 × stiffness) ≈ 18.
        // Compression moderate, relaxation near-critical to kill rebound.
        const dampingCompression = 8.0;
        const dampingRelaxation  = 14.0;

        // Chassis — collides with GROUND + WALL + other VEHICLES.
        // Ground collision acts as a hard safety net: if springs ever max out,
        // the chassis physically rests on the surface instead of falling through.
        // chassisMaterial ↔ trackMaterial has friction 0.01, restitution 0.0 —
        // so it slides without dragging or bouncing.
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.5, 2.0));
        this.chassisBody = new CANNON.Body({
            mass,
            material: this.chassisMaterial,
            angularDamping: 0.4,
            linearDamping: 0.05,
            collisionFilterGroup: COLLISION_VEHICLE,
            collisionFilterMask: COLLISION_GROUND | COLLISION_WALL | COLLISION_VEHICLE,
        });
        this.chassisBody.addShape(chassisShape);
        // Spawn at origin, just above equilibrium (~1.23) so springs engage immediately
        this.chassisBody.position.set(0, 1.3, 0);

        const vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });

        // Shared wheel options — connection point Y = −0.5 (at chassis bottom).
        // Ray length = restLength + radius = 0.5 + 0.35 = 0.85 m.
        // At equilibrium the chassis floats at Y ≈ 1.23 with 0.12 m sag.
        const sharedWheel = {
            radius: 0.35,
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

        // Front wheels — lower frictionSlip → break traction sooner → understeer
        const frontWheel = { ...sharedWheel, frictionSlip: 1.8 };
        // Rear wheels — higher frictionSlip → hold traction → stable rear
        const rearWheel  = { ...sharedWheel, frictionSlip: 3.0 };

        vehicle.addWheel({ ...frontWheel, chassisConnectionPointLocal: new CANNON.Vec3(-1.0, -0.5, 1.5) });
        vehicle.addWheel({ ...frontWheel, chassisConnectionPointLocal: new CANNON.Vec3( 1.0, -0.5, 1.5) });
        vehicle.addWheel({ ...rearWheel,  chassisConnectionPointLocal: new CANNON.Vec3(-1.0, -0.5, -1.2) });
        vehicle.addWheel({ ...rearWheel,  chassisConnectionPointLocal: new CANNON.Vec3( 1.0, -0.5, -1.2) });

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
        this.world.step(1 / 60, dt, 3);

        // ── Hard floor guarantee ─────────────────────────────
        // If the chassis sinks so low that any wheel connection point goes
        // below the ground plane (Y = 0), raycasts miss the surface →
        // springs produce zero force → bus loses traction and gets stuck.
        // After each step we check all 4 connection points in world space
        // and push the chassis up by the worst deficit.
        if (this.vehicle && this.chassisBody) {
            let worstDeficit = 0;
            const pos  = this.chassisBody.position;
            const quat = this.chassisBody.quaternion;
            const tmp  = new CANNON.Vec3();

            for (const info of this.vehicle.wheelInfos) {
                quat.vmult(info.chassisConnectionPointLocal, tmp);
                const worldY = pos.y + tmp.y;
                // Keep at least 1 cm above the surface so the ray has room
                const deficit = 0.01 - worldY;
                if (deficit > worstDeficit) worstDeficit = deficit;
            }

            if (worstDeficit > 0) {
                this.chassisBody.position.y += worstDeficit;
                // Kill downward velocity so it doesn't immediately sink again
                if (this.chassisBody.velocity.y < 0) {
                    this.chassisBody.velocity.y = 0;
                }
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
