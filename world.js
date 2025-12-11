import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.concreteTex = null;
        this.metalTex = null;
        this.skyboxTex = null;
        this.seed = 0;
    }

    async loadAssets() {
        const loader = new THREE.TextureLoader();
        
        // Use Promise.all for parallel loading
        const [concrete, metal, skybox] = await Promise.all([
            loader.loadAsync('concrete.png'),
            loader.loadAsync('metal_floor.png'),
            loader.loadAsync('skybox.png')
        ]);

        this.concreteTex = concrete;
        this.concreteTex.wrapS = THREE.RepeatWrapping;
        this.concreteTex.wrapT = THREE.RepeatWrapping;

        this.metalTex = metal;
        this.metalTex.wrapS = THREE.RepeatWrapping;
        this.metalTex.wrapT = THREE.RepeatWrapping;
        this.metalTex.repeat.set(4, 4);

        this.skyboxTex = skybox;
        this.skyboxTex.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.background = this.skyboxTex;
        this.scene.environment = this.skyboxTex;
    }

    createLobby(seed = Date.now()) {
        this.seed = seed;
        
        // Seeded RNG (Mulberry32)
        let t = seed;
        const random = () => {
          t += 0x6D2B79F5;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };

        // Main Skyscraper (Spawn)
        const towerGeo = new THREE.BoxGeometry(40, 300, 40);
        const uvAttribute = towerGeo.attributes.uv;
        for (let i = 0; i < uvAttribute.count; i++) {
             uvAttribute.set

