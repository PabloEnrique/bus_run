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
        this.scene.fog = new THREE.Fog(0x87ceeb, 100, 400);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        this.camera.position.set(0, 5, -8);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 80, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        this.scene.add(sun);

        // Ground
        const groundGeo = new THREE.PlaneGeometry(500, 500);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.9,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid helper for spatial reference
        const grid = new THREE.GridHelper(500, 100, 0x555555, 0x444444);
        grid.position.y = 0.01;
        this.scene.add(grid);

        // Remote players map
        this.remotePlayers = new Map();

        // Camera smoothing
        this._cameraTarget = new THREE.Vector3();
        this._cameraOffset = new THREE.Vector3(0, 4, -8);

        // Resize handler
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
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
            [-1.0, -0.3, 1.5],
            [1.0, -0.3, 1.5],
            [-1.0, -0.3, -1.2],
            [1.0, -0.3, -1.2],
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
        // Chassis
        mesh.position.copy(chassisBody.position);
        mesh.quaternion.copy(chassisBody.quaternion);

        // Wheels
        if (mesh.wheels && wheelBodies) {
            mesh.wheels.forEach((wheelMesh, i) => {
                if (wheelBodies[i]) {
                    const wp = wheelBodies[i].position;
                    const wq = wheelBodies[i].quaternion;
                    // Convert world position to local
                    wheelMesh.position.copy(
                        new THREE.Vector3(wp.x, wp.y, wp.z)
                            .sub(new THREE.Vector3(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z))
                            .applyQuaternion(
                                new THREE.Quaternion(
                                    chassisBody.quaternion.x,
                                    chassisBody.quaternion.y,
                                    chassisBody.quaternion.z,
                                    chassisBody.quaternion.w
                                ).invert()
                            )
                    );
                    // World quaternion relative to chassis
                    const chassisQInv = new THREE.Quaternion(
                        chassisBody.quaternion.x,
                        chassisBody.quaternion.y,
                        chassisBody.quaternion.z,
                        chassisBody.quaternion.w
                    ).invert();
                    const worldWheelQ = new THREE.Quaternion(wq.x, wq.y, wq.z, wq.w);
                    wheelMesh.quaternion.copy(chassisQInv.multiply(worldWheelQ));
                    // Keep the cylinder rotation
                    wheelMesh.rotateZ(Math.PI / 2);
                }
            });
        }
    }

    addRemotePlayer(id, color = 0x4488ff) {
        const mesh = this.createBusMesh(color);
        this.remotePlayers.set(id, mesh);
        return mesh;
    }

    updateRemotePlayer(id, position) {
        const mesh = this.remotePlayers.get(id);
        if (!mesh) return;
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.y = position.rotation || 0;
    }

    removeRemotePlayer(id) {
        const mesh = this.remotePlayers.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this.remotePlayers.delete(id);
        }
    }

    updateCamera(target) {
        if (!target) return;

        // Third-person chase camera
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(target.quaternion);
        const desiredPos = new THREE.Vector3()
            .copy(target.position)
            .add(forward.clone().multiplyScalar(-8))
            .add(new THREE.Vector3(0, 4, 0));

        this.camera.position.lerp(desiredPos, 0.05);
        this._cameraTarget.copy(target.position).add(new THREE.Vector3(0, 1, 0));
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
        this.remotePlayers.forEach((mesh) => this.scene.remove(mesh));
        this.remotePlayers.clear();
        this.renderer.dispose();
    }
}
