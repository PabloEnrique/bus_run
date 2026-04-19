import * as CANNON from 'cannon-es';

export class PhysicsWorld {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.defaultContactMaterial.friction = 0.3;

        // Ground
        const groundMaterial = new CANNON.Material('ground');
        const groundBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: groundMaterial,
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);

        // Vehicle-ground contact
        const vehicleMaterial = new CANNON.Material('vehicle');
        this.world.addContactMaterial(
            new CANNON.ContactMaterial(groundMaterial, vehicleMaterial, {
                friction: 0.5,
                restitution: 0.1,
            })
        );

        this.vehicleMaterial = vehicleMaterial;
        this.vehicle = null;
        this.chassisBody = null;
    }

    createVehicle(busSpecs) {
        const mass = busSpecs.base_weight_kg || 3500;
        const stiffness = (busSpecs.suspension_stiffness || 0.7) * 100;

        // Chassis
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.5, 2.0));
        this.chassisBody = new CANNON.Body({
            mass,
            material: this.vehicleMaterial,
        });
        this.chassisBody.addShape(chassisShape);
        this.chassisBody.position.set(0, 1.5, 0);

        const vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });

        // Wheel options
        const baseWheel = {
            radius: 0.35,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            suspensionStiffness: stiffness,
            suspensionRestLength: 0.3,
            dampingRelaxation: 3.0,
            dampingCompression: 4.0,
            frictionSlip: 2.5,
            rollInfluence: 0.05,
            maxSuspensionForce: mass * 15,
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        };

        const wheelPositions = [
            new CANNON.Vec3(-1.0, 0, 1.5),   // front-left
            new CANNON.Vec3(1.0, 0, 1.5),    // front-right
            new CANNON.Vec3(-1.0, 0, -1.2),  // rear-left
            new CANNON.Vec3(1.0, 0, -1.2),   // rear-right
        ];

        wheelPositions.forEach((pos) => {
            vehicle.addWheel({ ...baseWheel, chassisConnectionPointLocal: pos });
        });

        vehicle.addToWorld(this.world);

        // Create wheel bodies for collision
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

    destroy() {
        if (this.vehicle) {
            this.vehicle.removeFromWorld(this.world);
        }
        this.world = null;
    }
}
