import * as THREE from 'three';

export class Dashboard {
    constructor(scene, renderer, camera, audioManager) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.audioManager = audioManager;

        this.group = new THREE.Group();
        this.group.visible = false;
        // scene.add handled by Player (parented to userGroup)

        this.buttons = [];
        this.isRecording = false;
        
        // Replay Data
        this.frames = [];
        this.recordingStartTime = 0;

        this.setupUI();
    }

    setupUI() {
        // Panel
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.2, 0.02),
            new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.5 })
        );
        this.group.add(panel);

        // Buttons
        const btnGeo = new THREE.BoxGeometry(0.08, 0.04, 0.02);
        const btnMat = new THREE.MeshStandardMaterial({ color: 0x444444 });

        const labels = ["RECORD", "DASH", "MAP", "SETTINGS", "SOCIAL", "EXIT"];

        for (let i = 0; i < 6; i++) {
            const btn = new THREE.Mesh(btnGeo, btnMat.clone());
            const col = i % 3;
            const row = Math.floor(i / 3);

            btn.position.set(
                (col - 1) * 0.09,
                0.04 - (row * 0.07),
                0.015
            );

            // Text Label
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            this.drawLabel(ctx, labels[i], i === 0 ? '#cc0000' : '#444444');

            const tex = new THREE.CanvasTexture(canvas);
            const labelMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(0.07, 0.035),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true })
            );
            labelMesh.position.z = 0.011;
            btn.add(labelMesh);

            btn.userData = {
                id: i,
                labelCtx: ctx,
                labelTex: tex,
                isHovered: false
            };
            if (i === 0) btn.material.color.setHex(0xcc0000); // Red for record

            this.buttons.push(btn);
            this.group.add(btn);
        }
    }

    drawLabel(ctx, text, bgColor) {
        ctx.fillStyle = bgColor; // BG
        ctx.fillRect(0, 0, 128, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 32);
    }

    updatePosition(pos, lookAtPos) {
        // Convert world position to local space of the parent (userGroup)
        if (this.group.parent) {
            const localPos = this.group.parent.worldToLocal(pos.clone());
            this.group.position.copy(localPos);
        } else {
            this.group.position.copy(pos);
        }
        
        // lookAt works in World Space, so we can pass the lookAtPos directly
        this.group.lookAt(lookAtPos);
    }

    show(scale = 1.0) {
        this.group.visible = true;
        this.group.scale.setScalar(scale);
    }

    hide() {
        this.group.visible = false;
    }

    get isOpen() {
        return this.group.visible;
    }

    toggle() {
        if (this.isOpen) this.hide();
        else {
            this.show();
        }
    }

    update(controllers) {
        // Recording Logic
        if (this.isRecording) {
            this.recordFrame(controllers);
        }

        // Only allow interaction if fully visible and mostly expanded
        if (!this.group.visible || this.group.scale.x < 0.9) return;

        ['left', 'right'].forEach(side => {
            const c = controllers[side];
            if (!c || !c.object) return;

            // Finger tip approximation (controller position is usually handle)
            const handPos = new THREE.Vector3();
            c.object.getWorldPosition(handPos);

            this.buttons.forEach(btn => {
                const btnWorld = new THREE.Vector3();
                btn.getWorldPosition(btnWorld);

                // Distance check for "Touch" - Tighter hitbox
                const dist = handPos.distanceTo(btnWorld);

                if (dist < 0.035) { // Reduced from 0.04 for better precision
                    if (!btn.userData.isHovered) {
                        btn.userData.isHovered = true;
                        btn.material.emissive.setHex(0x555555);

                        // Click logic (simple touch-to-click)
                        // Debounce slightly to avoid rapid toggles
                        const now = Date.now();
                        if (!btn.userData.lastClick || now - btn.userData.lastClick > 1000) {
                            btn.userData.lastClick = now;
                            this.onClick(btn.userData.id);
                        }
                    }
                } else {
                    if (btn.userData.isHovered) {
                        btn.userData.isHovered = false;
                        btn.material.emissive.setHex(0x000000);
                    }
                }
            });
        });
    }

    recordFrame(controllers) {
        const headPos = new THREE.Vector3();
        const headRot = new THREE.Quaternion();
        this.camera.getWorldPosition(headPos);
        this.camera.getWorldQuaternion(headRot);

        const l = controllers.left.object;
        const r = controllers.right.object;
        
        const lPos = new THREE.Vector3(); l.getWorldPosition(lPos);
        const lRot = new THREE.Quaternion(); l.getWorldQuaternion(lRot);
        const rPos = new THREE.Vector3(); r.getWorldPosition(rPos);
        const rRot = new THREE.Quaternion(); r.getWorldQuaternion(rRot);

        this.frames.push({
            t: Date.now() - this.recordingStartTime,
            h: [headPos.toArray(), headRot.toArray()],
            l: [lPos.toArray(), lRot.toArray()],
            r: [rPos.toArray(), rRot.toArray()]
        });
    }

    onClick(id) {
        if (id === 0) {
            this.toggleRecording();
        }
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.frames = [];
        this.recordingStartTime = Date.now();
        this.updateBtn(0, "STOP", '#00cc00');
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;

        // Create Replay JSON
        const replayData = {
            date: new Date().toISOString(),
            duration: Date.now() - this.recordingStartTime,
            frames: this.frames
        };

        try {
            const blob = new Blob([JSON.stringify(replayData)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `replay-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            this.updateBtn(0, "RECORD", '#cc0000');
        } catch (e) {
            console.error("Save error:", e);
            this.updateBtn(0, "ERROR", '#cc0000');
        }
    }

    updateBtn(id, text, colorHex) {
        const btn = this.buttons[id];
        if (colorHex) btn.material.color.set(colorHex);
        const ctx = btn.userData.labelCtx;
        this.drawLabel(ctx, text, colorHex);
        btn.userData.labelTex.needsUpdate = true;
    }
}