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
        
        // Replay System
        this.isReplaying = false;
        this.replayStartTime = 0;
        this.replayTarget = new THREE.WebGLRenderTarget(512, 288);
        this.replayCamera = new THREE.PerspectiveCamera(70, 16/9, 0.1, 1000);
        this.replayCamera.layers.set(0); // See World
        this.replayCamera.layers.enable(2); // See Ghost
        
        // Ghost Player (Layer 2)
        this.replayGroup = new THREE.Group();
        this.scene.add(this.replayGroup);
        
        const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        this.ghostHead = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), ghostMat);
        this.ghostHead.layers.set(2);
        this.ghostL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), ghostMat);
        this.ghostL.layers.set(2);
        this.ghostR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), ghostMat);
        this.ghostR.layers.set(2);
        this.replayGroup.add(this.ghostHead, this.ghostL, this.ghostR);

        this.setupUI();
    }

    setupUI() {
        // Replay Screen
        const screenGeo = new THREE.PlaneGeometry(0.3, 0.169);
        const screenMat = new THREE.MeshBasicMaterial({ map: this.replayTarget.texture });
        const screen = new THREE.Mesh(screenGeo, screenMat);
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

        // Replay Rendering Logic
        if (this.isReplaying && this.frames.length > 0) {
            const time = (Date.now() - this.replayStartTime) % this.replayDuration;
            
            // Find frame
            const frameIdx = Math.floor((time / this.replayDuration) * this.frames.length);
            const frame = this.frames[Math.min(frameIdx, this.frames.length - 1)];

            if (frame) {
                const [hPos, hRot] = frame.h;
                const [lPos, lRot] = frame.l;
                const [rPos, rRot] = frame.r;

                this.ghostHead.position.fromArray(hPos);
                this.ghostHead.quaternion.fromArray(hRot);
                this.ghostL.position.fromArray(lPos);
                this.ghostL.quaternion.fromArray(lRot);
                this.ghostR.position.fromArray(rPos);
                this.ghostR.quaternion.fromArray(rRot);

                // Camera Follow (Third Person behind recorded head)
                const targetPos = new THREE.Vector3().fromArray(hPos);
                const targetRot = new THREE.Quaternion().fromArray(hRot);
                const offset = new THREE.Vector3(0, 0.5, 2.0).applyQuaternion(targetRot);
                
                this.replayCamera.position.copy(targetPos).add(offset);
                this.replayCamera.lookAt(targetPos);

                // Render to Texture
                const currentXr = this.renderer.xr.enabled;
                this.renderer.xr.enabled = false;
                
                const currentTarget = this.renderer.getRenderTarget();
                this.renderer.setRenderTarget(this.replayTarget);
                this.renderer.render(this.scene, this.replayCamera);
                this.renderer.setRenderTarget(currentTarget);
                
                this.renderer.xr.enabled = currentXr;
            }
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
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        
        this.replayDuration = Date.now() - this.recordingStartTime;
        this.replayStartTime = Date.now();
        this.isReplaying = true;

        this.updateBtn(0, "RECORD", '#cc0000');
        this.updateBtn(1, "SAVE", '#00aa00');
        console.log("Replay ready. Frames:", this.frames.length);
    }

    saveReplay() {
        if (this.frames.length === 0) return;

        const replayData = {
            date: new Date().toISOString(),
            duration: this.replayDuration,
            frames: this.frames
        };

        // Exit VR safely to allow browser download interactions
        const session = this.renderer.xr.getSession();
        if (session) {
            session.end().catch((err) => {
                console.warn("Session end warning:", err);
            }).then(() => {
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('render-replay', { 
                        detail: replayData 
                    }));
                }, 100);
            });
        } else {
             window.dispatchEvent(new CustomEvent('render-replay', { 
                detail: replayData 
            }));
        }
        
        this.updateBtn(1, "SAVED", '#555555');
    }

    updateBtn(id, text, colorHex) {
        const btn = this.buttons[id];
        if (colorHex) btn.material.color.set(colorHex);
        const ctx = btn.userData.labelCtx;
        this.drawLabel(ctx, text, colorHex);
        btn.userData.labelTex.needsUpdate = true;
    }
}