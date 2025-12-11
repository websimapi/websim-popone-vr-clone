import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@websim/remotion/player";
import { ReplayComposition } from "./composition.jsx";
const RemotionOverlay = () => {
  const [replayData, setReplayData] = useState(null);
  const containerRef = useRef(null);
  useEffect(() => {
    const handleReplay = (e) => {
      console.log("Received replay data", e.detail);
      setReplayData(e.detail);
    };
    const handleClose = () => {
      setReplayData(null);
    };
    window.addEventListener("render-replay", handleReplay);
    window.addEventListener("close-replay", handleClose);
    return () => {
      window.removeEventListener("render-replay", handleReplay);
      window.removeEventListener("close-replay", handleClose);
    };
  }, []);
  useEffect(() => {
    if (!replayData || !containerRef.current) return;
    let recorder = null;
    let recordingTimer = null;
    const interval = setInterval(() => {
      const canvas = containerRef.current.querySelector("canvas");
      if (canvas && window.player && window.player.dashboard) {
        clearInterval(interval);
        window.player.dashboard.setExternalSource(canvas);
        try {
          const captureFn = canvas.captureStream || canvas.mozCaptureStream;
          if (!captureFn) {
            console.warn("Canvas capture not supported");
            window.dispatchEvent(new CustomEvent("render-complete"));
            return;
          }
          const stream = captureFn.call(canvas, 30);
          recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `skydrop-replay-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.dispatchEvent(new CustomEvent("render-complete"));
          };
          recorder.start();
          recordingTimer = setTimeout(() => {
            if (recorder && recorder.state === "recording") {
              recorder.stop();
            }
          }, replayData.duration);
        } catch (e) {
          console.error("Recording error", e);
          window.dispatchEvent(new CustomEvent("render-complete"));
        }
      }
    }, 100);
    return () => {
      clearInterval(interval);
      if (recordingTimer) clearTimeout(recordingTimer);
      if (recorder && recorder.state === "recording") recorder.stop();
    };
  }, [replayData]);
  if (!replayData) return null;
  const fps = 30;
  const durationInFrames = Math.max(1, Math.ceil(replayData.duration / 1e3 * fps));
  return /* @__PURE__ */ jsxDEV("div", { ref: containerRef, style: {
    position: "absolute",
    top: 0,
    left: -9999,
    // Hide off-screen
    width: "1280px",
    height: "720px",
    pointerEvents: "none",
    visibility: "visible"
    // Must be visible to render
  }, children: /* @__PURE__ */ jsxDEV(
    Player,
    {
      component: ReplayComposition,
      durationInFrames,
      fps,
      compositionWidth: 1280,
      compositionHeight: 720,
      inputProps: { data: replayData },
      controls: false,
      autoplay: true,
      loop: true,
      style: { width: "100%", height: "100%" }
    },
    void 0,
    false,
    {
      fileName: "<stdin>",
      lineNumber: 112,
      columnNumber: 13
    }
  ) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 103,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 130,
    columnNumber: 29
  }));
}
