import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { NetworkManager } from './network.js';
import { AudioManager } from './audio.js';

// Init
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x555555, 0.002);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.layers.enable(0); // Default layer
camera.layers.disable(2); // Layer 2 is for Replay Ghosts
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(100, 500, 100);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 200;
dirLight.shadow.camera.bottom = -200;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
scene.add(dirLight);

// Systems
const audio = new AudioManager();
const network = new NetworkManager();
const world = new World(scene);
let player;

// Setup
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.innerText = "INITIALIZING...";

    audio.resume();
    audio.play('wind', 0.2, true);
    
    if ('xr' in navigator) {
        try {
            const session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers', 'dom-overlay'],
                domOverlay: { root: document.body }
            });
            renderer.xr.setSession(session);
            
            // Hide overlay
            document.getElementById('overlay').style.display = 'none';

            session.addEventListener('end', () => {
                document.getElementById('overlay').style.display = 'flex';
                startBtn.disabled = false;
                startBtn.innerText = "ENTER VR";
                if (player) {
                    player.userGroup.position.set(0, 305, 0);
                    player.velocity.set(0,0,0);
                }
            });
        } catch (e) {
            console.error(e);
            startBtn.innerText = "VR ERROR (RETRY)";
            startBtn.disabled = false;
        }
    } else {
        startBtn.innerText = "WEBXR NOT SUPPORTED";
    }
});

// Loading
await world.loadAssets();
await Promise.all([
    audio.load('wind', 'wind.mp3'),
    audio.load('climb', 'climb.mp3'),
    audio.load('shoot', 'shoot.mp3')
]);

world.createLobby();
const pod = world.createPod();

player = new Player(scene, renderer, camera, world, network, audio);
window.player = player; // Expose for Remotion integration

// Network Logic
network.init((state) => {
    // Phase Management
    if (state.phase === 'flight') {
        // Move Pod
        pod.position.copy(state.podPosition);
        
        // If we are "in" the pod (distance check or just during this phase), pull us along
        // This is tricky in VR. Simple approach: Parent us to it? 
        // Or just teleport player to relative offset if they fall out?
        
        // For this prototype: The pod moves, and it has collision floors. 
        // The player physics engine handles standing on it.
    }
}, (peers) => {
    // Handled in player.update
});

// Host Logic (Simple: First player becomes "host" implicitly for pod movement)
setInterval(() => {
    if (network.state.phase === 'flight' && network.peers) {
        // Find lowest ID to be host
        const ids = Object.keys(network.peers).sort();
        if (ids[0] === network.myId) {
            // I am host, move the pod
            const currentPos = new THREE.Vector3().copy(network.state.podPosition);
            
            // Move across map
            currentPos.z += 0.2; // Speed
            
            if (currentPos.z > 500) {
                // End flight
                network.setPhase('game');
            } else {
                network.updatePod(currentPos);
            }
        }
    }
}, 50); // 20 ticks/sec

// Admin / Debug triggers (e.g., press 'Space' on keyboard to start match)
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        network.startGame();
    }
});

// Loop
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    
    if (player) {
        player.update(dt);
    }
    
    try {
        renderer.render(scene, camera);
    } catch (e) {
        // Ignore InvalidStateError from XR session ending
        if (e.name !== 'InvalidStateError') {
            console.error(e);
        }
    }
});

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});