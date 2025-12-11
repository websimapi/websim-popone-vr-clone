handleHandCollision(dt) {
    // If climbing, we trust the grip logic anchor. 
    // But we might want collision on the OTHER hand or body? 
    // For now, simplify: if not climbing, allow hand pushing.
    if (this.isClimbing) return;

    ['left', 'right'].forEach(side => {
        const controller = this.controllers[side].object;
        const handPos = new THREE.Vector3();
        controller.getWorldPosition(handPos);

        // Tip offset (controllers are usually at wrist/palm center)
        // We want to check knuckles/fingers for "pushing"
        // Let's assume handPos is close enough for now

        const ejection = this.getHandCollision(handPos);
        if (ejection) {
            // Apply ejection to player body
            // This creates the "push off" effect
            // Soften it slightly to avoid jitter, but needs to be firm for walls
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