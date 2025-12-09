import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class Player {
    constructor(scene, renderer, camera, world, network, audio) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.world = world;
        this.network = network;
        this.audio = audio;

        // Rig setup
        this.userGroup = new THREE.Group(); // Represents the player in world space (feet)
        this.userGroup.position.set(0, 305, 0); // Spawn on roof
        this.scene.add(this.userGroup);
        
        // Camera must be added to a group to be moved by physics
        this.userGroup.add(this.camera);

        // Controllers
        this.controller1 = this.renderer.xr.getController(0);
        this.controller2 = this.renderer.xr.getController(1);
        this.userGroup.add(this.controller1);
        this.userGroup.add(this.controller2);

        // Models
        const controllerModelFactory = new XRControllerModelFactory();
        const handModelFactory = new XRHandModelFactory();

        this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.userGroup.add(this.controllerGrip1);

        this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
        this.userGroup.add(this.controllerGrip2);

        // Hands
        this.hand1 = this.renderer.xr.getHand(0);
        this.hand1.add(handModelFactory.createHandModel(this.hand1));
        this.userGroup.add(this.hand1);

        this.hand2 = this.renderer.xr.getHand(1);
        this.hand2.add(handModelFactory.createHandModel(this.hand2));
        this.userGroup.add(this.hand2);

        // Physics State
        this.velocity = new THREE.Vector3();
        this.gravity = -9.8;
        this.isClimbing = false;
        this.climbHand = null; // 'left' or 'right'
        this.climbAnchor = new THREE.Vector3(); // World pos where we grabbed
        this.climbOffset = new THREE.Vector3(); // Offset from hand to anchor

        // Input State
        this.controllers = {
            left: { gamepad: null, object: this.controller1, grip: false, trigger: false, hand: this.hand1 },
            right: { gamepad: null, object: this.controller2, grip: false, trigger: false, hand: this.hand2 }
        };

        // Event Listeners
        this.controller1.addEventListener('selectstart', () => this.onTriggerStart('left'));
        this.controller1.addEventListener('squeezestart', () => this.onGripStart('left'));
        this.controller1.addEventListener('squeezeend', () => this.onGripEnd('left'));
        
        this.controller2.addEventListener('selectstart', () => this.onTriggerStart('right'));
        this.controller2.addEventListener('squeezestart', () => this.onGripStart('right'));
        this.controller2.addEventListener('squeezeend', () => this.onGripEnd('right'));

        // Peers visualization
        this.peerMeshes = {};
    }

    onTriggerStart(side) {
        // Shooting logic
        this.audio.play('shoot', 0.5);
        
        // Simple Raycast shoot
        const controller = side === 'left' ? this.controller1 : this.controller2;
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // Visual Bullet
        const bullet = new THREE.Mesh(
            new THREE.SphereGeometry(0.05), 
            new THREE.MeshBasicMaterial({color: 0xffff00})
        );
        bullet.position.copy(raycaster.ray.origin);
        this.scene.add(bullet);
        
        // Animate bullet (simple)
        const dir = raycaster.ray.direction.clone();
        const speed = 50;
        const startTime = Date.now();
        const animateBullet = () => {
            const now = Date.now();
            if(now - startTime > 2000) {
                this.scene.remove(bullet);
                return;
            }
            bullet.position.addScaledVector(dir, speed * 0.016);
            requestAnimationFrame(animateBullet);
        }
        animateBullet();
    }

    onGripStart(side) {
        const c = this.controllers[side];
        c.grip = true;
        
        // Check for climbable objects
        const handPos = new THREE.Vector3();
        c.object.getWorldPosition(handPos);

        // Simple distance check to all colliders (optimization: use octree or specific layer in real app)
        let canClimb = false;
        
        // Helper to check intersect
        const sphere = new THREE.Sphere(handPos, 0.15); // 15cm grip radius
        
        for (let obj of this.world.colliders) {
            // Simplified: Checking bounding box of colliders
            // In a real game, use precise collision
            if(!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            const box = new THREE.Box3().copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
            
            if (box.intersectsSphere(sphere)) {
                canClimb = true;
                break;
            }
        }

        if (canClimb) {
            this.isClimbing = true;
            this.climbHand = side;
            this.velocity.set(0,0,0); // Stop falling
            
            // Store the relationship between the hand and the world space
            // Actually, for climbing, we want to move the WORLD relative to the HAND.
            // So we need to know where the hand IS in local space relative to the rig,
            // and lock that world position.
            this.previousHandPos = handPos.clone();
            this.audio.play('climb');
        }
    }

    onGripEnd(side) {
        this.controllers[side].grip = false;
        if (this.climbHand === side) {
            this.isClimbing = false;
            this.climbHand = null;
            // Add a little toss velocity?
            this.velocity.y = 2; // slight jump
        }
    }

    update(dt) {
        this.updateControllers();
        this.handleMovement(dt);
        this.syncNetwork();
        this.updatePeers();
    }

    updateControllers() {
        const session = this.renderer.xr.getSession();
        if (session) {
            for (const source of session.inputSources) {
                if (source.gamepad) {
                    const side = source.handedness;
                    if (this.controllers[side]) {
                        this.controllers[side].gamepad = source.gamepad;
                    }
                }
            }
        }
    }

    handleMovement(dt) {
        // 1. Climbing Logic
        if (this.isClimbing && this.climbHand) {
            this.velocity.set(0, 0, 0);
            const controller = this.controllers[this.climbHand].object;
            const currentHandPos = new THREE.Vector3();
            controller.getWorldPosition(currentHandPos);
            
            const delta = currentHandPos.clone().sub(this.previousHandPos);
            this.userGroup.position.sub(delta);
            controller.getWorldPosition(this.previousHandPos);
            return; 
        }

        // 2. Gliding & Gesture Movement
        let isGliding = false;
        const headPos = new THREE.Vector3();
        const headQuat = new THREE.Quaternion();
        this.camera.getWorldPosition(headPos);
        this.camera.getWorldQuaternion(headQuat);
        
        const headDir = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
        const headRight = new THREE.Vector3(1, 0, 0).applyQuaternion(headQuat);

        // Check Gliding (Arms out T-Pose)
        const lPos = new THREE.Vector3(); this.controller1.getWorldPosition(lPos);
        const rPos = new THREE.Vector3(); this.controller2.getWorldPosition(rPos);
        
        const lRel = lPos.clone().sub(headPos);
        const rRel = rPos.clone().sub(headPos);
        
        // T-Pose check: Arms extended laterally (Left < -0.3, Right > 0.3)
        if (lRel.dot(headRight) < -0.3 && rRel.dot(headRight) > 0.3) {
            isGliding = true;
        }

        // Input Calculation
        const inputVec = new THREE.Vector3();
        let speed = 6.0;

        // A. Joystick
        const leftStick = this.controllers.left.gamepad;
        if (leftStick && leftStick.axes.length >= 4) {
            const dx = leftStick.axes[2];
            const dy = leftStick.axes[3];
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                const flatHead = headDir.clone().setY(0).normalize();
                const flatSide = new THREE.Vector3(-flatHead.z, 0, flatHead.x);
                inputVec.add(flatHead.multiplyScalar(-dy));
                inputVec.add(flatSide.multiplyScalar(dx));
            }
        }

        // B. Gesture (Reaching forward)
        // If hand is > 0.4m in front of head in look direction
        const forwardThreshold = 0.4;
        if (lRel.dot(headDir) > forwardThreshold || rRel.dot(headDir) > forwardThreshold) {
            const flatHead = headDir.clone().setY(0).normalize();
            inputVec.add(flatHead.multiplyScalar(1.0));
        }

        // Apply Input with Wall Collision
        if (inputVec.length() > 0) {
            inputVec.normalize().multiplyScalar(speed * dt);
            
            const curFeet = this.userGroup.position.clone();
            // Raycast at waist height (0.5m)
            const wallRay = new THREE.Raycaster(
                curFeet.clone().add(new THREE.Vector3(0, 0.5, 0)), 
                inputVec.clone().normalize(), 
                0, 
                1.0
            );
            const wallHits = wallRay.intersectObjects(this.world.colliders);
            
            // Stop if too close to wall (0.3m buffer)
            if (wallHits.length === 0 || wallHits[0].distance > 0.3) {
                 this.userGroup.position.add(inputVec);
            }
        }

        // 3. Rotation (Right Stick)
        const rightStick = this.controllers.right.gamepad;
        if (rightStick && rightStick.axes.length >= 4) {
            const rx = rightStick.axes[2];
            if (Math.abs(rx) > 0.5 && !this.turnSnapCooldown) {
                this.userGroup.rotation.y -= Math.sign(rx) * Math.PI / 4;
                this.turnSnapCooldown = true;
                setTimeout(() => this.turnSnapCooldown = false, 400);
            }
        }

        // 4. Physics
        const feetPos = this.userGroup.position.clone();
        
        // Ground Check
        const rayOrigin = feetPos.clone().add(new THREE.Vector3(0, 1.0, 0)); 
        const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObjects(this.world.colliders);
        
        let groundY = -Infinity;
        if (intersects.length > 0) {
            // Find highest ground below origin
            for(const hit of intersects) {
                if (hit.point.y < rayOrigin.y) {
                    groundY = hit.point.y;
                    break;
                }
            }
        }

        const distToGround = feetPos.y - groundY;
        
        // Landing / On Ground
        if (distToGround <= 0.1 && this.velocity.y <= 0) {
            this.userGroup.position.y = groundY;
            this.velocity.y = 0;
        } else {
            // Airborne
            if (isGliding && this.velocity.y < 0) {
                // Gliding Physics
                this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -2.0, dt * 2); // Terminal velocity for gliding
                const forward = headDir.clone().setY(0).normalize();
                this.userGroup.position.addScaledVector(forward, 12 * dt); // Fast glide speed
            } else {
                this.velocity.y += this.gravity * dt;
            }
            
            // Apply Velocity (Continuous floor check)
            const deltaY = this.velocity.y * dt;
            if (feetPos.y + deltaY < groundY) {
                this.userGroup.position.y = groundY;
                this.velocity.y = 0;
            } else {
                this.userGroup.position.y += deltaY;
            }
        }
    }

    syncNetwork() {
        if (!this.network.myId) return;

        const headPos = new THREE.Vector3();
        const headRot = new THREE.Quaternion();
        this.camera.getWorldPosition(headPos);
        this.camera.getWorldQuaternion(headRot);

        const lHandPos = new THREE.Vector3();
        const lHandRot = new THREE.Quaternion();
        this.controller1.getWorldPosition(lHandPos);
        this.controller1.getWorldQuaternion(lHandRot);

        const rHandPos = new THREE.Vector3();
        const rHandRot = new THREE.Quaternion();
        this.controller2.getWorldPosition(rHandPos);
        this.controller2.getWorldQuaternion(rHandRot);

        this.network.updatePlayer({
            hP: headPos, hR: headRot,
            lP: lHandPos, lR: lHandRot,
            rP: rHandPos, rR: rHandRot,
            color: this.myColor || (this.myColor = Math.random() * 0xffffff)
        });
    }

    updatePeers() {
        const peers = this.network.peers;
        const myId = this.network.myId;

        // Cleanup disconnected
        for (let id in this.peerMeshes) {
            if (!peers[id]) {
                this.scene.remove(this.peerMeshes[id].root);
                delete this.peerMeshes[id];
            }
        }

        // Update / Create
        for (let id in peers) {
            if (id === myId) continue;
            const pData = peers[id];
            
            if (!this.peerMeshes[id]) {
                // Create Avatar
                const root = new THREE.Group();
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: pData.color || 0xffffff }));
                const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
                const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
                
                root.add(head);
                root.add(lHand);
                root.add(rHand);
                this.scene.add(root);

                this.peerMeshes[id] = { root, head, lHand, rHand };
            }

            const mesh = this.peerMeshes[id];
            if (pData.hP) {
                mesh.head.position.copy(pData.hP);
                mesh.head.quaternion.copy(pData.hR);
            }
            if (pData.lP) {
                mesh.lHand.position.copy(pData.lP);
                mesh.lHand.quaternion.copy(pData.lR);
            }
            if (pData.rP) {
                mesh.rHand.position.copy(pData.rP);
                mesh.rHand.quaternion.copy(pData.rR);
            }
        }
    }
}