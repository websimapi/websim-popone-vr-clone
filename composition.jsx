import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useRef, useEffect, useState } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
const ReplayComposition = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef(null);
  const threeRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    if (threeRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(1118481);
    scene.fog = new THREE.FogExp2(1118481, 2e-3);
    const camera = new THREE.PerspectiveCamera(75, 1280 / 720, 0.1, 1e3);
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true
    });
    renderer.setSize(1280, 720);
    const ambient = new THREE.AmbientLight(4210752, 2);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(16777215, 2);
    dir.position.set(50, 100, 50);
    scene.add(dir);
    const grid = new THREE.GridHelper(1e3, 100, 4473924, 2236962);
    grid.position.y = 0;
    scene.add(grid);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1e3, 1e3),
      new THREE.MeshBasicMaterial({ color: 2236962, transparent: true, opacity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 300;
    scene.add(floor);
    const lHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.15),
      new THREE.MeshBasicMaterial({ color: 65280 })
    );
    const rHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.15),
      new THREE.MeshBasicMaterial({ color: 65280 })
    );
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: 65280 })
    );
    scene.add(lHand);
    scene.add(rHand);
    scene.add(head);
    threeRef.current = { scene, camera, renderer, lHand, rHand, head };
  }, [canvasRef]);
  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, camera, renderer, lHand, rHand, head } = threeRef.current;
    const dataFrame = data.frames[frame];
    if (!dataFrame) return;
    const [headPos, headRot] = dataFrame.h;
    const [lPos, lRot] = dataFrame.l;
    const [rPos, rRot] = dataFrame.r;
    head.position.set(...headPos);
    head.quaternion.set(...headRot);
    lHand.position.set(...lPos);
    lHand.quaternion.set(...lRot);
    rHand.position.set(...rPos);
    rHand.quaternion.set(...rRot);
    camera.position.set(...headPos);
    camera.quaternion.set(...headRot);
    renderer.render(scene, camera);
  }, [frame, threeRef, data]);
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { children: /* @__PURE__ */ jsxDEV("canvas", { ref: canvasRef }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 98,
    columnNumber: 13
  }) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 97,
    columnNumber: 9
  });
};
export {
  ReplayComposition
};
