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
        this.userGroup = new THREE.Group(); 
        this.userGroup.position.set(0, 305, 0); 
        this.scene.add(this.userGroup);
        this.userGroup.add(this.camera);

        // Controllers & Hands
        this.controller1 = this.renderer.xr.getController(0);
        this.controller2 = this.renderer.xr.getController(1);
        this.userGroup.add(this.controller1);
        this.userGroup.add(this.controller2);

        const controllerModelFactory = new XRControllerModelFactory();
        const handModelFactory = new XRHandModelFactory();

        this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.userGroup.add(this.controllerGrip1);

        this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
        this.userGroup.add(this.controllerGrip2);

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
        this.climbHand = null; 
        
        // Hand Physics
        this.handRadius = 0.05;
        this.previousHandPos = { left: new THREE.Vector3(), right: new THREE.Vector3() };

        // Input State
        this.controllers = {
            left: { gamepad: null, object: this.controller1, grip: false },
            right: { gamepad: null, object: this.controller2, grip: false }
        };

        // Listeners for state tracking
        this.controller1.addEventListener('squeezestart', () => { this.controllers.left.grip = true; });
        this.controller1.addEventListener('squeezeend', () => { this.controllers.left.grip = false; });
        this.controller2.addEventListener('squeezestart', () => { this.controllers.right.grip = true; });
        this.controller2.addEventListener('squeezeend', () => { this.controllers.right.grip = false; });

        this.peerMeshes = {};
    }



    update(dt) {
        this.updateControllers();
        
        // 1. Hands (Climbing & Vaulting)
        // Returns displacement vector to apply to player
        const handDisp = this.handleHandPhysics(dt);
        
        // 2. Turning (Right Stick)
        this.handleTurning();

        if (this.isClimbing) {
            this.velocity.set(0,0,0);
            // Apply hand movement directly
            if (handDisp) this.userGroup.position.add(handDisp);
            
        } else {
            // 3. Movement (Left Stick)
            // Only if not climbing
            const moveDisp = this.handleStickMovement(dt);
            this.userGroup.position.add(moveDisp);
            
            // 4. Gravity & Ground
            // If vaulting (handDisp has Y component > 0), kill gravity
            if (handDisp && handDisp.y > 0) {
                this.velocity.y = 0;
            }
            
            if (handDisp) this.userGroup.position.add(handDisp);
            
            this.handleGravity(dt);
        }

        // Bounds reset
        if (this.userGroup.position.y < -100) {
             this.userGroup.position.set(0, 305, 0);
             this.velocity.set(0,0,0);
        }

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

    handleHandPhysics(dt) {
        const hands = [
            { side: 'left', controller: this.controller1, grip: this.controllers.left.grip },
            { side: 'right', controller: this.controller2, grip: this.controllers.right.grip }
        ];

        let totalDisp = new THREE.Vector3();
        let currentlyClimbing = false;
        
        // Initialize prev pos if missing
        if (!this.previousHandPos.left) this.controller1.getWorldPosition(this.previousHandPos.left);
        if (!this.previousHandPos.right) this.controller2.getWorldPosition(this.previousHandPos.right);

        for (const h of hands) {
            const currentPos = new THREE.Vector3();
            h.controller.getWorldPosition(currentPos);
            
            if (h.grip) {
                // --- CLIMBING ---
                // Check if we can start climbing
                if (this.climbHand !== h.side && this.checkCollision(currentPos, 0.1)) {
                     this.climbHand = h.side;
                     this.audio.play('climb');
                }

                if (this.climbHand === h.side) {
                    currentlyClimbing = true;
                    // Move player to counteract hand movement
                    // Delta since last frame (in world space)
                    const delta = currentPos.clone().sub(this.previousHandPos[h.side]);
                    totalDisp.sub(delta);
                }
            } else {
                // --- VAULTING / COLLISION ---
                if (this.climbHand === h.side) {
                    this.climbHand = null; // Release
                }

                // Push against walls/floors
                const push = this.getDepenetration(currentPos);
                if (push.lengthSq() > 0) {
                     totalDisp.add(push);
                }
            }
            
            this.previousHandPos[h.side].copy(currentPos);
        }

        this.isClimbing = currentlyClimbing;
        return totalDisp;
    }

    getDepenetration(pos) {
        const radius = this.handRadius;
        const push = new THREE.Vector3();
        
        for(const obj of this.world.colliders) {
             const box = new THREE.Box3().setFromObject(obj); 
             
             // Check if inside or close
             const closest = new THREE.Vector3().copy(pos).clamp(box.min, box.max);
             const dist = pos.distanceTo(closest);
             
             if (dist < radius) {
                 // Collision
                 let pen = radius - dist;
                 let dir = new THREE.Vector3();
                 
                 if (dist < 0.0001) {
                     // Inside - find closest face to push out
                     const dx1 = Math.abs(pos.x - box.min.x), dx2 = Math.abs(box.max.x - pos.x);
                     const dy1 = Math.abs(pos.y - box.min.y), dy2 = Math.abs(box.max.y - pos.y);
                     const dz1 = Math.abs(pos.z - box.min.z), dz2 = Math.abs(box.max.z - pos.z);
                     const min = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);
                     
                     if (min === dy2) dir.set(0, 1, 0); // Top
                     else if (min === dy1) dir.set(0, -1, 0);
                     else if (min === dx1) dir.set(-1, 0, 0);
                     else if (min === dx2) dir.set(1, 0, 0);
                     else if (min === dz1) dir.set(0, 0, -1);
                     else if (min === dz2) dir.set(0, 0, 1);
                     
                     pen = 0.05; // Force push
                 } else {
                     dir.subVectors(pos, closest).normalize();
                 }
                 
                 push.add(dir.multiplyScalar(pen));
             }
        }
        return push;
    }

    checkCollision(pos, rad) {
        // Simple overlap check
        for(const obj of this.world.colliders) {
             const box = new THREE.Box3().setFromObject(obj);
             const closest = new THREE.Vector3().copy(pos).clamp(box.min, box.max);
             if (pos.distanceTo(closest) < rad) return true;
        }
        return false;
    }

    handleTurning() {
        const rightStick = this.controllers.right.gamepad;
        if (rightStick && rightStick.axes.length >= 4) {
            const rx = rightStick.axes[2];
            if (Math.abs(rx) > 0.5 && !this.turnSnapCooldown) {
                this.userGroup.rotation.y -= Math.sign(rx) * Math.PI / 4;
                this.turnSnapCooldown = true;
                setTimeout(() => this.turnSnapCooldown = false, 400);
            }
        }
    }

    handleStickMovement(dt) {
        const leftStick = this.controllers.left.gamepad;
        const disp = new THREE.Vector3();
        if (leftStick && leftStick.axes.length >= 4) {
            const dx = leftStick.axes[2];
            const dy = leftStick.axes[3];
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                const headQuat = new THREE.Quaternion();
                this.camera.getWorldQuaternion(headQuat);
                const headDir = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
                const flatHead = headDir.clone().setY(0).normalize();
                const flatSide = new THREE.Vector3(-flatHead.z, 0, flatHead.x);
                
                const input = new THREE.Vector3()
                    .add(flatHead.multiplyScalar(-dy))
                    .add(flatSide.multiplyScalar(dx));
                
                disp.copy(input.multiplyScalar(6.0 * dt));
            }
        }
        return disp;
    }

    handleGravity(dt) {
        // T-Pose Glide Check
        const headPos = new THREE.Vector3(); this.camera.getWorldPosition(headPos);
        const lPos = new THREE.Vector3(); this.controller1.getWorldPosition(lPos);
        const rPos = new THREE.Vector3(); this.controller2.getWorldPosition(rPos);
        const headQuat = new THREE.Quaternion(); this.camera.getWorldQuaternion(headQuat);
        const headRight = new THREE.Vector3(1, 0, 0).applyQuaternion(headQuat);
        
        // Arms out check
        const lRel = lPos.clone().sub(headPos).applyQuaternion(headQuat.clone().invert());
        const rRel = rPos.clone().sub(headPos).applyQuaternion(headQuat.clone().invert());
        let isGliding = (lRel.x < -0.3 && rRel.x > 0.3);

        const feetPos = this.userGroup.position.clone();
        
        // Ground Check
        const rayOrigin = feetPos.clone().add(new THREE.Vector3(0, 1.0, 0)); 
        const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObjects(this.world.colliders);
        
        let groundY = -Infinity;
        if (intersects.length > 0) {
            for(const hit of intersects) {
                if (hit.point.y < rayOrigin.y + 0.1) { // Tolerance
                    groundY = hit.point.y;
                    break;
                }
            }
        }

        if (feetPos.y <= groundY + 0.05 && this.velocity.y <= 0) {
            this.userGroup.position.y = groundY;
            this.velocity.y = 0;
        } else {
             if (isGliding && this.velocity.y < 0) {
                 this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -2.0, dt * 2);
                 // Gliding forward propulsion
                 const forward = new THREE.Vector3(0,0,-1).applyQuaternion(headQuat).setY(0).normalize();
                 this.userGroup.position.add(forward.multiplyScalar(10 * dt));
             } else {
                 this.velocity.y += this.gravity * dt;
             }
             this.userGroup.position.y += this.velocity.y * dt;
             
             // Floor safety check
             if (this.userGroup.position.y < groundY) {
                 this.userGroup.position.y = groundY;
                 this.velocity.y = 0;
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