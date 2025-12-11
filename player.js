import * as THREE from 'three';
import { PlayerRig } from './player-rig.js';
import { PeerManager } from './peer-manager.js';
import { Dashboard } from './dashboard.js';

export class Player {
    constructor(scene, renderer, camera, world, network, audio) {
        this.world = world;
        this.network = network;
        this.audio = audio;

        // Initialize Rig (UserGroup, Controllers, Hands, Camera parent)
        this.rig = new PlayerRig(scene, renderer, camera);
        
        // Map rig properties for compatibility with existing logic
        this.userGroup = this.rig.userGroup;
        this.camera = this.rig.camera;
        this.controller1 = this.rig.controller1;
        this.controller2 = this.rig.controller2;
        this.controllers = this.rig.controllers;

        // Initialize Peer Manager
        this.peerManager = new PeerManager(scene);

        // Dashboard
        this.dashboard = new Dashboard(scene, renderer, camera);

        // Physics State
        this.velocity = new THREE.Vector3();
        this.gravity = -9.8;
        this.isClimbing = false;
        this.climbHand = null; // 'left' or 'right'
        this.climbAnchor = new THREE.Vector3(); // World pos where we grabbed
        this.climbOffset = new THREE.Vector3(); // Offset from hand to anchor

        // Event Listeners (Attaching to rig controllers)
        this.controller1.addEventListener('squeezestart', () => this.onGripStart('left'));
        this.controller1.addEventListener('squeezeend', () => this.onGripEnd('left'));
        this.controller1.addEventListener('selectstart', () => this.onGripStart('left'));
        this.controller1.addEventListener('selectend', () => this.onGripEnd('left'));
        
        this.controller2.addEventListener('squeezestart', () => this.onGripStart('right'));
        this.controller2.addEventListener('squeezeend', () => this.onGripEnd('right'));
        this.controller2.addEventListener('selectstart', () => this.onGripStart('right'));
        this.controller2.addEventListener('selectend', () => this.onGripEnd('right'));

        // Haptics cache
        this.lastHaptic = { left: 0, right: 0 };
        
        // Clap state
        this.handsTogether = false;
        this.lastClapTime = 0;
    }

