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
        this.recorder = null;
        this.chunks = [];

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

                // Distance check for "Touch"
                const dist = handPos.distanceTo(btnWorld);

                if (dist < 0.04) {
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
        try {
            // WebXR rendering writes to the base layer. captureStream() on the canvas *should* catch it.
            const stream = this.renderer.domElement.captureStream(30);
            
            // Add Audio Tracks
            if (this.audioManager) {
                const audioStream = this.audioManager.getStream();
                if (audioStream) {
                    audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
                }
            }

            this.recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            this.chunks = [];

            this.recorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.chunks.push(e.data);
            };

            this.recorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `vr-recording-${Date.now()}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);

                this.updateBtn(0, "RECORD", '#cc0000');
            };

            this.recorder.start();
            this.isRecording = true;
            this.updateBtn(0, "STOP", '#00cc00'); // Green for active recording state (or stop button)
        } catch (e) {
            console.error("Recording error:", e);
        }
    }

    stopRecording() {
        if (!this.recorder || !this.isRecording) return;
        this.recorder.stop();
        this.isRecording = false;
    }

    updateBtn(id, text, colorHex) {
        const btn = this.buttons[id];
        if (colorHex) btn.material.color.set(colorHex);
        const ctx = btn.userData.labelCtx;
        this.drawLabel(ctx, text, colorHex);
        btn.userData.labelTex.needsUpdate = true;
    }
}