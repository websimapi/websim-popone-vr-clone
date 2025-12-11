import * as THREE from 'three';

export class PlayerPhysics {
    constructor(rig, world, audio) {
        this.rig = rig;
        this.world = world;
        this.audio = audio;
        
        // Physics State
        this.velocity = new THREE.Vector3();
        this.gravity = -9.8;
        this.isClimbing = false;
        this.climbHand = null; // 'left' or 'right'
        this.climbAnchor = new THREE.Vector3(); 
        this.climbVelocity = new THREE.Vector3();
        this.previousHandPos = new THREE.Vector3();

        this.lastHaptic = { left: 0, right: 0 };
        this.turnSnapCooldown = false;
    }

    update(dt) {
        this.handleMovement(dt);
        this.handleHandCollision(dt);
    }

    getHandCollision(handPos) {
        let totalEjection = new THREE.Vector3();
        let hitCount = 0;
        const handRadius = 0.06; // 6cm visual radius

        for (let obj of this.world.colliders) {
            // Safety check for bounding box
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();

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
        const c = this.rig.controllers[side];
        c.grip = true;
        
        const handPos = new THREE.Vector3();
        c.object.getWorldPosition(handPos);

        if (this.canClimbAt(handPos)) {
            this.isClimbing = true;
            this.climbHand = side;
            this.velocity.set(0,0,0);
            
            // Anchor Logic: Lock this world point
            this.climbAnchor = handPos.clone();
            this.previousHandPos = handPos.clone();
            
            this.climbVelocity = new THREE.Vector3();
            this.audio.play('climb');
            this.triggerHaptic(side, 1.0, 10);
        }
    }

    onGripEnd(side) {
        this.rig.fixControllerTracking();
        this.rig.controllers[side].grip = false;
        
        if (this.climbHand === side) {
            // Hand-over-hand logic: switch to other hand if gripping
            const otherSide = side === 'left' ? 'right' : 'left';
            if (this.rig.controllers[otherSide].grip) {
                 const handPos = new THREE.Vector3();
                 this.rig.controllers[otherSide].object.getWorldPosition(handPos);
                 // More forgiving check (0.5m) to prevent dropping during swap
                 if (this.canClimbAt(handPos, 0.5)) {
                     this.climbHand = otherSide;
                     this.climbAnchor = handPos.clone(); // New anchor
                     this.previousHandPos = handPos.clone();
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
        const gamepad = this.rig.controllers[side].gamepad;
        if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators[0]) {
            gamepad.hapticActuators[0].pulse(strength, duration);
        }
    }

    handleMovement(dt) {
        // 1. Climbing Logic
        if (this.isClimbing && this.climbHand) {
            const controller = this.rig.controllers[this.climbHand].object;
            
            // Anchor Logic: Move Body to keep Hand at Anchor
            const handLocal = controller.position.clone();
            const handWorldOffset = handLocal.applyQuaternion(this.rig.userGroup.quaternion);
            const targetBodyPos = this.climbAnchor.clone().sub(handWorldOffset);

            const moveDelta = targetBodyPos.clone().sub(this.rig.userGroup.position);
            const instVel = moveDelta.divideScalar(dt || 0.011);
            
            if (!this.climbVelocity) this.climbVelocity = instVel;
            this.climbVelocity.lerp(instVel, 0.5);

            this.rig.userGroup.position.copy(targetBodyPos);
            this.velocity.set(0,0,0);
            return; 
        }

        // 2. Gliding & Gesture Movement
        let isGliding = false;
        const headPos = new THREE.Vector3();
        const headQuat = new THREE.Quaternion();
        this.rig.camera.getWorldPosition(headPos);
        this.rig.camera.getWorldQuaternion(headQuat);
        
        const headDir = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
        const headRight = new THREE.Vector3(1, 0, 0).applyQuaternion(headQuat);

        // Check Gliding
        const lPos = new THREE.Vector3(); this.rig.controller1.getWorldPosition(lPos);
        const rPos = new THREE.Vector3(); this.rig.controller2.getWorldPosition(rPos);
        
        const lRel = lPos.clone().sub(headPos);
        const rRel = rPos.clone().sub(headPos);
        
        if (lRel.dot(headRight) < -0.3 && rRel.dot(headRight) > 0.3) {
            isGliding = true;
        }

        // Input Calculation
        const inputVec = new THREE.Vector3();
        let speed = 6.0;

        // A. Joystick
        const leftStick = this.rig.controllers.left.gamepad;
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
            
            const curFeet = this.rig.userGroup.position.clone();
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
                 this.rig.userGroup.position.add(inputVec);
            }
        }

        // 3. Rotation (Right Stick)
        const rightStick = this.rig.controllers.right.gamepad;
        if (rightStick && rightStick.axes.length >= 4) {
            const rx = rightStick.axes[2];
            if (Math.abs(rx) > 0.5 && !this.turnSnapCooldown) {
                this.rig.userGroup.rotation.y -= Math.sign(rx) * Math.PI / 4;
                this.turnSnapCooldown = true;
                setTimeout(() => this.turnSnapCooldown = false, 400);
            }
        }

        // 4. Physics
        const feetPos = this.rig.userGroup.position.clone();
        
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
            this.rig.userGroup.position.y = groundY;
            this.velocity.y = 0;
        } else {
            // Airborne
            if (isGliding && this.velocity.y < 0) {
                // Gliding Physics
                this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, -2.0, dt * 2); // Terminal velocity for gliding
                const forward = headDir.clone().setY(0).normalize();
                this.rig.userGroup.position.addScaledVector(forward, 12 * dt); // Fast glide speed
            } else {
                this.velocity.y += this.gravity * dt;
            }
            
            // Apply Velocity (Continuous floor check)
            const deltaY = this.velocity.y * dt;
            if (feetPos.y + deltaY < groundY) {
                this.rig.userGroup.position.y = groundY;
                this.velocity.y = 0;
            } else {
                this.rig.userGroup.position.y += deltaY;
            }
        }
    }

    handleHandCollision(dt) {
        if (this.isClimbing) return;

        ['left', 'right'].forEach(side => {
            const controller = this.rig.controllers[side].object;
            const handPos = new THREE.Vector3();
            controller.getWorldPosition(handPos);

            const ejection = this.getHandCollision(handPos);
            if (ejection) {
                this.rig.userGroup.position.add(ejection);
                
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
}

