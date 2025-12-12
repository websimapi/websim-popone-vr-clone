import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useRef, useEffect, useState } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  random
} from "remotion";
import * as THREE from "three";
const ReplayComposition = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef(null);
  const [handle] = useState(() => delayRender());
  const threeRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) {
      console.error("ReplayComposition: Canvas ref is null during setup!");
      return;
    }
    if (threeRef.current) return;
    console.log("ReplayComposition: Initializing Three.js scene");
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(5592405, 2e-3);
    scene.background = new THREE.Color(328965);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1e3);
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false
      // Ensure solid background
    });
    renderer.setSize(1280, 720);
    renderer.shadowMap.enabled = true;
    const ambientLight = new THREE.AmbientLight(4210752, 2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(16777215, 2);
    dirLight.position.set(100, 500, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    scene.add(dirLight);
    const towerGeo = new THREE.BoxGeometry(40, 300, 40);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 6710886,
      roughness: 0.8
    });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(0, 150, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
    const roofGeo = new THREE.BoxGeometry(42, 1, 42);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 3355443,
      metalness: 0.3,
      roughness: 0.6
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 300.5, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);
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
        new THREE.MeshStandardMaterial({ color: 2236962 })
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
    const podFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5, 0.5, 16),
      new THREE.MeshStandardMaterial({
        color: 43775,
        emissive: 8772
      })
    );
    podFloor.position.set(0, 305, -10);
    podFloor.castShadow = true;
    podFloor.receiveShadow = true;
    scene.add(podFloor);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 65280,
      wireframe: true
    });
    const debugCube = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({ color: 16711680, wireframe: true })
    );
    debugCube.position.set(0, 310, 0);
    scene.add(debugCube);
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
    threeRef.current = {
      scene,
      camera,
      renderer,
      head,
      lHand,
      rHand,
      debugCube
    };
    try {
      threeRef.current.renderer.render(threeRef.current.scene, threeRef.current.camera);
      console.log("ReplayComposition: Initial render successful");
    } catch (e) {
      console.error("ReplayComposition: Initial render failed", e);
    }
    continueRender(handle);
    window.dispatchEvent(new CustomEvent("remotion-ready"));
  }, [canvasRef, handle]);
  useEffect(() => {
    if (!threeRef.current) {
      return;
    }
    const { scene, camera, renderer, head, lHand, rHand, debugCube } = threeRef.current;
    if (debugCube) {
      debugCube.rotation.x = frame * 0.1;
      debugCube.rotation.y = frame * 0.15;
    }
    if (!data || !data.frames || data.frames.length === 0) {
      renderer.render(scene, camera);
      return;
    }
    const currentTimeMs = frame / fps * 1e3;
    let closestFrame = data.frames[0];
    let minDiff = Math.abs(closestFrame.t - currentTimeMs);
    for (let i = 1; i < data.frames.length; i++) {
      const diff = Math.abs(data.frames[i].t - currentTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = data.frames[i];
      } else if (diff > minDiff && data.frames[i].t > currentTimeMs) {
        break;
      }
    }
    if (closestFrame) {
      const [hPos, hRot] = closestFrame.h;
      const [lPos, lRot] = closestFrame.l;
      const [rPos, rRot] = closestFrame.r;
      head.position.set(hPos[0], hPos[1], hPos[2]);
      head.quaternion.set(hRot[0], hRot[1], hRot[2], hRot[3]);
      lHand.position.set(lPos[0], lPos[1], lPos[2]);
      lHand.quaternion.set(lRot[0], lRot[1], lRot[2], lRot[3]);
      rHand.position.set(rPos[0], rPos[1], rPos[2]);
      rHand.quaternion.set(rRot[0], rRot[1], rRot[2], rRot[3]);
      const targetPos = new THREE.Vector3(hPos[0], hPos[1], hPos[2]);
      const targetRot = new THREE.Quaternion(
        hRot[0],
        hRot[1],
        hRot[2],
        hRot[3]
      );
      const offset = new THREE.Vector3(0, 0.5, 2).applyQuaternion(
        targetRot
      );
      camera.position.copy(targetPos).add(offset);
      camera.lookAt(targetPos);
    }
    renderer.render(scene, camera);
  }, [frame, data, fps]);
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { children: [
    /* @__PURE__ */ jsxDEV(
      "canvas",
      {
        ref: canvasRef,
        style: { width: "100%", height: "100%" }
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 255,
        columnNumber: 13
      }
    ),
    !data && /* @__PURE__ */ jsxDEV("div", { style: { position: "absolute", top: 10, left: 10, color: "red" }, children: "NO DATA" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 259,
      columnNumber: 23
    })
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 254,
    columnNumber: 9
  });
};
export {
  ReplayComposition
};
