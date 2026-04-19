import * as THREE from 'three';

export class SceneManager {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} [mapConfig] — map configuration from maps/*.js
     */
    constructor(canvas, mapConfig) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        const skyColor = mapConfig?.skyColor ?? 0x87ceeb;
        const fogNear  = mapConfig?.fogNear  ?? 200;
        const fogFar   = mapConfig?.fogFar   ?? 600;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.Fog(skyColor, fogNear, fogFar);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, -8);

        // Lights — intensity from map config
        const ambient = new THREE.AmbientLight(0xffffff, mapConfig?.ambientIntensity ?? 0.6);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, mapConfig?.sunIntensity ?? 1.2);
        sun.position.set(50, 80, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -200;
        sun.shadow.camera.right = 200;
        sun.shadow.camera.top = 200;
        sun.shadow.camera.bottom = -200;
        sun.shadow.camera.far = 500;
        this.scene.add(sun);

        // Build scene from map config
        this._buildScene(mapConfig);

        // Remote players map — { mesh, targetPos, targetRotY }
        this.remotePlayers = new Map();

        // Camera smoothing
        this._cameraTarget = new THREE.Vector3();

        // Resize handler
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
    }

    // ─────────────────────────────────────────────────────────
    //  Scene construction from map config
    // ─────────────────────────────────────────────────────────

    /**
     * Build the 3D environment from a map configuration.
     * Creates ground, grass, buildings, walls, lane markings, street lights.
     * @param {object} [mapConfig]
     * @private
     */
    _buildScene(mapConfig) {
        const groundSize  = mapConfig?.groundSize  ?? 400;
        const groundColor = mapConfig?.groundColor ?? 0x333333;

        // Shared materials
        const asphalt  = new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.9 });
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.95 });
        const lineMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
        const wallMat  = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });

        // ── Ground plane ─────────────────────────────────────
        const roadGeo = new THREE.PlaneGeometry(groundSize, groundSize);
        const road = new THREE.Mesh(roadGeo, asphalt);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0;
        road.receiveShadow = true;
        this.scene.add(road);

        // ── Grass beyond the asphalt ─────────────────────────
        const grassSize = groundSize * 3;
        const grassGeo = new THREE.PlaneGeometry(grassSize, grassSize);
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -0.01;
        grass.receiveShadow = true;
        this.scene.add(grass);

        if (!mapConfig) {
            // Fallback: simple dashed center line (legacy behaviour)
            for (let z = -180; z <= 180; z += 8) {
                const dash = new THREE.Mesh(
                    new THREE.BoxGeometry(0.15, 0.02, 3), lineMat,
                );
                dash.position.set(0, 0.005, z);
                this.scene.add(dash);
            }
            return;
        }

        // ── Walls (visual representation) ────────────────────
        if (mapConfig.walls) {
            for (const wall of mapConfig.walls) {
                const [hx, hy, hz] = wall.size;
                const [px, py, pz] = wall.position;
                const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
                const mesh = new THREE.Mesh(geo, wallMat);
                mesh.position.set(px, py, pz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
            }
        }

        // ── Buildings ────────────────────────────────────────
        if (mapConfig.buildings) {
            for (const bldg of mapConfig.buildings) {
                const [w, h, d] = bldg.size;
                const [px, py, pz] = bldg.position;
                const mat = new THREE.MeshStandardMaterial({
                    color: bldg.color || 0x888888,
                    roughness: 0.8,
                });
                const geo = new THREE.BoxGeometry(w, h, d);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(px, py, pz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
            }
        }

        // ── Lane markings (dashed white lines) ───────────────
        if (mapConfig.laneMarkings) {
            for (const line of mapConfig.laneMarkings) {
                if (line.axis === 'z') {
                    for (let z = line.zStart; z <= line.zEnd; z += 8) {
                        const dash = new THREE.Mesh(
                            new THREE.BoxGeometry(0.15, 0.02, 3), lineMat,
                        );
                        dash.position.set(line.x, 0.005, z);
                        this.scene.add(dash);
                    }
                } else {
                    for (let x = line.xStart; x <= line.xEnd; x += 8) {
                        const dash = new THREE.Mesh(
                            new THREE.BoxGeometry(3, 0.02, 0.15), lineMat,
                        );
                        dash.position.set(x, 0.005, line.z);
                        this.scene.add(dash);
                    }
                }
            }
        }

        // ── Street lights (pole + lamp) ──────────────────────
        if (mapConfig.streetLights) {
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 });
            const lampMat = new THREE.MeshStandardMaterial({
                color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.3,
            });
            for (const [lx, lz] of mapConfig.streetLights) {
                // Pole
                const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6, 8);
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.set(lx, 3, lz);
                pole.castShadow = true;
                this.scene.add(pole);
                // Lamp head
                const lampGeo = new THREE.SphereGeometry(0.25, 8, 8);
                const lamp = new THREE.Mesh(lampGeo, lampMat);
                lamp.position.set(lx, 6.1, lz);
                this.scene.add(lamp);
            }
        }

        // ── Distance markers (highway) ───────────────────────
        if (mapConfig.distanceMarkers) {
            const markerMat = new THREE.MeshStandardMaterial({ color: 0x22aa44, roughness: 0.6 });
            for (const marker of mapConfig.distanceMarkers) {
                const [mx, mz] = marker.position;
                // Green post
                const geo = new THREE.BoxGeometry(0.6, 1.2, 0.15);
                const mesh = new THREE.Mesh(geo, markerMat);
                mesh.position.set(mx, 0.6, mz);
                this.scene.add(mesh);
            }
        }
    }

    /**
     * Create a bus mesh sized according to bus specs.
     * @param {number} color — hex color
     * @param {object} [busSpecs] — bus catalog data with dimension fields
     * @returns {THREE.Group}
     */
    createBusMesh(color = 0xffb300, busSpecs = {}) {
        const group = new THREE.Group();

        // Dimensions from specs (or sensible defaults)
        const length    = busSpecs.length_m     || 6.0;
        const width     = busSpecs.width_m      || 2.0;
        const height    = busSpecs.height_m     || 2.6;
        const wheelbase = busSpecs.wheelbase_m  || 3.5;
        const axleTrack = busSpecs.axle_track_m || 1.6;

        // Chassis body — lower half of the bus
        const bodyH = height / 2;
        const chassisGeo = new THREE.BoxGeometry(width, bodyH, length);
        const chassisMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.castShadow = true;
        group.add(chassis);

        // Roof — slightly narrower/shorter, sits on top
        const roofW = width * 0.9;
        const roofH = height * 0.19;
        const roofL = length * 0.85;
        const roofGeo = new THREE.BoxGeometry(roofW, roofH, roofL);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = bodyH / 2 + roofH / 2;
        roof.castShadow = true;
        group.add(roof);

        // Wheel radius scales with bus height (matches physics)
        const wheelRadius = 0.30 + (height - 2.5) * 0.1;

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.2, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

        const frontZ  =  wheelbase / 2;
        const rearZ   = -wheelbase / 2;
        const sideX   =  axleTrack / 2;
        const wheelY  = -(height / 4);   // bottom of chassis box

        const wheelPositions = [
            [-sideX, wheelY, frontZ],
            [ sideX, wheelY, frontZ],
            [-sideX, wheelY, rearZ],
            [ sideX, wheelY, rearZ],
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
