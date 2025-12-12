import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import React, { useState, useEffect } from "react";
import { ThreeJsRecorder } from "./ThreeJsRecorder.jsx";
const RemotionOverlay = () => {
  const [replayData, setReplayData] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const handleReplay = (e) => {
      console.log("Overlay received render-replay", e.detail);
      setReplayData(e.detail);
      setRecordedUrl(null);
      setError(null);
    };
    const handleClose = () => {
      setReplayData(null);
      setRecordedUrl(null);
      setError(null);
    };
    window.addEventListener("render-replay", handleReplay);
    window.addEventListener("close-replay", handleClose);
    return () => {
      window.removeEventListener("render-replay", handleReplay);
      window.removeEventListener("close-replay", handleClose);
    };
  }, []);
  const handleComplete = (url) => {
    setRecordedUrl(url);
    window.dispatchEvent(
      new CustomEvent("render-complete", { detail: { success: true, url } })
    );
  };
  const handleError = (msg) => {
    setError(msg);
    window.dispatchEvent(
      new CustomEvent("render-complete", {
        detail: { success: false, error: msg }
      })
    );
  };
  const downloadVideo = () => {
    if (recordedUrl) {
      const a = document.createElement("a");
      a.href = recordedUrl;
      a.download = `skydrop-replay-${(/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-")}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
  if (!replayData) return null;
  return /* @__PURE__ */ jsxDEV(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 99999,
        pointerEvents: "auto",
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      children: [
        !recordedUrl && !error && /* @__PURE__ */ jsxDEV(
          ThreeJsRecorder,
          {
            data: replayData,
            onComplete: handleComplete,
            onError: handleError
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 79,
            columnNumber: 17
          }
        ),
        (recordedUrl || error) && /* @__PURE__ */ jsxDEV(
          "div",
          {
            style: {
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column"
            },
            children: /* @__PURE__ */ jsxDEV(
              "div",
              {
                style: {
                  background: "#222",
                  padding: "40px",
                  borderRadius: "20px",
                  textAlign: "center",
                  border: "2px solid #555",
                  maxWidth: "500px"
                },
                children: [
                  error ? /* @__PURE__ */ jsxDEV(Fragment, { children: [
                    /* @__PURE__ */ jsxDEV(
                      "h2",
                      {
                        style: {
                          color: "#ff4444",
                          marginBottom: "20px"
                        },
                        children: "RENDER FAILED"
                      },
                      void 0,
                      false,
                      {
                        fileName: "<stdin>",
                        lineNumber: 109,
                        columnNumber: 33
                      }
                    ),
                    /* @__PURE__ */ jsxDEV(
                      "p",
                      {
                        style: {
                          color: "#aaa",
                          marginBottom: "30px",
                          cursor: "pointer",
                          border: "1px solid #444",
                          padding: "10px",
                          borderRadius: "5px"
                        },
                        onClick: () => {
                          if (navigator.clipboard)
                            navigator.clipboard.writeText(error);
                        },
                        title: "Click to copy error",
                        children: [
                          error,
                          /* @__PURE__ */ jsxDEV("br", {}, void 0, false, {
                            fileName: "<stdin>",
                            lineNumber: 133,
                            columnNumber: 37
                          }),
                          /* @__PURE__ */ jsxDEV(
                            "span",
                            {
                              style: {
                                fontSize: "0.8rem",
                                color: "#666"
                              },
                              children: "(Click to copy)"
                            },
                            void 0,
                            false,
                            {
                              fileName: "<stdin>",
                              lineNumber: 134,
                              columnNumber: 37
                            }
                          )
                        ]
                      },
                      void 0,
                      true,
                      {
                        fileName: "<stdin>",
                        lineNumber: 117,
                        columnNumber: 33
                      }
                    )
                  ] }, void 0, true, {
                    fileName: "<stdin>",
                    lineNumber: 108,
                    columnNumber: 29
                  }) : /* @__PURE__ */ jsxDEV(Fragment, { children: [
                    /* @__PURE__ */ jsxDEV(
                      "h2",
                      {
                        style: {
                          color: "white",
                          marginBottom: "30px"
                        },
                        children: "REPLAY READY"
                      },
                      void 0,
                      false,
                      {
                        fileName: "<stdin>",
                        lineNumber: 146,
                        columnNumber: 33
                      }
                    ),
                    /* @__PURE__ */ jsxDEV(
                      "video",
                      {
                        src: recordedUrl,
                        controls: true,
                        autoPlay: true,
                        loop: true,
                        style: {
                          width: "100%",
                          marginBottom: "20px",
                          borderRadius: "8px",
                          border: "1px solid #444"
                        }
                      },
                      void 0,
                      false,
                      {
                        fileName: "<stdin>",
                        lineNumber: 154,
                        columnNumber: 33
                      }
                    ),
                    /* @__PURE__ */ jsxDEV(
                      "button",
                      {
                        onClick: downloadVideo,
                        style: {
                          padding: "15px 30px",
                          fontSize: "20px",
                          fontWeight: "bold",
                          color: "white",
                          background: "#00cc00",
                          border: "none",
                          borderRadius: "10px",
                          cursor: "pointer",
                          marginBottom: "15px",
                          width: "100%"
                        },
                        children: "SAVE TO DEVICE"
                      },
                      void 0,
                      false,
                      {
                        fileName: "<stdin>",
                        lineNumber: 166,
                        columnNumber: 33
                      }
                    )
                  ] }, void 0, true, {
                    fileName: "<stdin>",
                    lineNumber: 145,
                    columnNumber: 29
                  }),
                  /* @__PURE__ */ jsxDEV(
                    "button",
                    {
                      onClick: () => window.dispatchEvent(
                        new CustomEvent("close-replay")
                      ),
                      style: {
                        padding: "15px 30px",
                        fontSize: "16px",
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
                      lineNumber: 185,
                      columnNumber: 25
                    }
                  )
                ]
              },
              void 0,
              true,
              {
                fileName: "<stdin>",
                lineNumber: 97,
                columnNumber: 21
              }
            )
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 87,
            columnNumber: 17
          }
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "<stdin>",
      lineNumber: 63,
      columnNumber: 9
    }
  );
};
export {
  RemotionOverlay
};
