import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useRef, useEffect, useState } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import * as THREE from "three";
import { World } from "./world.js";
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
    const lHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.15),
      new THREE.MeshStandardMaterial({ color: 11184810 })
    );
    const rHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.15),
      new THREE.MeshStandardMaterial({ color: 11184810 })
    );
    scene.add(lHand);
    scene.add(rHand);
    threeRef.current = { scene, camera, renderer, lHand, rHand, world };
  }, [canvasRef]);
  useEffect(() => {
    if (!threeRef.current) return;
    if (!data || !data.frames) return;
    const { scene, camera, renderer, lHand, rHand } = threeRef.current;
    const dataFrame = data.frames[frame];
    if (dataFrame) {
      const [headPos, headRot] = dataFrame.h;
      const [lPos, lRot] = dataFrame.l;
      const [rPos, rRot] = dataFrame.r;
      camera.position.set(...headPos);
      camera.quaternion.set(...headRot);
      lHand.position.set(...lPos);
      lHand.quaternion.set(...lRot);
      rHand.position.set(...rPos);
      rHand.quaternion.set(...rRot);
    }
    renderer.render(scene, camera);
  }, [frame, data]);
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { children: /* @__PURE__ */ jsxDEV("canvas", { ref: canvasRef, style: { width: "100%", height: "100%" } }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 99,
    columnNumber: 13
  }) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 98,
    columnNumber: 9
  });
};
export {
  ReplayComposition
};
