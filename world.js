<<<<<<< SEARCH
    createLobby() {
        // Main Skyscraper (Spawn)
        const towerGeo = new THREE.BoxGeometry(40, 300, 40);
        // UV mapping fix for tiling
        const uvAttribute = towerGeo.attributes.uv;
        for (let i = 0; i < uvAttribute.count; i++) {
             // Scale UVs
             uvAttribute.setXY(i, uvAttribute.getX(i) * 4, uvAttribute.getY(i) * 30);
        }

        const mat = new THREE.MeshStandardMaterial({ 
            map: this.concreteTex, 
            roughness: 0.8 
        });

        const tower = new THREE.Mesh(towerGeo, mat);
        tower.position.set(0, 150, 0); // Base at 0, top at 300
        tower.castShadow = true;
        tower.receiveShadow = true;
        this.scene.add(tower);
        this.colliders.push(tower);

        // Roof details
        const roofGeo = new THREE.BoxGeometry(42, 1, 42);
        const roofMat = new THREE.MeshStandardMaterial({ map: this.metalTex });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 300.5, 0);
        this.scene.add(roof);
        this.colliders.push(roof);

        // Parapet walls (for safety and collision testing)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });
        const wallGeoH = new THREE.BoxGeometry(42, 1.5, 1);
        const wallGeoV = new THREE.BoxGeometry(1, 1.5, 42);
        
        const w1 = new THREE.Mesh(wallGeoH, wallMat); w1.position.set(0, 301.25, 20.5);
        const w2 = new THREE.Mesh(wallGeoH, wallMat); w2.position.set(0, 301.25, -20.5);
        const w3 = new THREE.Mesh(wallGeoV, wallMat); w3.position.set(20.5, 301.25, 0);
        const w4 = new THREE.Mesh(wallGeoV, wallMat); w4.position.set(-20.5, 301.25, 0);
        
        [w1,w2,w3,w4].forEach(w => {
            this.scene.add(w);
            this.colliders.push(w);
        });

        // Surrounding City (Visuals only, low poly)
        for(let i=0; i<20; i++) {
            const h = 50 + Math.random() * 200;
            const w = 20 + Math.random() * 30;
            const x = (Math.random() - 0.5) * 500;
            const z = (Math.random() - 0.5) * 500;
            if(Math.abs(x) < 50 && Math.abs(z) < 50) continue; // Don't overlap spawn

            const b = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, w),
                new THREE.MeshStandardMaterial({ color: 0x333333 })
            );
            b.position.set(x, h/2, z);
            this.scene.add(b);
            // We can add these to colliders if we want to be able to fly to them
            this.colliders.push(b); 
        }

        // Ground Plane
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
        );
        plane.rotation.x = -Math.PI / 2;
        this.scene.add(plane);
        this.colliders.push(plane);
    }
=======
    createLobby(seed = Date.now()) {
        this.mapSeed = seed;

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
        // UV mapping fix for tiling
        const uvAttribute = towerGeo.attributes.uv;
        for (let i = 0; i < uvAttribute.count; i++) {
             // Scale UVs
             uvAttribute.setXY(i, uvAttribute.getX(i) * 4, uvAttribute.getY(i) * 30);
        }

        const mat = new THREE.MeshStandardMaterial({ 
            map: this.concreteTex, 
            roughness: 0.8 
        });

        const tower = new THREE.Mesh(towerGeo, mat);
        tower.position.set(0, 150, 0); // Base at 0, top at 300
        tower.castShadow = true;
        tower.receiveShadow = true;
        this.scene.add(tower);
        this.colliders.push(tower);

        // Roof details
        const roofGeo = new THREE.BoxGeometry(42, 1, 42);
        const roofMat = new THREE.MeshStandardMaterial({ map: this.metalTex });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 300.5, 0);
        this.scene.add(roof);
        this.colliders.push(roof);

        // Parapet walls (for safety and collision testing)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });
        const wallGeoH = new THREE.BoxGeometry(42, 1.5, 1);
        const wallGeoV = new THREE.BoxGeometry(1, 1.5, 42);
        
        const w1 = new THREE.Mesh(wallGeoH, wallMat); w1.position.set(0, 301.25, 20.5);

