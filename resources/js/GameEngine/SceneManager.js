import * as THREE from 'three';
import { OUTER_W, OUTER_H, INNER_W, INNER_H, TRACK_W, WALL_HEIGHT } from './PhysicsWorld.js';

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
        const halfOW = OUTER_W / 2;
        const halfOH = OUTER_H / 2;
        const halfIW = INNER_W / 2;
        const halfIH = INNER_H / 2;
        const tw = TRACK_W;

        // Materials
        const asphalt = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.95 });
        const dirtMat  = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
        const lineMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });

        const addMesh = (geo, mat, px, py, pz) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(px, py, pz);
            m.receiveShadow = true;
            this.scene.add(m);
            return m;
        };

        // ── Track surface (4 straights) ──────────────────────
        // North: OUTER_W × tw
        addMesh(new THREE.BoxGeometry(OUTER_W, 0.15, tw), asphalt, 0, -0.075, halfOH - tw / 2);
        // South
        addMesh(new THREE.BoxGeometry(OUTER_W, 0.15, tw), asphalt, 0, -0.075, -(halfOH - tw / 2));
        // East: tw × INNER_H
        addMesh(new THREE.BoxGeometry(tw, 0.15, INNER_H), asphalt, halfOW - tw / 2, -0.075, 0);
        // West
        addMesh(new THREE.BoxGeometry(tw, 0.15, INNER_H), asphalt, -(halfOW - tw / 2), -0.075, 0);

        // ── Infield (green) ──────────────────────────────────
        addMesh(new THREE.BoxGeometry(INNER_W, 0.05, INNER_H), grassMat, 0, -0.15, 0);

        // ── Outside ground (brown) ───────────────────────────
        const outsideGeo = new THREE.PlaneGeometry(500, 500);
        const outside = new THREE.Mesh(outsideGeo, dirtMat);
        outside.rotation.x = -Math.PI / 2;
        outside.position.y = -0.2;
        outside.receiveShadow = true;
        this.scene.add(outside);

        // ── Start / finish line (south straight, white stripe) ──
        addMesh(new THREE.BoxGeometry(tw, 0.16, 1.0), lineMat, 0, 0, -(halfOH - tw / 2));

        // ── Walls ────────────────────────────────────────────
        const wh = WALL_HEIGHT;
        const wt = 0.5;

        const addWall = (sx, sy, sz, px, py, pz) => {
            const geo = new THREE.BoxGeometry(sx, sy, sz);
            const m = new THREE.Mesh(geo, wallMat);
            m.position.set(px, py, pz);
            m.castShadow = true;
            m.receiveShadow = true;
            this.scene.add(m);
        };

        // Outer walls
        addWall(OUTER_W, wh, wt,  0, wh / 2,  halfOH + wt / 2);
        addWall(OUTER_W, wh, wt,  0, wh / 2, -(halfOH + wt / 2));
        addWall(wt, wh, OUTER_H,  halfOW + wt / 2, wh / 2, 0);
        addWall(wt, wh, OUTER_H, -(halfOW + wt / 2), wh / 2, 0);

        // Inner walls
        addWall(INNER_W, wh, wt,  0, wh / 2,  halfIH + wt / 2);
        addWall(INNER_W, wh, wt,  0, wh / 2, -(halfIH + wt / 2));
        addWall(wt, wh, INNER_H,  halfIW + wt / 2, wh / 2, 0);
        addWall(wt, wh, INNER_H, -(halfIW + wt / 2), wh / 2, 0);
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
            [-1.0, -0.65, 1.5],
            [1.0, -0.65, 1.5],
            [-1.0, -0.65, -1.2],
            [1.0, -0.65, -1.2],
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

        // Dynamic distance + height
        const dist   = 8 + Math.min(speed * 0.05, 4);
        const height = 4 + Math.min(speed * 0.03, 1.5);

        // Camera behind bus
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(target.quaternion);
        const desiredPos = new THREE.Vector3()
            .copy(target.position)
            .add(forward.clone().multiplyScalar(-dist))
            .add(new THREE.Vector3(0, height, 0));

        this.camera.position.lerp(desiredPos, 0.08);

        // Look-ahead: look at a point ahead of the bus proportional to speed
        const lookAhead = Math.min(speed * 0.3, 10);
        this._cameraTarget
            .copy(target.position)
            .add(forward.clone().multiplyScalar(lookAhead))
            .add(new THREE.Vector3(0, 1, 0));
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
