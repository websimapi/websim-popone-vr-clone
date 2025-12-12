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
          const mimeTypes = [
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm",
            "video/mp4"
          ];
          let mimeType = "video/webm";
          for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              mimeType = type;
              break;
            }
          }
          console.log("Recording with mimeType:", mimeType);
          recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8e6
            // 8 Mbps for quality
          });
          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };
          recorder.onstop = () => {
            if (chunks.length === 0) {
              console.error("Recording failed: No data chunks captured.");
              window.dispatchEvent(new CustomEvent("render-complete"));
              return;
            }
            const blob = new Blob(chunks, { type: mimeType });
            console.log(`Recording complete. Size: ${blob.size} bytes`);
            const url = URL.createObjectURL(blob);
            const ext = mimeType.includes("mp4") ? "mp4" : "webm";
            const a = document.createElement("a");
            a.href = url;
            a.download = `skydrop-replay-${Date.now()}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.dispatchEvent(new CustomEvent("render-complete"));
          };
          recorder.start(100);
          recordingTimer = setTimeout(() => {
            if (recorder && recorder.state === "recording") {
              recorder.stop();
            }
          }, replayData.duration + 200);
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
    left: 0,
    width: "1280px",
    height: "720px",
    pointerEvents: "none",
    visibility: "visible",
    opacity: 0,
    // Invisible but rendered on-screen to prevent browser throttling
    zIndex: -10
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
      lineNumber: 148,
      columnNumber: 13
    }
  ) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 137,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 166,
    columnNumber: 29
  }));
}
