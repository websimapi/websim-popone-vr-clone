import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useRef, useEffect, useState } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import * as THREE from "three";
import { World } from "./world.js";
const lerpVec = (a, b, t) => {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t)
  ];
};
const slerpQuat = (a, b, t) => {
  const qA = new THREE.Quaternion().fromArray(a);
  const qB = new THREE.Quaternion().fromArray(b);
  qA.slerp(qB, t);
  return qA.toArray();
};
const ReplayComposition = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef(null);
  const [handle] = useState(() => delayRender());
  const threeRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    if (threeRef.current) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(5592405, 2e-3);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1e3);
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true
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
    const world = new World(scene);
    world.loadAssets().then(() => {
      world.createLobby();
      world.createPod();
      continueRender(handle);
    }).catch((err) => {
      console.error("Asset load error", err);
      continueRender(handle);
    });
    const ghostMat = new THREE.MeshBasicMaterial({ color: 65280, wireframe: true });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), ghostMat);
    const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), ghostMat);
    const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), ghostMat);
    scene.add(head);
    scene.add(lHand);
    scene.add(rHand);
    threeRef.current = { scene, camera, renderer, head, lHand, rHand, world };
  }, [canvasRef]);
  useEffect(() => {
    if (!threeRef.current) return;
    if (!data || !data.frames || data.frames.length === 0) return;
    const { scene, camera, renderer, head, lHand, rHand } = threeRef.current;
    const currentTimeMs = frame / fps * 1e3;
    let closestFrame = data.frames[0];
    let minDiff = Math.abs(closestFrame.t - currentTimeMs);
    for (let i = 0; i < data.frames.length; i++) {
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
      head.position.set(...hPos);
      head.quaternion.set(...hRot);
      lHand.position.set(...lPos);
      lHand.quaternion.set(...lRot);
      rHand.position.set(...rPos);
      rHand.quaternion.set(...rRot);
      const targetPos = new THREE.Vector3(...hPos);
      const targetRot = new THREE.Quaternion(...hRot);
      const offset = new THREE.Vector3(0, 0.5, 2).applyQuaternion(targetRot);
      camera.position.copy(targetPos).add(offset);
      camera.lookAt(targetPos);
    }
    renderer.render(scene, camera);
  }, [frame, data, fps]);
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { children: /* @__PURE__ */ jsxDEV("canvas", { ref: canvasRef, style: { width: "100%", height: "100%" } }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 141,
    columnNumber: 13
  }) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 140,
    columnNumber: 9
  });
};
export {
  ReplayComposition
};
