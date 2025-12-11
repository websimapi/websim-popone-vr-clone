import * as THREE from 'three';
import { PlayerRig } from './player-rig.js';
import { PeerManager } from './peer-manager.js';
import { Dashboard } from './dashboard.js';
import { PlayerPhysics } from './player-physics.js';
import { PlayerGestures } from './player-gestures.js';

export class Player {
    constructor(scene, renderer, camera, world, network, audio) {
        this.world = world;
        this.network = network;
        this.audio = audio;

        // Initialize Rig (UserGroup, Controllers, Hands, Camera parent)
        this.rig = new PlayerRig(scene, renderer, camera);
        
        // Initialize Peer Manager
        this.peerManager = new PeerManager(scene);

        // Dashboard
        this.dashboard = new Dashboard(scene, renderer, camera, audio);
        this.rig.userGroup.add(this.dashboard.group);

        // Physics Subsystem
        this.physics = new PlayerPhysics(this.rig, world, audio);

        // Gesture Subsystem
        this.gestures = new PlayerGestures(this.rig, this.dashboard);

        // Event Listeners (Attaching to rig controllers)
        this.rig.controller1.addEventListener('squeezestart', () => this.physics.onGripStart('left'));
        this.rig.controller1.addEventListener('squeezeend', () => this.physics.onGripEnd('left'));
        this.rig.controller1.addEventListener('selectstart', () => this.physics.onGripStart('left'));
        this.rig.controller1.addEventListener('selectend', () => this.physics.onGripEnd('left'));
        
        this.rig.controller2.addEventListener('squeezestart', () => this.physics.onGripStart('right'));
        this.rig.controller2.addEventListener('squeezeend', () => this.physics.onGripEnd('right'));
        this.rig.controller2.addEventListener('selectstart', () => this.physics.onGripStart('right'));
        this.rig.controller2.addEventListener('selectend', () => this.physics.onGripEnd('right'));
    }

    // Accessors for compatibility
    get userGroup() { return this.rig.userGroup; }
    get velocity() { return this.physics.velocity; }
    get camera() { return this.rig.camera; }

    // removed function getHandCollision() {}
    // removed function onGripStart() {}
    // removed function onGripEnd() {}
    // removed function canClimbAt() {}
    // removed function triggerHaptic() {}

    update(dt) {
        // removed updateControllers() - handled in Rig
        // removed fixControllerTracking() - handled in Rig
        
        this.rig.update();
        this.physics.update(dt); // Handles movement and collision
        this.gestures.update(); // Handles dashboard
        
        this.dashboard.update(this.rig.controllers);
        
        this.syncNetwork();
        this.peerManager.update(this.network.peers, this.network.myId);
    }

    // removed function handleDashboardGesture() {}
    // removed function handleMovement() {}
    // removed function handleHandCollision() {}

    syncNetwork() {
        if (!this.network.myId) return;

        const headPos = new THREE.Vector3();
        const headRot = new THREE.Quaternion();
        this.rig.camera.getWorldPosition(headPos);
        this.rig.camera.getWorldQuaternion(headRot);

        const lHandPos = new THREE.Vector3();
        const lHandRot = new THREE.Quaternion();
        this.rig.controller1.getWorldPosition(lHandPos);
        this.rig.controller1.getWorldQuaternion(lHandRot);

        const rHandPos = new THREE.Vector3();
        const rHandRot = new THREE.Quaternion();
        this.rig.controller2.getWorldPosition(rHandPos);
        this.rig.controller2.getWorldQuaternion(rHandRot);

        this.network.updatePlayer({
            hP: headPos, hR: headRot,
            lP: lHandPos, lR: lHandRot,
            rP: rHandPos, rR: rHandRot,
            color: this.myColor || (this.myColor = Math.random() * 0xffffff)
        });
    }

    // removed function updatePeers() {}
}