    // Physics helper: Get ejection vector for a point vs box colliders
    getHandCollision(handPos) {
        let totalEjection = new THREE.Vector3();
        let hitCount = 0;
        const handRadius = 0.06; // 6cm visual radius

        for (let obj of this.world.colliders) {
            const box = new THREE.Box3().setFromObject(obj);
            
            // Expand box bounds by hand radius for the check
            const min = box.min.clone().subScalar(handRadius);
            const max = box.max.clone().addScalar(handRadius);

            if (handPos.x > min.x && handPos.x < max.x &&
                handPos.y > min.y && handPos.y < max.y &&
                handPos.z > min.z && handPos.z < max.z) {
                
                // Find shallowest penetration into the EXPANDED box
                const dx1 = handPos.x - min.x;
                const dx2 = max.x - handPos.x;
                const dy1 = handPos.y - min.y;
                const dy2 = max.y - handPos.y;
                const dz1 = handPos.z - min.z;
                const dz2 = max.z - handPos.z;

                const minOverlap = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);
                
                const ejection = new THREE.Vector3();
                // Push away from the center of collision
                if (Math.abs(minOverlap - dx1) < 0.001) ejection.x = -dx1;
                else if (Math.abs(minOverlap - dx2) < 0.001) ejection.x = dx2;
                else if (Math.abs(minOverlap - dy1) < 0.001) ejection.y = -dy1;
                else if (Math.abs(minOverlap - dy2) < 0.001) ejection.y = dy2;
                else if (Math.abs(minOverlap - dz1) < 0.001) ejection.z = -dz1;
                else if (Math.abs(minOverlap - dz2) < 0.001) ejection.z = dz2;

                totalEjection.add(ejection);
                hitCount++;
            }
        }
        return hitCount > 0 ? totalEjection : null;
    }

    onGripStart(side) {
        this.rig.fixControllerTracking();
        const c = this.controllers[side];
        c.grip = true;
        
        const handPos = new THREE.Vector3();
        c.object.getWorldPosition(handPos);

        if (this.canClimbAt(handPos)) {
            this.isClimbing = true;
            this.climbHand = side;
            this.velocity.set(0,0,0);
            
            // Anchor Logic: Lock this world point
            this.climbAnchor = handPos.clone();
            
            this.climbVelocity = new THREE.Vector3();
            this.audio.play('climb');
            this.triggerHaptic(side, 1.0, 10);
        }
    }

    onGripEnd(side) {
        this.rig.fixControllerTracking();
        this.controllers[side].grip = false;
        
        if (this.climbHand === side) {
            // Hand-over-hand logic: switch to other hand if gripping
            const otherSide = side === 'left' ? 'right' : 'left';
            if (this.controllers[otherSide].grip) {
                 const handPos = new THREE.Vector3();
                 this.controllers[otherSide].object.getWorldPosition(handPos);
                 // More forgiving check (0.5m) to prevent dropping during swap
                 if (this.canClimbAt(handPos, 0.5)) {
                     this.climbHand = otherSide;
                     this.climbAnchor = handPos.clone(); // New anchor
                     this.climbVelocity = new THREE.Vector3();
                     return;
                 }
            }

            // Release
            this.isClimbing = false;
            this.climbHand = null;
            
            // Fling mechanic: Throw player based on body velocity
            if (this.climbVelocity) {
                // Use calculated body velocity directly
                this.velocity.copy(this.climbVelocity);
                this.velocity.clampLength(0, 15); // Cap speed
                
                // Add upward boost if flinging up (vault assist)
                if (this.velocity.y > 0) this.velocity.y += 2.0;
            } else {
                this.velocity.y = 2;
            }
        }
    }

    canClimbAt(pos, radius = 0.25) {
        // Slightly larger radius for detection to feel forgiving
        const sphere = new THREE.Sphere(pos, radius);
        for (let obj of this.world.colliders) {
            if(!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            const box = new THREE.Box3().setFromObject(obj);
            if (box.intersectsSphere(sphere)) return true;
        }
        return false;
    }
    
    triggerHaptic(side, strength, duration) {
        const gamepad = this.controllers[side].gamepad;
        if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators[0]) {
            gamepad.hapticActuators[0].pulse(strength, duration);
        }
    }

    update(dt) {
        // // removed updateControllers() - handled in Rig
        // // removed fixControllerTracking() - handled in Rig
        this.rig.update();
        
        this.handleMovement(dt);
        this.handleClap();
        this.handleHandCollision(dt);
        this.syncNetwork();
        
        this.dashboard.update(this.controllers);
        
        // // removed updatePeers() - delegated to PeerManager
        this.peerManager.update(this.network.peers, this.network.myId);
    }

    handleClap() {
        const lPos = new THREE.Vector3(); 
        this.controller1.getWorldPosition(lPos);
        const rPos = new THREE.Vector3(); 
        this.controller2.getWorldPosition(rPos);
        
        const dist = lPos.distanceTo(rPos);
        
        // Clap detection logic
        if (dist < 0.15) {
            if (!this.handsTogether) {
                this.handsTogether = true;
                const now = Date.now();
                // Check double clap
                if (now - this.lastClapTime < 800) {
                    this.dashboard.toggle();
                    this.lastClapTime = 0; // Reset so triple clap doesn't toggle again immediately
                    this.triggerHaptic('left', 0.5, 50);
                    this.triggerHaptic('right', 0.5, 50);
                } else {
                    this.lastClapTime = now;
                }
            }
        } else if (dist > 0.25) {
            this.handsTogether = false;
        }
    }

    // // removed updateControllers() - moved to PlayerRig

    handleMovement(dt) {
        // 1. Climbing Logic
        if (this.isClimbing && this.climbHand) {
            const controller = this.controllers[this.climbHand].object;
            
            // Anchor Logic: Move Body to keep Hand at Anchor
            // We calculate where the userGroup MUST be so that the hand (local offset) 
            // ends up at the climbAnchor (world position).
            
            const handLocal = controller.position.clone();
            // Rotate local hand offset by player rotation
            const handWorldOffset = handLocal.applyQuaternion(this.userGroup.quaternion);
            
            // Target body position = Anchor - HandOffset
            const targetBodyPos = this.climbAnchor.clone().sub(handWorldOffset);

            // Calculate velocity (Position delta / dt) for fling physics
            const moveDelta = targetBodyPos.clone().sub(this.userGroup.position);
            const instVel = moveDelta.divideScalar(dt || 0.011);
            
            if (!this.climbVelocity) this.climbVelocity = instVel;
            this.climbVelocity.lerp(instVel, 0.5);

            this.userGroup.position.copy(targetBodyPos);
            
            // Zero physics
            this.velocity.set(0,0,0);

            // Movement controls disabled while climbing
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

    handleHandCollision(dt) {
        // If climbing, we trust the grip logic anchor. 
        // Collision push is for when NOT holding grip (mantling/pushing).
        if (this.isClimbing) return;

        ['left', 'right'].forEach(side => {
            const controller = this.controllers[side].object;
            const handPos = new THREE.Vector3();
            controller.getWorldPosition(handPos);

            const ejection = this.getHandCollision(handPos);
            if (ejection) {
                // Apply ejection to player body
                // This creates the "push off" effect: 
                // Hand enters wall -> Body moves away so Hand is at surface
                this.userGroup.position.add(ejection);
                
                // Haptic feedback for touching wall
                const now = Date.now();
                if (now - this.lastHaptic[side] > 100) {
                    this.triggerHaptic(side, 0.5, 5);
                    this.lastHaptic[side] = now;
                }
                
                // If we are pushing down (ejection is Up), kill downward velocity
                if (ejection.y > 0 && this.velocity.y < 0) {
                    this.velocity.y = 0;
                }
            }
        });
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

    // // removed updatePeers() - moved to PeerManager
}