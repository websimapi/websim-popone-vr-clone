import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
const ThreeJsRecorder = ({ data, onComplete, onError }) => {
  const canvasRef = useRef(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!data || !canvasRef.current) return;
    let isUnmounted = false;
    let renderer = null;
    let recorder = null;
    let frameId = null;
    const run = async () => {
      console.log("Initializing Recorder for data:", data);
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(5592405, 2e-3);
      scene.background = new THREE.Color(328965);
      const width = 1280;
      const height = 720;
      const fps = 30;
      const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1e3);
      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        preserveDrawingBuffer: true
      });
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const loader = new THREE.TextureLoader();
      const loadTex = (url) => new Promise((res) => loader.load(url, res, void 0, () => res(null)));
      const [concreteTex, metalTex, skyboxTex] = await Promise.all([
        loadTex("concrete.png"),
        loadTex("metal_floor.png"),
        loadTex("skybox.png")
      ]);
      if (isUnmounted) {
        renderer.dispose();
        return;
      }
      if (skyboxTex) {
        skyboxTex.mapping = THREE.EquirectangularReflectionMapping;
        skyboxTex.colorSpace = THREE.SRGBColorSpace;
        scene.background = skyboxTex;
        scene.environment = skyboxTex;
      }
      const ambientLight = new THREE.AmbientLight(4210752, 2);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(16777215, 2);
      dirLight.position.set(100, 500, 100);
      dirLight.castShadow = true;
      dirLight.shadow.bias = -5e-4;
      dirLight.shadow.camera.top = 200;
      dirLight.shadow.camera.bottom = -200;
      dirLight.shadow.camera.left = -200;
      dirLight.shadow.camera.right = 200;
      scene.add(dirLight);
      if (concreteTex) {
        concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;
        concreteTex.colorSpace = THREE.SRGBColorSpace;
      }
      if (metalTex) {
        metalTex.wrapS = metalTex.wrapT = THREE.RepeatWrapping;
        metalTex.colorSpace = THREE.SRGBColorSpace;
      }
      const towerGeo = new THREE.BoxGeometry(40, 300, 40);
      const uvAttribute = towerGeo.attributes.uv;
      for (let i = 0; i < uvAttribute.count; i++) {
        uvAttribute.setXY(
          i,
          uvAttribute.getX(i) * 4,
          uvAttribute.getY(i) * 30
        );
      }
      const towerMat = new THREE.MeshStandardMaterial({
        map: concreteTex,
        color: concreteTex ? 16777215 : 6710886,
        roughness: 0.8
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(0, 150, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      scene.add(tower);
      const roofGeo = new THREE.BoxGeometry(42, 1, 42);
      const roofMat = new THREE.MeshStandardMaterial({
        map: metalTex,
        color: metalTex ? 16777215 : 3355443,
        roughness: 0.6
      });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, 300.5, 0);
      roof.castShadow = true;
      roof.receiveShadow = true;
      scene.add(roof);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 4473924,
        roughness: 0.9
      });
      const wallGeoH = new THREE.BoxGeometry(42, 1.5, 1);
      const wallGeoV = new THREE.BoxGeometry(1, 1.5, 42);
      const w1 = new THREE.Mesh(wallGeoH, wallMat);
      w1.position.set(0, 301.25, 20.5);
      const w2 = new THREE.Mesh(wallGeoH, wallMat);
      w2.position.set(0, 301.25, -20.5);
      const w3 = new THREE.Mesh(wallGeoV, wallMat);
      w3.position.set(20.5, 301.25, 0);
      const w4 = new THREE.Mesh(wallGeoV, wallMat);
      w4.position.set(-20.5, 301.25, 0);
      scene.add(w1, w2, w3, w4);
      const rnd = /* @__PURE__ */ (() => {
        let seed = 5678;
        return () => {
          seed = (Math.floor(seed) * 9301 + 49297) % 233280;
          return seed / 233280;
        };
      })();
      for (let i = 0; i < 20; i++) {
        const h = 50 + rnd() * 200;
        const w = 20 + rnd() * 30;
        const x = (rnd() - 0.5) * 500;
        const z = (rnd() - 0.5) * 500;
        if (Math.abs(x) < 50 && Math.abs(z) < 50) continue;
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, w),
          new THREE.MeshStandardMaterial({ color: 3355443 })
        );
        b.position.set(x, h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
      }
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1e3, 1e3),
        new THREE.MeshStandardMaterial({ color: 1052688 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      const ghostMat = new THREE.MeshBasicMaterial({
        color: 65280,
        wireframe: true
      });
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.25),
        ghostMat
      );
      const lHand = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.15),
        ghostMat
      );
      const rHand = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.15),
        ghostMat
      );
      scene.add(head, lHand, rHand);
      renderer.render(scene, camera);
      const chunks = [];
      try {
        const stream = canvasRef.current.captureStream(fps);
        if (window.player && window.player.audio) {
          try {
            const audioStream = window.player.audio.getStream();
            if (audioStream) {
              audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
            }
          } catch (e) {
            console.warn("Could not attach audio stream", e);
          }
        }
        const mimeTypes = [
          "video/webm;codecs=vp9",
          "video/webm",
          "video/mp4"
        ];
        const selectedType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
        recorder = new MediaRecorder(
          stream,
          selectedType ? {
            mimeType: selectedType,
            videoBitsPerSecond: 8e6
          } : {}
        );
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, {
            type: selectedType || "video/webm"
          });
          if (blob.size < 1e3) {
            if (!isUnmounted) onError("Video empty (Blob < 1KB)");
          } else {
            const url = URL.createObjectURL(blob);
            if (!isUnmounted) onComplete(url);
          }
        };
      } catch (e) {
        console.error("Recorder Setup Error:", e);
        if (!isUnmounted) onError(e.message);
        return;
      }
      let startTime = null;
      const totalDuration = data.duration + 500;
      let isRecording = false;
      const animate = (timestamp) => {
        if (isUnmounted) return;
        if (!startTime) {
          startTime = timestamp;
          if (recorder && recorder.state === "inactive") {
            recorder.start();
            isRecording = true;
          }
        }
        const elapsed = timestamp - startTime;
        const progressVal = Math.min(1, elapsed / totalDuration);
        setProgress(progressVal);
        window.dispatchEvent(
          new CustomEvent("render-progress", {
            detail: { progress: progressVal }
          })
        );
        if (elapsed >= totalDuration) {
          if (recorder && recorder.state === "recording") {
            recorder.stop();
          }
          return;
        }
        if (data.frames && data.frames.length > 0) {
          let closestFrame = data.frames[0];
          let minDiff = Math.abs(closestFrame.t - elapsed);
          for (let i = 0; i < data.frames.length; i++) {
            const diff = Math.abs(data.frames[i].t - elapsed);
            if (diff < minDiff) {
              minDiff = diff;
              closestFrame = data.frames[i];
            }
          }
          const [hPos, hRot] = closestFrame.h;
          const [lPos, lRot] = closestFrame.l;
          const [rPos, rRot] = closestFrame.r;
          head.position.fromArray(hPos);
          head.quaternion.fromArray(hRot);
          lHand.position.fromArray(lPos);
          lHand.quaternion.fromArray(lRot);
          rHand.position.fromArray(rPos);
          rHand.quaternion.fromArray(rRot);
          const tPos = new THREE.Vector3().fromArray(hPos);
          const tRot = new THREE.Quaternion().fromArray(hRot);
          const offset = new THREE.Vector3(0, 0.5, 2).applyQuaternion(
            tRot
          );
          camera.position.copy(tPos).add(offset);
          camera.lookAt(tPos);
        }
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      };
      frameId = requestAnimationFrame(animate);
    };
    run();
    return () => {
      isUnmounted = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (recorder && recorder.state === "recording") recorder.stop();
      if (renderer) renderer.dispose();
    };
  }, [data]);
  return /* @__PURE__ */ jsxDEV(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "black",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      },
      children: [
        /* @__PURE__ */ jsxDEV("h2", { style: { color: "white", fontFamily: "sans-serif" }, children: [
          "RENDERING REPLAY: ",
          Math.round(progress * 100),
          "%"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 360,
          columnNumber: 13
        }),
        /* @__PURE__ */ jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            width: 1280,
            height: 720,
            style: {
              width: "640px",
              height: "360px",
              border: "1px solid #333",
              marginTop: "20px"
            }
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 363,
            columnNumber: 13
          }
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "<stdin>",
      lineNumber: 346,
      columnNumber: 9
    }
  );
};
export {
  ThreeJsRecorder
};
