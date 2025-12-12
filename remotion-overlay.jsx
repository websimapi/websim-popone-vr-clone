import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@websim/remotion/player";
import { ReplayComposition } from "./composition.jsx";
const RemotionOverlay = () => {
  const [replayData, setReplayData] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadExt, setDownloadExt] = useState("webm");
  const downloadUrlRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    downloadUrlRef.current = downloadUrl;
  }, [downloadUrl]);
  const triggerDownload = (url) => {
    if (!url) {
      console.warn("triggerDownload called with empty URL");
      return;
    }
    const filename = `skydrop-replay-${Date.now()}.${downloadExt}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
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
    };
    const handleClose = () => {
      setReplayData(null);
      setDownloadUrl(null);
    };
    const handleForceDownload = () => {
      const currentUrl = downloadUrlRef.current;
      console.log("Force download requested. URL:", currentUrl);
      if (currentUrl) {
        triggerDownload(currentUrl);
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
  }, []);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
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
      setRendering(true);
      setTimeout(() => {
        try {
          const captureFn = canvas.captureStream || canvas.mozCaptureStream;
          if (!captureFn) {
            console.warn("Canvas capture not supported");
            setRendering(false);
            return;
          }
          const stream = captureFn.call(canvas, 30);
          const mimeTypes = [
            "video/webm;codecs=vp8",
            "video/webm;codecs=vp9",
            "video/webm",
            "video/mp4"
          ];
          let selectedType = "";
          for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              selectedType = type;
              break;
            }
          }
          console.log("Recorder initialized with:", selectedType || "default browser mime");
          const options = selectedType ? {
            mimeType: selectedType,
            videoBitsPerSecond: 4e6
            // Conservative bitrate for stability
          } : { videoBitsPerSecond: 4e6 };
          try {
            recorder = new MediaRecorder(stream, options);
          } catch (e) {
            console.error("Failed to create MediaRecorder:", e);
            throw e;
          }
          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
              console.log(`Captured chunk: ${e.data.size} bytes`);
            }
          };
          recorder.onstop = () => {
            setRendering(false);
            if (progressTimer) {
              clearInterval(progressTimer);
              progressTimer = null;
            }
            console.log(`Recorder stopped. Total chunks: ${chunks.length}`);
            if (!chunks.length) {
              const msg = "Recording failed: No data chunks captured. Stream may be empty.";
              console.error(msg);
              window.dispatchEvent(new CustomEvent("render-complete", {
                detail: { success: false, error: msg }
              }));
              return;
            }
            const ext = selectedType.includes("mp4") ? "mp4" : "webm";
            setDownloadExt(ext);
            const blob = new Blob(chunks, { type: selectedType || "video/webm" });
            console.log(`Final Blob size: ${blob.size} bytes`);
            if (blob.size < 100) {
              const msg = "Recording failed: Blob too small (empty video).";
              console.error(msg);
              window.dispatchEvent(new CustomEvent("render-complete", {
                detail: { success: false, error: msg }
              }));
              return;
            }
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            window.dispatchEvent(new CustomEvent("render-complete", { detail: { url, success: true } }));
          };
          recorder.onerror = (err) => {
            const msg = "MediaRecorder error: " + (err.error?.message || err.message || JSON.stringify(err));
            console.error(msg, err);
            setRendering(false);
            window.dispatchEvent(new CustomEvent("render-complete", {
              detail: { success: false, error: msg }
            }));
          };
          try {
            recorder.start(1e3);
            console.log("Recorder started with 1000ms timeslice");
          } catch (e) {
            throw new Error("MediaRecorder start failed: " + e.message);
          }
          const startTime = performance.now();
          progressTimer = setInterval(() => {
            const elapsed = performance.now() - startTime;
            const p = totalDurationMs > 0 ? Math.min(1, elapsed / totalDurationMs) : 0;
            setProgress(p);
            window.dispatchEvent(new CustomEvent("render-progress", {
              detail: { progress: p }
            }));
          }, 200);
          recordingTimer = setTimeout(() => {
            if (recorder && recorder.state === "recording") {
              recorder.stop();
            }
          }, totalDurationMs);
        } catch (e) {
          const msg = "Recording process error: " + (e.message || e.toString());
          console.error(msg, e);
          setRendering(false);
          window.dispatchEvent(new CustomEvent("render-complete", {
            detail: { success: false, error: msg }
          }));
        }
      }, 500);
    };
    const handleReady = () => {
      setTimeout(startRecording, 500);
    };
    window.addEventListener("remotion-ready", handleReady);
    const fallbackInterval = setInterval(() => {
      if (started) {
        clearInterval(fallbackInterval);
        return;
      }
      startRecording();
    }, 1e3);
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
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999
  }, children: [
    rendering && /* @__PURE__ */ jsxDEV("div", { style: {
      position: "absolute",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.8)",
      padding: "10px 20px",
      borderRadius: "8px",
      color: "#fff",
      zIndex: 10002,
      fontSize: "20px",
      fontWeight: "bold"
    }, children: [
      "RENDERING REPLAY: ",
      Math.round(progress * 100),
      "%"
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 283,
      columnNumber: 17
    }),
    /* @__PURE__ */ jsxDEV("div", { style: {
      width: "640px",
      height: "360px",
      border: "2px solid #333",
      background: "#000",
      position: "relative",
      boxShadow: "0 0 50px rgba(0,0,0,0.8)",
      zIndex: 1e4
      // Ensure it is on top so browser paints it
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
        lineNumber: 310,
        columnNumber: 17
      }
    ) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 301,
      columnNumber: 13
    }),
    downloadUrl && !rendering && /* @__PURE__ */ jsxDEV("div", { style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.7)",
      zIndex: 10003,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "auto"
      // Re-enable pointer events for this overlay
    }, children: /* @__PURE__ */ jsxDEV("div", { style: {
      background: "#222",
      padding: "40px",
      borderRadius: "20px",
      textAlign: "center",
      border: "2px solid #555"
    }, children: [
      /* @__PURE__ */ jsxDEV("h2", { style: { color: "white", marginBottom: "30px" }, children: "REPLAY READY" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 343,
        columnNumber: 25
      }),
      /* @__PURE__ */ jsxDEV(
        "button",
        {
          onClick: () => triggerDownload(downloadUrl),
          style: {
            padding: "20px 40px",
            fontSize: "24px",
            fontWeight: "bold",
            color: "white",
            background: "#00cc00",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            marginBottom: "20px",
            width: "100%"
          },
          children: "SAVE TO DEVICE"
        },
        void 0,
        false,
        {
          fileName: "<stdin>",
          lineNumber: 344,
          columnNumber: 25
        }
      ),
      /* @__PURE__ */ jsxDEV("br", {}, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 361,
        columnNumber: 25
      }),
      /* @__PURE__ */ jsxDEV(
        "button",
        {
          onClick: () => window.dispatchEvent(new CustomEvent("close-replay")),
          style: {
            padding: "15px 30px",
            fontSize: "18px",
            color: "#aaa",
            background: "transparent",
            border: "2px solid #555",
            borderRadius: "10px",
            cursor: "pointer",
            width: "100%"
          },
          children: "CLOSE"
        },
        void 0,
        false,
        {
          fileName: "<stdin>",
          lineNumber: 362,
          columnNumber: 25
        }
      )
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 336,
      columnNumber: 21
    }) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 326,
      columnNumber: 17
    })
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 262,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 386,
    columnNumber: 29
  }));
}
