import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@websim/remotion/player";
import { ReplayComposition } from "./composition.jsx";
const RemotionOverlay = () => {
  const [replayData, setReplayData] = useState(null);
  useEffect(() => {
    const handleReplay = (e) => {
      console.log("Received replay data", e.detail);
      setReplayData(e.detail);
    };
    window.addEventListener("render-replay", handleReplay);
    return () => window.removeEventListener("render-replay", handleReplay);
  }, []);
  if (!replayData) return null;
  const fps = 30;
  const durationInFrames = Math.max(1, Math.ceil(replayData.duration / 1e3 * fps));
  return /* @__PURE__ */ jsxDEV("div", { style: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.9)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  }, children: [
    /* @__PURE__ */ jsxDEV("div", { style: { color: "white", marginBottom: "1rem", fontSize: "1.5rem" }, children: "REPLAY RENDERING" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 30,
      columnNumber: 13
    }),
    /* @__PURE__ */ jsxDEV("div", { style: { width: "90%", maxWidth: "800px", aspectRatio: "16/9", border: "2px solid #333" }, children: /* @__PURE__ */ jsxDEV(
      Player,
      {
        component: ReplayComposition,
        durationInFrames,
        fps,
        compositionWidth: 1280,
        compositionHeight: 720,
        inputProps: { data: replayData },
        controls: true,
        autoplay: true,
        loop: true,
        style: { width: "100%", height: "100%" }
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 35,
        columnNumber: 17
      }
    ) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 34,
      columnNumber: 13
    }),
    /* @__PURE__ */ jsxDEV(
      "button",
      {
        onClick: () => setReplayData(null),
        style: {
          marginTop: "20px",
          padding: "10px 30px",
          fontSize: "1.2rem",
          background: "#cc0000",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer"
        },
        children: "CLOSE REPLAY"
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 49,
        columnNumber: 13
      }
    )
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 25,
    columnNumber: 9
  });
};
const root = document.getElementById("remotion-root");
if (root) {
  createRoot(root).render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 65,
    columnNumber: 29
  }));
}
