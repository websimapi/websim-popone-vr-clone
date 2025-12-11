import * as THREE from 'three';

export class PeerManager {
    constructor(scene) {
        this.scene = scene;
        this.peerMeshes = {};
    }

    update(peers, myId) {
        // Cleanup disconnected
        for (let id in this.peerMeshes) {
            if (!peers[id]) {
                this.scene.remove(this.peerMeshes[id].root);
                delete this.peerMeshes[id];
            }
        }

        // Update / Create
        for (let id in peers) {
            if (id === myId) continue;
            const pData = peers[id];
            
            if (!this.peerMeshes[id]) {
                // Create Avatar
                const root = new THREE.Group();
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: pData.color || 0xffffff }));
                const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
                const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
                
                root.add(head);
                root.add(lHand);
                root.add(rHand);
                this.scene.add(root);

                this.peerMeshes[id] = { root, head, lHand, rHand };
            }

            const mesh = this.peerMeshes[id];
            if (pData.hP) {
                mesh.head.position.copy(pData.hP);
                mesh.head.quaternion.copy(pData.hR);
            }
            if (pData.lP) {
                mesh.lHand.position.copy(pData.lP);
                mesh.lHand.quaternion.copy(pData.lR);
            }
            if (pData.rP) {
                mesh.rHand.position.copy(pData.rP);
                mesh.rHand.quaternion.copy(pData.rR);
            }
        }
    }
}