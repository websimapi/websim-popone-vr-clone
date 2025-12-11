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
        this.replayDuration = 0;
        
        // Replay System
        this.replayCanvas = null;
        this.screenMat = null;

        // Listen for Remotion Canvas
        window.addEventListener('remotion-canvas-created', (e) => {
            this.replayCanvas = e.detail;
            if (this.screenMat) {
                this.screenMat.map = new THREE.CanvasTexture(this.replayCanvas);
                this.screenMat.map.minFilter = THREE.LinearFilter;
                this.screenMat.map.magFilter = THREE.LinearFilter;
                this.screenMat.color.setHex(0xffffff); // Reset color
                this.screenMat.needsUpdate = true;
            }
        });

        this.setupUI();
    }

    setupUI() {
        // Replay Screen
        const screenGeo = new THREE.PlaneGeometry(0.3, 0.169);
        // Start with black screen
        this.screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const screen = new THREE.Mesh(screenGeo, this.screenMat);
        screen.position.set(0, 0.25, 0); // Above panel
        this.group.add(screen);

        // Panel
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.2, 0.02),
            new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.5 })
        );
        this.group.add(panel);

        // Buttons
        const btnGeo = new THREE.BoxGeometry(0.08, 0.04, 0.02);
        const btnMat = new THREE.MeshStandardMaterial({ color: 0x444444 });

        const labels = ["RECORD", "SAVE", "MAP", "SETTINGS", "SOCIAL", "EXIT"];

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

        // Update Screen Texture if playing
        if (this.screenMat && this.screenMat.map && this.replayCanvas) {
            this.screenMat.map.needsUpdate = true;
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
        } else if (id === 1) {
            this.saveReplay();
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
        
        // Reset screen
        if (this.screenMat.map) {
            this.screenMat.map.dispose();
            this.screenMat.map = null;
        }
        this.screenMat.color.setHex(0x330000); // Recording indicator (Dark Red)
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        
        this.replayDuration = Date.now() - this.recordingStartTime;
        
        // Trigger Remotion Render
        const replayData = {
            date: new Date().toISOString(),
            duration: this.replayDuration,
            frames: this.frames
        };
        
        window.dispatchEvent(new CustomEvent('render-replay', { detail: replayData }));

        this.updateBtn(0, "RECORD", '#cc0000');
        this.updateBtn(1, "SAVE", '#00aa00');
    }

    saveReplay() {
        if (!this.replayCanvas) return;

        // Record the canvas stream
        this.updateBtn(1, "SAVING...", '#aa5500');
        
        try {
            const stream = this.replayCanvas.captureStream(30); // 30 FPS
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            const chunks = [];
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `skydrop-replay-${Date.now()}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                
                this.updateBtn(1, "SAVED", '#555555');
                setTimeout(() => this.updateBtn(1, "SAVE", '#00aa00'), 2000);
            };
            
            recorder.start();
            
            // Record for the duration of the clip
            setTimeout(() => {
                recorder.stop();
            }, this.replayDuration + 500); // Add slight buffer
            
        } catch (e) {
            console.error("Recording failed", e);
            this.updateBtn(1, "ERROR", '#cc0000');
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