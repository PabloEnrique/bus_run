import * as CANNON from 'cannon-es';

/** @module PhysicsWorld — Track dimensions (metres) */
const OUTER_W = 160;   // outer width  (X axis)
const OUTER_H = 100;   // outer height (Z axis)
const TRACK_W = 20;    // lane width
const INNER_W = OUTER_W - TRACK_W * 2; // 120
const INNER_H = OUTER_H - TRACK_W * 2; //  60
const WALL_HEIGHT = 2;
const WALL_THICK = 0.5;

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
     * Build the rectangular loop track (160×100 m outer, 20 m lane width)
     * with ground segments, infield, fallback plane, and wall barriers.
     * @private
     */
    _createTrack() {
        const halfOW = OUTER_W / 2;   // 80
        const halfOH = OUTER_H / 2;   // 50
        const halfIW = INNER_W / 2;   // 60
        const halfIH = INNER_H / 2;   // 30
        const tw = TRACK_W;           // 20
        const groundY = 0;
        const halfThick = 0.1;        // ground slab half-thickness

        // Helper: static box at position
        const addBox = (hx, hy, hz, px, py, pz, material) => {
            const body = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
                material,
            });
            body.position.set(px, py, pz);
            this.world.addBody(body);
            return body;
        };

        // ── Ground segments (track surface) ──────────────────
        // North straight: full OUTER_W wide, tw deep
        addBox(halfOW, halfThick, tw / 2,  0, groundY - halfThick, halfOH - tw / 2,  this.trackMaterial);
        // South straight
        addBox(halfOW, halfThick, tw / 2,  0, groundY - halfThick, -(halfOH - tw / 2), this.trackMaterial);
        // East straight: tw wide, INNER_H deep
        addBox(tw / 2, halfThick, halfIH,  halfOW - tw / 2, groundY - halfThick, 0,  this.trackMaterial);
        // West straight
        addBox(tw / 2, halfThick, halfIH,  -(halfOW - tw / 2), groundY - halfThick, 0, this.trackMaterial);

        // ── Infield (inside the loop — keep buses from cutting) ──
        addBox(halfIW, halfThick, halfIH, 0, groundY - halfThick - 0.01, 0, this.trackMaterial);

        // ── Fallback plane far below (catch falls) ───────────
        const fallback = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: this.trackMaterial,
        });
        fallback.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        fallback.position.set(0, -2, 0);
        this.world.addBody(fallback);

        // ── Walls ────────────────────────────────────────────
        const wh = WALL_HEIGHT / 2;
        const wt = WALL_THICK / 2;

        // Outer walls
        addBox(halfOW, wh, wt,  0, wh,  halfOH + wt,  this.wallMaterial); // north outer
        addBox(halfOW, wh, wt,  0, wh, -(halfOH + wt), this.wallMaterial); // south outer
        addBox(wt, wh, halfOH,  halfOW + wt, wh, 0,   this.wallMaterial); // east outer
        addBox(wt, wh, halfOH, -(halfOW + wt), wh, 0,  this.wallMaterial); // west outer

        // Inner walls
        addBox(halfIW, wh, wt,  0, wh,  halfIH + wt,  this.wallMaterial); // north inner
        addBox(halfIW, wh, wt,  0, wh, -(halfIH + wt), this.wallMaterial); // south inner
        addBox(wt, wh, halfIH,  halfIW + wt, wh, 0,   this.wallMaterial); // east inner
        addBox(wt, wh, halfIH, -(halfIW + wt), wh, 0,  this.wallMaterial); // west inner
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

        // Stiffness: each spring must support mass/4 with ~0.15 m static sag.
        // F = k × x  →  k = (mass × g) / (4 × sag)  ≈  mass × 16
        const stiffness = mass * 16;

        // Chassis — use chassisMaterial (near-zero ground friction) so if chassis
        // scrapes the ground it doesn't block movement.
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.5, 2.0));
        this.chassisBody = new CANNON.Body({
            mass,
            material: this.chassisMaterial,
            angularDamping: 0.4,
            linearDamping: 0.05,
        });
        this.chassisBody.addShape(chassisShape);
        // Spawn on south straight — high enough to settle onto springs
        this.chassisBody.position.set(0, 2.0, -(OUTER_H / 2 - TRACK_W / 2));

        const vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });

        // Shared wheel options — connection point Y = -0.65 places ray origin
        // below the chassis bottom (-0.5) so springs carry the full weight.
        const sharedWheel = {
            radius: 0.35,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            suspensionStiffness: stiffness,
            suspensionRestLength: 0.6,
            dampingRelaxation: 5.0,
            dampingCompression: 4.5,
            rollInfluence: 0.05,
            maxSuspensionForce: mass * 20,
            maxSuspensionTravel: 0.5,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        };

        // Front wheels — lower frictionSlip → break traction sooner → understeer
        const frontWheel = { ...sharedWheel, frictionSlip: 1.8 };
        // Rear wheels — higher frictionSlip → hold traction → stable rear
        const rearWheel  = { ...sharedWheel, frictionSlip: 3.0 };

        vehicle.addWheel({ ...frontWheel, chassisConnectionPointLocal: new CANNON.Vec3(-1.0, -0.65, 1.5) });
        vehicle.addWheel({ ...frontWheel, chassisConnectionPointLocal: new CANNON.Vec3( 1.0, -0.65, 1.5) });
        vehicle.addWheel({ ...rearWheel,  chassisConnectionPointLocal: new CANNON.Vec3(-1.0, -0.65, -1.2) });
        vehicle.addWheel({ ...rearWheel,  chassisConnectionPointLocal: new CANNON.Vec3( 1.0, -0.65, -1.2) });

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

        // Sync wheel bodies to raycast results
        if (this.vehicle) {
            this.vehicle.wheelInfos.forEach((wheel, i) => {
                this.vehicle.updateWheelTransform(i);
                const t = wheel.worldTransform;
                this.wheelBodies[i].position.copy(t.position);
                this.wheelBodies[i].quaternion.copy(t.quaternion);
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
