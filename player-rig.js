import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class PlayerRig {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;

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

        // Input State Container
        this.controllers = {
            left: { gamepad: null, object: this.controller1, grip: false, trigger: false, hand: this.hand1 },
            right: { gamepad: null, object: this.controller2, grip: false, trigger: false, hand: this.hand2 }
        };

        // Tracking stability
        this.lastValidController = {
            left: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), valid: false },
            right: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), valid: false }
        };
    }

    update() {
        this.updateGamepads();
        this.fixControllerTracking();
    }

    updateGamepads() {
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

    // Fix tracking glitches (zeros or massive jumps)
    fixControllerTracking() {
        ['left', 'right'].forEach(side => {
            const controller = this.controllers[side].object;
            const state = this.lastValidController[side];
            
            const isZero = controller.position.lengthSq() < 0.000001;
            let isGlitch = false;
            
            if (state.valid && !isZero) {
                // If jumped > 0.5m in one frame, ignore
                if (controller.position.distanceTo(state.pos) > 0.5) isGlitch = true;
            }

            if (isZero || isGlitch) {
                if (state.valid) {
                    controller.position.copy(state.pos);
                    controller.quaternion.copy(state.quat);
                }
            } else {
                state.pos.copy(controller.position);
                state.quat.copy(controller.quaternion);
                state.valid = true;
            }
        });
    }
}