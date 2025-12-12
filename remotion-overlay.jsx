import { jsxDEV } from "react/jsx-dev-runtime";
import React from "react";
import { createRoot } from "react-dom/client";
import { RemotionOverlay } from "./RemotionOverlayRoot.jsx";
const rootEl = document.getElementById("remotion-root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(/* @__PURE__ */ jsxDEV(RemotionOverlay, {}, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 12,
    columnNumber: 17
  }));
}
