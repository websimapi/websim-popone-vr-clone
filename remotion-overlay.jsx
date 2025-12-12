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
    let globalTimeout = null;
    const totalDurationMs = (typeof replayData.duration === "number" ? replayData.duration : 0) + 1500;
    const maxTotalMs = totalDurationMs + 5e3;
    const isCanvasRendering = (canvas) => {
      try {
        if (canvas.width === 0 || canvas.height === 0) return false;
        const ctx = canvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
        for (let i = 0; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 10 || imageData.data[i + 1] > 10 || imageData.data[i + 2] > 10) {
            return true;
          }
        }
        return false;
      } catch (e) {
        console.error("Canvas check error:", e);
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
        console.log("MediaRecorder started, will record for", totalDurationMs, "ms");
        const startTime = performance.now();
        progressTimer = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = totalDurationMs > 0 ? Math.min(1, elapsed / totalDurationMs) : 0;
          console.log(`Recording progress: ${Math.round(progress * 100)}%`);
          window.dispatchEvent(new CustomEvent("render-progress", {
            detail: { progress }
          }));
        }, 200);
        recordingTimer = setTimeout(() => {
          console.log("Duration reached, stopping recorder. State:", recorder?.state);
          if (recorder && recorder.state === "recording") {
            recorder.stop();
          } else {
            console.warn("Recorder not in recording state:", recorder?.state);
            window.dispatchEvent(new CustomEvent("render-complete"));
          }
        }, totalDurationMs);
        globalTimeout = setTimeout(() => {
          console.warn("Global recording timeout hit, forcing completion.");
          try {
            if (recorder && recorder.state === "recording") {
              recorder.stop();
            }
          } catch (e) {
            console.error("Error forcing recorder stop:", e);
          }
          window.dispatchEvent(new CustomEvent("render-complete"));
        }, maxTotalMs);
      } catch (e) {
        console.error("Recording error", e);
        window.dispatchEvent(new CustomEvent("render-complete"));
      }
    };
    let attempts = 0;
    const maxAttempts = 100;
    checkInterval = setInterval(() => {
      attempts++;
      if (started) {
        clearInterval(checkInterval);
        return;
      }
      if (attempts >= maxAttempts) {
        console.error("Recording timeout: canvas never rendered");
        clearInterval(checkInterval);
        window.dispatchEvent(new CustomEvent("render-complete"));
        return;
      }
      startRecording();
    }, 100);
    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (recordingTimer) clearTimeout(recordingTimer);
      if (progressTimer) clearInterval(progressTimer);
      if (globalTimeout) clearTimeout(globalTimeout);
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stop();
        } catch (e) {
          console.error("Error stopping recorder on cleanup:", e);
        }
      }
    };
  }, [replayData]);
  if (!replayData) return null;
  const fps = 30;
  const durationInFrames = Math.max(1, Math.ceil(replayData.duration / 1e3 * fps));
  return /* @__PURE__ */ jsxDEV("div", { ref: containerRef, style: {
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: -9999,
    width: "1280px",
    height: "720px",
    pointerEvents: "none",
    visibility: "visible",
    opacity: 0.01,
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
      loop: false,
      style: { width: "100%", height: "100%" }
    },
    void 0,
    false,
    {
      fileName: "<stdin>",
      lineNumber: 265,
      columnNumber: 13
    }
  ) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 253,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 283,
    columnNumber: 29
  }));
}
