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
            const controller = this.controllers[this.climbHand].object;
            const currentHandPos = new THREE.Vector3();
            controller.getWorldPosition(currentHandPos);
            
            // Calculate delta: How much did the hand move?
            const delta = currentHandPos.clone().sub(this.previousHandPos);
            
            // Move Player Group OPPOSITE to hand movement
            this.userGroup.position.sub(delta);
            
            // Update previous for next frame
            // Note: We need to re-read world pos because we just moved the parent group
            controller.getWorldPosition(this.previousHandPos);
            
            return; // Skip walking/gravity logic
        }

        // 2. Walking / Flying Logic
        let speed = 5.0;
        const leftStick = this.controllers.left.gamepad;
        
        if (leftStick && leftStick.axes.length >= 4) {
            // Axes: 2=x, 3=y usually
            const dx = leftStick.axes[2];
            const dy = leftStick.axes[3];
            
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                // Move relative to headset direction
                const headDir = new THREE.Vector3();
                this.camera.getWorldDirection(headDir);
                headDir.y = 0;
                headDir.normalize();
                
                const sideDir = new THREE.Vector3(-headDir.z, 0, headDir.x);
                
                const moveVec = headDir.multiplyScalar(-dy).add(sideDir.multiplyScalar(dx));
                this.userGroup.position.addScaledVector(moveVec, speed * dt);
            }
        }

        // 3. Rotation (Snap turn on right stick)
        const rightStick = this.controllers.right.gamepad;
        if (rightStick && rightStick.axes.length >= 4) {
            const rx = rightStick.axes[2];
            if (Math.abs(rx) > 0.5 && !this.turnSnapCooldown) {
                this.userGroup.rotation.y -= Math.sign(rx) * Math.PI / 4;
                this.turnSnapCooldown = true;
                setTimeout(() => this.turnSnapCooldown = false, 400);
            }
        }

        // 4. Gravity
        // Simple floor check
        const feetPos = this.userGroup.position.clone();
        
        // Raycast down to find ground
        const raycaster = new THREE.Raycaster(feetPos.clone().add(new THREE.Vector3(0,1,0)), new THREE.Vector3(0,-1,0));
        const intersects = raycaster.intersectObjects(this.world.colliders);
        
        let onGround = false;
        let groundY = -1000;

        if (intersects.length > 0) {
            // Find highest point below us
            groundY = intersects[0].point.y;
            if (feetPos.y <= groundY + 0.1 && this.velocity.y <= 0) {
                onGround = true;
                this.userGroup.position.y = groundY;
                this.velocity.y = 0;
            }
        }

        if (!onGround) {
            this.velocity.y += this.gravity * dt;
            this.userGroup.position.addScaledVector(this.velocity, dt);
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