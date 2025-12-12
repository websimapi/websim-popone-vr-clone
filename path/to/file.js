// Haptics cache
this.lastHaptic = { left: 0, right: 0 };
this.turnSnapCooldown = false;
this.lastMovementTime = 0;

// Physics helper: Get ejection vector for a point vs box colliders
getHandCollision(handPos) {
    let totalEjection = new THREE.Vector3();
    let hitCount = 0;

    for (let obj of this.world.colliders) {
        // Ensure bounds are up to date
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox(); // Double check

        // Transform point to local space of object for AABB check
        // (Assuming non-rotated or only y-rotated boxes for simplicity, 
        // but for full robustness we should map point to local)
        // Simpler: Use Box3.setFromObject(obj) which gives World AABB.
        // Note: This approximates rotated boxes as larger AABBs. 
        // For this project (skyscraper walls are axis aligned), this is perfect.

        const box = new THREE.Box3().setFromObject(obj);

        if (box.containsPoint(handPos)) {
            // Find shallowest penetration
            const min = box.min;
            const max = box.max;
            const p = handPos;

            const dx1 = p.x - min.x;
            const dx2 = max.x - p.x;
            const dy1 = p.y - min.y;
            const dy2 = max.y - p.y;
            const dz1 = p.z - min.z;
            const dz2 = max.z - p.z;

            // Find min dimension
            const minOverlap = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);

            const ejection = new THREE.Vector3();
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
    const c = this.controllers[side];
    c.grip = true;

    const handPos = new THREE.Vector3();
    c.object.getWorldPosition(handPos);

    // Check if close enough to climb (using expanded range for better feel)
    if (this.canClimbAt(handPos)) {
        this.isClimbing = true;
        this.climbHand = side;
        this.velocity.set(0,0,0);
        this.previousHandPos = handPos.clone();
        this.climbVelocity = new THREE.Vector3();
        this.audio.play('climb');
        this.triggerHaptic(side, 1.0, 10);
    }
}

onGripEnd(side) {
    this.controllers[side].grip = false;

    if (this.climbHand === side) {
        // Hand-over-hand logic: switch to other hand if gripping
        const otherSide = side === 'left' ? 'right' : 'left';
        if (this.controllers[otherSide].grip) {
             const handPos = new THREE.Vector3();
             this.controllers[otherSide].object.getWorldPosition(handPos);
             if (this.canClimbAt(handPos)) {
                 this.climbHand = otherSide;
                 this.previousHandPos = handPos.clone();
                 this.climbVelocity = new THREE.Vector3();
                 return;
             }
        }

        // Release
        this.isClimbing = false;
        this.climbHand = null;

        // Fling mechanic: Throw player based on hand velocity
        if (this.climbVelocity) {
            // Invert delta because pulling hand down throws player up
            this.velocity.copy(this.climbVelocity).multiplyScalar(-1.5);
            this.velocity.clampLength(0, 15); // Cap speed

            // Add upward boost if flinging up (vault assist)
            if (this.velocity.y > 0) this.velocity.y += 2.0;
        } else {
            this.velocity.y = 2;
        }
    }
}

canClimbAt(pos) {
    // Slightly larger radius for detection to feel forgiving
    const sphere = new THREE.Sphere(pos, 0.25);
    for (let obj of this.world.colliders) {
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
    this.updateControllers();
    this.handleMovement(dt);
    this.handleHandCollision(dt);
    this.syncNetwork();
    this.updatePeers();
}