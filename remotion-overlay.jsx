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
    let progressTimer = null;
    let started = false;
    let checkInterval = null;
    const totalDurationMs = (typeof replayData.duration === "number" ? replayData.duration : 0) + 1500;
    const isCanvasRendering = (canvas) => {
      try {
        const ctx = canvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, 1, 1);
        return imageData.data[3] > 0;
      } catch (e) {
        return false;
      }
    };
    const startRecording = () => {
      if (started) return;
      const canvas = containerRef.current.querySelector("canvas");
      if (!canvas) {
        return;
      }
      if (!isCanvasRendering(canvas)) {
        return;
      }
      started = true;
      console.log("Starting recording, canvas is rendering");
      if (window.player && window.player.dashboard) {
        window.player.dashboard.setExternalSource(canvas);
      }
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
          "video/webm"
        ];
        let mimeType = "";
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }
        const options = {
          videoBitsPerSecond: 8e6
        };
        if (mimeType) {
          options.mimeType = mimeType;
        }
        recorder = new MediaRecorder(stream, options);
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
            console.log(`Chunk received: ${e.data.size} bytes`);
          }
        };
        recorder.onstop = () => {
          console.log("Recording stopped, processing chunks:", chunks.length);
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          if (!chunks.length) {
            console.error("Recording failed: No data chunks captured.");
            window.dispatchEvent(new CustomEvent("render-complete"));
            return;
          }
          const blobType = mimeType || "video/webm";
          const blob = new Blob(chunks, { type: blobType });
          console.log(`Recording complete. Size: ${blob.size} bytes, type: ${blobType}`);
          if (blob.size < 1e3) {
            console.error("Recording failed: Blob size too small:", blob.size);
            window.dispatchEvent(new CustomEvent("render-complete"));
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `skydrop-replay-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
          window.dispatchEvent(new CustomEvent("render-complete"));
        };
        recorder.onerror = (err) => {
          console.error("MediaRecorder error", err);
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          window.dispatchEvent(new CustomEvent("render-complete"));
        };
        recorder.start(1e3);
        console.log("MediaRecorder started");
        const startTime = performance.now();
        progressTimer = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = totalDurationMs > 0 ? Math.min(1, elapsed / totalDurationMs) : 0;
          window.dispatchEvent(new CustomEvent("render-progress", {
            detail: { progress }
          }));
        }, 200);
        recordingTimer = setTimeout(() => {
          console.log("Duration reached, stopping recorder");
          if (recorder && recorder.state === "recording") {
            recorder.stop();
          }
        }, totalDurationMs);
      } catch (e) {
        console.error("Recording error", e);
        window.dispatchEvent(new CustomEvent("render-complete"));
      }
    };
    checkInterval = setInterval(() => {
      if (started) {
        clearInterval(checkInterval);
        return;
      }
      startRecording();
    }, 100);
    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (recordingTimer) clearTimeout(recordingTimer);
      if (progressTimer) clearInterval(progressTimer);
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
    };
  }, [replayData]);
  if (!replayData) return null;
  const fps = 30;
  const durationInFrames = Math.max(1, Math.ceil(replayData.duration / 1e3 * fps));
  return /* @__PURE__ */ jsxDEV("div", { ref: containerRef, style: {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    width: "1280px",
    height: "720px",
    pointerEvents: "none",
    visibility: "visible",
    opacity: 1,
    background: "#000"
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
      lineNumber: 221,
      columnNumber: 13
    }
  ) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 210,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 239,
    columnNumber: 29
  }));
}
