import * as THREE from 'three';

export class SceneManager {
    constructor(canvas) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 200, 600);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
        this.camera.position.set(0, 5, -8);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 80, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.camera.far = 250;
        this.scene.add(sun);

        // Build track visuals
        this._createTrackVisuals();

        // Remote players map — { mesh, targetPos, targetRotY }
        this.remotePlayers = new Map();

        // Camera smoothing
        this._cameraTarget = new THREE.Vector3();

        // Resize handler
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
    }

    // ─────────────────────────────────────────────────────────
    //  Track visuals
    // ─────────────────────────────────────────────────────────

    _createTrackVisuals() {
        // Materials
        const asphalt = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.95 });
        const lineMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });

        // ── Large flat asphalt plane ─────────────────────────
        const roadGeo = new THREE.PlaneGeometry(400, 400);
        const road = new THREE.Mesh(roadGeo, asphalt);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0;
        road.receiveShadow = true;
        this.scene.add(road);

        // ── Grass fringe beyond the asphalt ──────────────────
        const grassGeo = new THREE.PlaneGeometry(1000, 1000);
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -0.01;
        grass.receiveShadow = true;
        this.scene.add(grass);

        // ── Lane markings (white dashed center line along Z) ─
        for (let z = -180; z <= 180; z += 8) {
            const dash = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.02, 3),
                lineMat,
            );
            dash.position.set(0, 0.005, z);
            dash.receiveShadow = true;
            this.scene.add(dash);
        }
    }

    createBusMesh(color = 0xffb300) {
        const group = new THREE.Group();

        // Chassis (bus body)
        const chassisGeo = new THREE.BoxGeometry(2.0, 1.0, 4.0);
        const chassisMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.castShadow = true;
        group.add(chassis);

        // Roof (slightly smaller, on top)
        const roofGeo = new THREE.BoxGeometry(1.8, 0.5, 3.2);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 0.75;
        roof.castShadow = true;
        group.add(roof);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

        const wheelPositions = [
            [-1.0, -0.5, 1.5],
            [1.0, -0.5, 1.5],
            [-1.0, -0.5, -1.2],
            [1.0, -0.5, -1.2],
        ];

        group.wheels = [];
        wheelPositions.forEach(([x, y, z]) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, y, z);
            wheel.castShadow = true;
            group.add(wheel);
            group.wheels.push(wheel);
        });

        this.scene.add(group);
        return group;
    }

    syncMeshToBody(mesh, chassisBody, wheelBodies) {
        if (!mesh || !chassisBody) return;

        // Chassis
        mesh.position.copy(chassisBody.position);
        mesh.quaternion.copy(chassisBody.quaternion);

        // Wheels — position from physics, keep initial cylinder rotation (Z = PI/2)
        if (mesh.wheels && wheelBodies) {
            mesh.wheels.forEach((wheelMesh, i) => {
                if (!wheelBodies[i]) return;

                const wp = wheelBodies[i].position;
                // Convert world position to chassis-local space
                const localPos = new THREE.Vector3(wp.x, wp.y, wp.z)
                    .sub(new THREE.Vector3(
                        chassisBody.position.x,
                        chassisBody.position.y,
                        chassisBody.position.z,
                    ))
                    .applyQuaternion(
                        new THREE.Quaternion(
                            chassisBody.quaternion.x,
                            chassisBody.quaternion.y,
                            chassisBody.quaternion.z,
                            chassisBody.quaternion.w,
                        ).invert()
                    );
                wheelMesh.position.copy(localPos);

                // Rotation: use physics quaternion then apply the cylinder
                // “up-to-axle” flip so the cylinder disc faces sideways.
                const chassisQInv = new THREE.Quaternion(
                    chassisBody.quaternion.x,
                    chassisBody.quaternion.y,
                    chassisBody.quaternion.z,
                    chassisBody.quaternion.w,
                ).invert();
                const worldWheelQ = new THREE.Quaternion(
                    wheelBodies[i].quaternion.x,
                    wheelBodies[i].quaternion.y,
                    wheelBodies[i].quaternion.z,
                    wheelBodies[i].quaternion.w,
                );
                // Local-space wheel rotation
                const localQ = chassisQInv.multiply(worldWheelQ);
                // Cylinder is Y-up; axle is X. Rotate 90° around Z to
                // orient the disc perpendicular to the axle.
                const cylFix = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 0, 1), Math.PI / 2,
                );
                wheelMesh.quaternion.copy(localQ.multiply(cylFix));
            });
        }
    }

    addRemotePlayer(id, color = 0x4488ff) {
        const mesh = this.createBusMesh(color);
        this.remotePlayers.set(id, {
            mesh,
            targetPos: new THREE.Vector3(),
            targetRotY: 0,
        });
        return mesh;
    }

    updateRemotePlayer(id, position) {
        const entry = this.remotePlayers.get(id);
        if (!entry) return;
        // Set interpolation targets — do NOT snap directly
        entry.targetPos.set(position.x, position.y, position.z);
        entry.targetRotY = position.rotation || 0;
    }

    /** Smoothly interpolate remote players toward their targets each frame */
    lerpRemotePlayers(alpha = 0.15) {
        this.remotePlayers.forEach((entry) => {
            entry.mesh.position.lerp(entry.targetPos, alpha);
            entry.mesh.rotation.y = THREE.MathUtils.lerp(entry.mesh.rotation.y, entry.targetRotY, alpha);
        });
    }

    removeRemotePlayer(id) {
        const entry = this.remotePlayers.get(id);
        if (entry) {
            this.scene.remove(entry.mesh);
            this.remotePlayers.delete(id);
        }
    }

    /**
     * Velocity-aware chase camera.
     * @param {THREE.Object3D} target — player mesh
     * @param {{ x: number, y: number, z: number }} velocity — chassis velocity from Cannon-es
     */
    updateCamera(target, velocity) {
        if (!target) return;

        // Speed in m/s (horizontal)
        const speed = velocity
            ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
            : 0;

        // Dynamic distance + height — camera pulls back as speed increases
        const dist   = 10 + Math.min(speed * 0.08, 6);
        const height = 4  + Math.min(speed * 0.02, 2);

        // Forward = local +Z in world space
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(target.quaternion);

        // Position camera BEHIND the bus (opposite of forward)
        const desiredPos = target.position.clone()
            .sub(forward.clone().multiplyScalar(dist))
            .add(new THREE.Vector3(0, height, 0));

        // Smooth follow
        this.camera.position.lerp(desiredPos, 0.06);

        // Look at a point slightly AHEAD and ABOVE the bus
        const lookAhead = 4 + Math.min(speed * 0.15, 8);
        this._cameraTarget
            .copy(target.position)
            .add(forward.clone().multiplyScalar(lookAhead))
            .add(new THREE.Vector3(0, 1.5, 0));
        this.camera.lookAt(this._cameraTarget);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.remotePlayers.forEach((entry) => this.scene.remove(entry.mesh));
        this.remotePlayers.clear();
        this.renderer.dispose();
    }
}
