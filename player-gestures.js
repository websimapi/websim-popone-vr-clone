import * as THREE from 'three';

export class PlayerGestures {
    constructor(rig, dashboard) {
        this.rig = rig;
        this.dashboard = dashboard;
        this.state = 'IDLE'; // IDLE, TOUCHING, EXPANDING, OPEN, COOLDOWN
        this.lastHaptic = { left: 0, right: 0 };
    }

    update() {
        this.handleDashboardGesture();
    }

    handleDashboardGesture() {
        // Use World coordinates for robust positioning regardless of player rotation/movement
        const headPos = new THREE.Vector3();
        this.rig.camera.getWorldPosition(headPos);
        const headRot = new THREE.Quaternion();
        this.rig.camera.getWorldQuaternion(headRot);
        const headDir = new THREE.Vector3(0, 0, -1).applyQuaternion(headRot);

        const lPos = new THREE.Vector3(); 
        this.rig.controller1.getWorldPosition(lPos);
        const rPos = new THREE.Vector3(); 
        this.rig.controller2.getWorldPosition(rPos);
        
        const dist = lPos.distanceTo(rPos);
        const midPoint = lPos.clone().add(rPos).multiplyScalar(0.5);
        const toHands = midPoint.clone().sub(headPos).normalize();
        
        // Thresholds
        const TOUCH_DIST = 0.12; 
        const RESET_DIST = 0.25; // Distance to reset COOLDOWN
        const OPEN_DIST = 0.50; 
        
        if (this.state === 'IDLE') {
            if (dist < TOUCH_DIST) {
                // Only activate if hands are roughly in front of the user
                if (toHands.dot(headDir) > 0.5) {
                    this.state = 'TOUCHING';
                    this.dashboard.updatePosition(midPoint, headPos);
                    this.triggerHaptic('left', 0.1, 10);
                    this.triggerHaptic('right', 0.1, 10);
                }
            }
        }
        else if (this.state === 'TOUCHING') {
            this.dashboard.updatePosition(midPoint, headPos);

            if (dist > TOUCH_DIST) {
                // Start expanding
                this.state = 'EXPANDING';
            }
        }
        else if (this.state === 'EXPANDING') {
            const progress = (dist - TOUCH_DIST) / (OPEN_DIST - TOUCH_DIST);
            
            this.dashboard.updatePosition(midPoint, headPos);

            if (progress >= 1.0) {
                this.dashboard.show(1.0);
                this.state = 'OPEN';
                this.triggerHaptic('left', 0.5, 20);
                this.triggerHaptic('right', 0.5, 20);
            } else if (progress <= 0) {
                this.dashboard.hide();
                this.state = 'TOUCHING';
            } else {
                this.dashboard.show(progress);
            }
        }
        else if (this.state === 'OPEN') {
            // HUD Mode: Follow head, placed in front
            const targetPos = headPos.clone().add(headDir.clone().multiplyScalar(0.6));
            targetPos.y -= 0.15;

            // Lerp current world position
            const currentPos = new THREE.Vector3();
            this.dashboard.group.getWorldPosition(currentPos);
            
            if (currentPos.distanceTo(targetPos) > 1.0) {
                currentPos.copy(targetPos);
            } else {
                currentPos.lerp(targetPos, 0.15);
            }

            this.dashboard.updatePosition(currentPos, headPos);

            if (dist < TOUCH_DIST) {
                // Close Menu
                this.dashboard.hide();
                this.state = 'COOLDOWN'; // Wait for separation
                this.triggerHaptic('left', 0.2, 50);
                this.triggerHaptic('right', 0.2, 50);
            }
        }
        else if (this.state === 'COOLDOWN') {
            // User must separate hands to reset logic
            if (dist > RESET_DIST) {
                this.state = 'IDLE';
            }
        }
    }

    triggerHaptic(side, strength, duration) {
        const gamepad = this.rig.controllers[side].gamepad;
        if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators[0]) {
            gamepad.hapticActuators[0].pulse(strength, duration);
        }
    }
}

