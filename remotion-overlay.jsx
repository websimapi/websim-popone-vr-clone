import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@websim/remotion/player";
import { ReplayComposition } from "./composition.jsx";
const RemotionOverlay = () => {
  const [replayData, setReplayData] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const containerRef = useRef(null);
  useEffect(() => {
    const handleReplay = (e) => {
      console.log("Received replay data", e.detail);
      setReplayData(e.detail);
      setDownloadUrl(null);
    };
    const handleClose = () => {
      setReplayData(null);
      setDownloadUrl(null);
    };
    const handleForceDownload = () => {
      if (downloadUrl) {
        triggerDownload(downloadUrl);
      }
    };
    window.addEventListener("render-replay", handleReplay);
    window.addEventListener("close-replay", handleClose);
    window.addEventListener("force-download", handleForceDownload);
    return () => {
      window.removeEventListener("render-replay", handleReplay);
      window.removeEventListener("close-replay", handleClose);
      window.removeEventListener("force-download", handleForceDownload);
    };
  }, [downloadUrl]);
  const triggerDownload = (url) => {
    const filename = `skydrop-replay-${Date.now()}.webm`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_self";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    console.log("Triggered download for", url);
  };
  useEffect(() => {
    if (!replayData || !containerRef.current) return;
    let recorder = null;
    let recordingTimer = null;
    let progressTimer = null;
    let started = false;
    const totalDurationMs = (typeof replayData.duration === "number" ? replayData.duration : 0) + 500;
    const startRecording = () => {
      if (started) return;
      const canvas = containerRef.current.querySelector("canvas");
      if (!canvas) {
        console.warn("Remotion canvas not found yet, will retry.");
        return;
      }
      started = true;
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
          "video/webm",
          "video/mp4"
        ];
        let mimeType = "";
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }
        const options = {};
        if (mimeType) {
          options.mimeType = mimeType;
        }
        options.videoBitsPerSecond = 8e6;
        recorder = new MediaRecorder(stream, options);
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        recorder.onstop = () => {
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
          if (!blob.size) {
            console.error("Recording failed: Blob size is 0.");
            window.dispatchEvent(new CustomEvent("render-complete"));
            return;
          }
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          triggerDownload(url);
          window.dispatchEvent(new CustomEvent("render-complete", { detail: { url } }));
        };
        recorder.onerror = (err) => {
          console.error("MediaRecorder error", err);
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          if (recorder && recorder.state !== "inactive") {
            try {
              recorder.requestData();
            } catch (e) {
              console.warn("requestData failed after error", e);
            }
          }
          window.dispatchEvent(new CustomEvent("render-complete"));
        };
        recorder.start(200);
        const startTime = performance.now();
        progressTimer = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = totalDurationMs > 0 ? Math.min(1, elapsed / totalDurationMs) : 0;
          window.dispatchEvent(new CustomEvent("render-progress", {
            detail: { progress }
          }));
        }, 200);
        recordingTimer = setTimeout(() => {
          if (recorder && recorder.state === "recording") {
            try {
              recorder.requestData();
            } catch (e) {
              console.warn("requestData failed before stop", e);
            }
            recorder.stop();
          }
        }, totalDurationMs);
      } catch (e) {
        console.error("Recording error", e);
        window.dispatchEvent(new CustomEvent("render-complete"));
      }
    };
    const handleReady = () => {
      setTimeout(startRecording, 100);
    };
    window.addEventListener("remotion-ready", handleReady);
    const fallbackInterval = setInterval(() => {
      if (started) {
        clearInterval(fallbackInterval);
        return;
      }
      startRecording();
    }, 500);
    return () => {
      window.removeEventListener("remotion-ready", handleReady);
      clearInterval(fallbackInterval);
      if (recordingTimer) clearTimeout(recordingTimer);
      if (progressTimer) clearInterval(progressTimer);
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
    // Must be visible for paint
    opacity: 0.05,
    // Almost invisible but painted
    zIndex: 9999,
    // On top of everything to avoid occlusion
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
      lineNumber: 245,
      columnNumber: 13
    }
  ) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 233,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 263,
    columnNumber: 29
  }));
}
