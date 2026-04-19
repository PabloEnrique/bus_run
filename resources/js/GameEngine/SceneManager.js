import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

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

        // ── GLTFLoader (shared instance) ─────────────────────
        this._gltfLoader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        this._gltfLoader.setDRACOLoader(draco);

        // Environment map (set by loadEnvironment)
        this._envMap = null;
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

        // ── Dynamic camera/shadow bounds for large maps ──────
        if (groundSize > 500) {
            this.camera.far = Math.max(2000, groundSize * 2);
            this.camera.updateProjectionMatrix();
            if (this.scene.fog) {
                this.scene.fog.near = groundSize * 0.3;
                this.scene.fog.far  = groundSize * 1.5;
            }
        }

        // ── Ground — flat or heightfield terrain ─────────────
        if (mapConfig?.heightData) {
            this._buildTerrain(mapConfig, asphalt, grassMat);
        } else {
            const roadGeo = new THREE.PlaneGeometry(groundSize, groundSize);
            const road = new THREE.Mesh(roadGeo, asphalt);
            road.rotation.x = -Math.PI / 2;
            road.position.y = 0;
            road.receiveShadow = true;
            this.scene.add(road);

            const grassSize = groundSize * 3;
            const grassGeo = new THREE.PlaneGeometry(grassSize, grassSize);
            const grass = new THREE.Mesh(grassGeo, grassMat);
            grass.rotation.x = -Math.PI / 2;
            grass.position.y = -0.01;
            grass.receiveShadow = true;
            this.scene.add(grass);
        }

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
     * Build terrain mesh from heightData (2D elevation array).
     * Displaces a PlaneGeometry's vertices to match the elevation grid.
     * @param {object} mapConfig
     * @param {THREE.Material} roadMat
     * @param {THREE.Material} grassMat
     * @private
     */
    _buildTerrain(mapConfig, roadMat, grassMat) {
        const data = mapConfig.heightData;
        const elSize = mapConfig.heightElementSize || 10;
        const rows = data.length;
        const cols = data[0].length;
        const totalW = cols * elSize;
        const totalD = rows * elSize;

        const geo = new THREE.PlaneGeometry(totalW, totalD, cols - 1, rows - 1);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                pos.setY(idx, data[r][c]);
            }
        }
        geo.computeVertexNormals();

        const terrain = new THREE.Mesh(geo, roadMat);
        terrain.receiveShadow = true;
        this.scene.add(terrain);

        // Grass skirt below the terrain
        const grassGeo = new THREE.PlaneGeometry(totalW * 3, totalD * 3);
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -1;
        grass.receiveShadow = true;
        this.scene.add(grass);
    }

    // ─────────────────────────────────────────────────────────
    //  HDRI Environment Map (PBR reflections)
    // ─────────────────────────────────────────────────────────

    /**
     * Load an .hdr environment map for PBR reflections.
     * Sets scene.environment (NOT scene.background — keeps solid skyColor).
     * Falls back to a procedural env map if the file is unavailable.
     * @param {string} hdrPath — URL to .hdr file (e.g. '/models/env/outdoor.hdr')
     * @returns {Promise<void>}
     */
    async loadEnvironment(hdrPath) {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        pmrem.compileEquirectangularShader();

        try {
            const texture = await new RGBELoader().loadAsync(hdrPath);
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this._envMap = pmrem.fromEquirectangular(texture).texture;
            texture.dispose();
            console.info('[Scene] HDRI environment loaded from', hdrPath);
        } catch {
            // .hdr not available — generate procedural env from scene lights
            this._envMap = this._generateProceduralEnvMap(pmrem);
            console.warn('[Scene] HDRI not found, using procedural environment map');
        }

        this.scene.environment = this._envMap;
        pmrem.dispose();
    }

    /**
     * Generate a minimal procedural environment map from the current scene lights.
     * Produces a simple gradient with sun highlight so metallic surfaces
     * show reflections even without an .hdr file.
     * @param {THREE.PMREMGenerator} pmrem
     * @returns {THREE.Texture}
     * @private
     */
    _generateProceduralEnvMap(pmrem) {
        const envScene = new THREE.Scene();
        const skyColor = this.scene.background instanceof THREE.Color
            ? this.scene.background
            : new THREE.Color(0x87ceeb);

        // Hemisphere gradient: sky above, darker ground below
        const hemiLight = new THREE.HemisphereLight(skyColor, 0x444422, 1.0);
        envScene.add(hemiLight);

        // Sun highlight for specular reflections
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(50, 80, 30);
        envScene.add(sun);

        return pmrem.fromScene(envScene, 0.04).texture;
    }

    // ─────────────────────────────────────────────────────────
    //  Bus mesh creation (procedural + GLB)
    // ─────────────────────────────────────────────────────────

    /**
     * Create a procedural bus mesh sized according to bus specs.
     * Used as instant fallback while GLB loads (or when no GLB is available).
     * @param {number} color — hex color
     * @param {object} [busSpecs] — bus catalog data with dimension fields
     * @returns {THREE.Group}
     */
    createBusMesh(color = 0xffb300, busSpecs = {}) {
        return this._createProceduralBus(color, busSpecs);
    }

    /**
     * @param {number} color
     * @param {object} busSpecs
     * @returns {THREE.Group}
     * @private
     */
    _createProceduralBus(color, busSpecs = {}) {
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

    /**
     * Asynchronously load a GLB bus model and replace the procedural mesh.
     * Applies PBR paint material (high metalness, low roughness) to body meshes.
     * Identifies wheels by mesh name convention (wheel, rueda, tire, llanta).
     *
     * @param {string} glbFile — filename inside /models/buses/ (e.g. 'rosa_2nd.glb')
     * @param {number} color — hex paint color
     * @param {object} busSpecs — bus catalog dimensions
     * @param {THREE.Group} [proceduralMesh] — existing procedural mesh to remove on success
     * @returns {Promise<THREE.Group|null>} — GLB group or null on failure
     */
    async loadBusMeshGLB(glbFile, color, busSpecs = {}, proceduralMesh = null) {
        const url = `/models/buses/${glbFile}`;
        try {
            const gltf = await this._gltfLoader.loadAsync(url);
            const model = gltf.scene;

            // ── Scale normalization ──────────────────────────
            // Compute bounding box of loaded model, scale to match bus length.
            const box = new THREE.Box3().setFromObject(model);
            const modelSize = new THREE.Vector3();
            box.getSize(modelSize);

            const targetLength = busSpecs.length_m || 6.0;
            // Use the longest axis (typically Z or X depending on model orientation)
            const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
            if (maxDim > 0) {
                const scale = targetLength / maxDim;
                model.scale.setScalar(scale);
            }

            // Re-center after scaling
            const scaledBox = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            scaledBox.getCenter(center);
            model.position.sub(center);

            // ── Wrap in group (same interface as procedural) ─
            const group = new THREE.Group();
            group.add(model);
            group.wheels = [];

            // ── PBR paint material ───────────────────────────
            const paintMat = new THREE.MeshStandardMaterial({
                color,
                metalness: 0.8,
                roughness: 0.25,
                envMap: this._envMap,
                envMapIntensity: 1.2,
            });

            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x222233,
                metalness: 0.1,
                roughness: 0.05,
                opacity: 0.4,
                transparent: true,
            });

            const wheelPattern = /wheel|rueda|tire|llanta|tyre/i;
            const glassPattern = /glass|window|vidrio|ventana|cristal/i;
            const bodyPattern  = /body|paint|carroceria|chassis|hull|frame/i;

            model.traverse((child) => {
                if (!child.isMesh) return;

                child.castShadow = true;
                child.receiveShadow = true;

                const name = (child.name || '').toLowerCase();
                const matName = (child.material?.name || '').toLowerCase();

                if (wheelPattern.test(name) || wheelPattern.test(matName)) {
                    // Wheel — keep original material, collect for physics sync
                    group.wheels.push(child);
                } else if (glassPattern.test(name) || glassPattern.test(matName)) {
                    child.material = glassMat;
                } else if (bodyPattern.test(name) || bodyPattern.test(matName)) {
                    child.material = paintMat;
                } else {
                    // Default: apply paint to untagged meshes
                    child.material = paintMat;
                }
            });

            // ── Sort wheels by position: FL, FR, RL, RR ─────
            if (group.wheels.length >= 4) {
                group.wheels.sort((a, b) => {
                    const wpa = new THREE.Vector3();
                    const wpb = new THREE.Vector3();
                    a.getWorldPosition(wpa);
                    b.getWorldPosition(wpb);
                    // Front (higher Z) first, then left (lower X) first
                    if (Math.abs(wpa.z - wpb.z) > 0.3) return wpb.z - wpa.z;
                    return wpa.x - wpb.x;
                });
            }

            // Remove procedural mesh if provided
            if (proceduralMesh) {
                this.scene.remove(proceduralMesh);
            }

            this.scene.add(group);
            console.info('[Scene] GLB bus loaded:', glbFile, '— wheels found:', group.wheels.length);
            return group;
        } catch (err) {
            console.warn('[Scene] GLB load failed for', glbFile, '— keeping procedural mesh:', err.message);
            return null;
        }
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
        if (this._envMap) {
            this._envMap.dispose();
            this._envMap = null;
        }
        this._gltfLoader.dracoLoader?.dispose();
        this.renderer.dispose();
    }
}
