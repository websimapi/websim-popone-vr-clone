import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@websim/remotion/player";
import { ReplayComposition } from "./composition.jsx";
const RemotionOverlay = () => {
  const [replayData, setReplayData] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const downloadUrlRef = useRef(null);
  const containerRef = useRef(null);
  const [mimeType, setMimeType] = useState(null);
  useEffect(() => {
    downloadUrlRef.current = downloadUrl;
  }, [downloadUrl]);
  const triggerDownload = (url, type = "video/webm") => {
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const filename = `skydrop-replay-${Date.now()}.${ext}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    console.log("Triggered download for", url, filename);
  };
  useEffect(() => {
    const handleReplay = (e) => {
      console.log("Received replay data", e.detail);
      setReplayData(e.detail);
      setDownloadUrl(null);
      setMimeType(null);
    };
    const handleClose = () => {
      setReplayData(null);
      setDownloadUrl(null);
      setMimeType(null);
    };
    const handleForceDownload = () => {
      const currentUrl = downloadUrlRef.current;
      console.log("Force download requested. URL:", currentUrl);
      if (currentUrl) {
        triggerDownload(currentUrl, mimeType || "video/webm");
      } else {
        console.warn("Cannot download: URL is null");
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
  }, [mimeType]);
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
        const types = [
          "video/mp4",
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm"
        ];
        let selectedType = "";
        for (const type of types) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedType = type;
            break;
          }
        }
        if (!selectedType) selectedType = "video/webm";
        setMimeType(selectedType);
        const options = { mimeType: selectedType };
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
          const blob = new Blob(chunks, { type: selectedType });
          console.log(`Recording complete. Size: ${blob.size} bytes, type: ${selectedType}`);
          if (!blob.size) {
            console.error("Recording failed: Blob size is 0.");
            window.dispatchEvent(new CustomEvent("render-complete"));
            return;
          }
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          triggerDownload(url, selectedType);
          window.dispatchEvent(new CustomEvent("render-complete", { detail: { url } }));
        };
        recorder.onerror = (err) => {
          console.error("MediaRecorder error", err);
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          window.dispatchEvent(new CustomEvent("render-complete"));
        };
        recorder.start(100);
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
    // Allow clicks to pass through except for button
    visibility: "visible",
    zIndex: 9999
  }, children: [
    /* @__PURE__ */ jsxDEV("div", { style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "#000",
      opacity: 0.01,
      zIndex: -1
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 245,
      columnNumber: 13
    }),
    /* @__PURE__ */ jsxDEV(
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
        lineNumber: 250,
        columnNumber: 13
      }
    ),
    downloadUrl && /* @__PURE__ */ jsxDEV("div", { style: {
      position: "fixed",
      bottom: "20%",
      left: "50%",
      transform: "translateX(-50%)",
      pointerEvents: "auto",
      // Enable interaction
      zIndex: 1e4
    }, children: /* @__PURE__ */ jsxDEV(
      "button",
      {
        onClick: () => triggerDownload(downloadUrl, mimeType),
        style: {
          padding: "20px 40px",
          fontSize: "24px",
          fontWeight: "bold",
          color: "white",
          background: "#00cc00",
          border: "4px solid white",
          borderRadius: "10px",
          cursor: "pointer",
          boxShadow: "0 0 20px rgba(0,0,0,0.5)"
        },
        children: "SAVE VIDEO TO DEVICE"
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 273,
        columnNumber: 21
      }
    ) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 265,
      columnNumber: 17
    })
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 234,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 297,
    columnNumber: 29
  }));
}
