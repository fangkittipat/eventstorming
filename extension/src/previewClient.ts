/** Inline webview script: pan/zoom the board and export PNG. No template expressions. */
export const previewClientScript = `
(function () {
  const vscode = typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : { postMessage: function () {} };

  const viewport = document.getElementById("board-viewport");
  const boardEl = document.getElementById("board");
  const resetBtn = document.getElementById("btn-zoom-reset");
  if (!viewport || !boardEl || !resetBtn) return;

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let panning = false;
  let didPan = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  function applyTransform() {
    boardEl.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + zoom + ")";
    resetBtn.textContent = Math.round(zoom * 100) + "%";
  }

  function clampZoom(next) {
    return Math.min(2.2, Math.max(0.15, next));
  }

  function setZoom(next) {
    zoom = clampZoom(next);
    applyTransform();
  }

  function zoomAt(next, cx, cy) {
    const rect = viewport.getBoundingClientRect();
    const x = cx == null ? rect.width / 2 : cx;
    const y = cy == null ? rect.height / 2 : cy;
    const boardX = (x - panX) / zoom;
    const boardY = (y - panY) / zoom;
    const clamped = clampZoom(next);
    panX = x - boardX * clamped;
    panY = y - boardY * clamped;
    setZoom(clamped);
  }

  function fitBoard() {
    const svg = boardEl.querySelector("svg");
    const rect = viewport.getBoundingClientRect();
    if (!svg || rect.width < 2 || rect.height < 2) return;
    const bw = Number(svg.getAttribute("width")) || svg.viewBox.baseVal.width || 960;
    const bh = Number(svg.getAttribute("height")) || svg.viewBox.baseVal.height || 600;
    const pad = 32;
    const next = Math.min((rect.width - pad) / bw, (rect.height - pad) / bh, 1);
    zoom = clampZoom(next);
    panX = (rect.width - bw * zoom) / 2;
    panY = (rect.height - bh * zoom) / 2;
    applyTransform();
  }

  function scheduleFit() {
    requestAnimationFrame(function () {
      requestAnimationFrame(fitBoard);
    });
  }

  viewport.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target && target.closest && target.closest("button")) return;
    event.preventDefault();
    try { viewport.setPointerCapture(event.pointerId); } catch (e) {}
    panning = true;
    didPan = false;
    startX = event.clientX;
    startY = event.clientY;
    originX = panX;
    originY = panY;
  });
  window.addEventListener("pointermove", function (event) {
    if (!panning) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!didPan && dx * dx + dy * dy < 25) return;
    didPan = true;
    viewport.classList.add("is-panning");
    panX = originX + dx;
    panY = originY + dy;
    applyTransform();
  });
  function endPan() {
    panning = false;
    viewport.classList.remove("is-panning");
  }
  window.addEventListener("pointerup", endPan);
  window.addEventListener("pointercancel", endPan);

  viewport.addEventListener("wheel", function (event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect();
      zoomAt(zoom * Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
      return;
    }
    panX -= event.deltaX;
    panY -= event.deltaY;
    applyTransform();
  }, { passive: false });

  document.getElementById("btn-zoom-in").addEventListener("click", function () { zoomAt(zoom + 0.1); });
  document.getElementById("btn-zoom-out").addEventListener("click", function () { zoomAt(zoom - 0.1); });
  resetBtn.addEventListener("click", fitBoard);

  var sourceBtn = document.getElementById("btn-source");
  if (sourceBtn) {
    sourceBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "showSource" });
    });
  }
  var svgBtn = document.getElementById("btn-svg");
  if (svgBtn) svgBtn.addEventListener("click", function () { vscode.postMessage({ type: "exportSvg" }); });
  var pngBtn = document.getElementById("btn-png");
  if (pngBtn) pngBtn.addEventListener("click", function () { vscode.postMessage({ type: "exportPng" }); });

  window.addEventListener("resize", function () {
    if (!didPan) scheduleFit();
  });

  scheduleFit();
  vscode.postMessage({ type: "ready" });

  async function rasterizeSvg(svg) {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise(function (resolve, reject) {
        const image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = function () { reject(new Error("Could not rasterize SVG")); };
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth * 2);
      canvas.height = Math.max(1, img.naturalHeight * 2);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png").replace("data:image/png;base64,", "");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  window.addEventListener("message", async function (event) {
    const msg = event.data || {};
    if (msg.type === "setBoards" && typeof msg.html === "string") {
      boardEl.innerHTML = msg.html;
      if (msg.resetPan) scheduleFit();
      return;
    }
    if (msg.type !== "rasterize" || typeof msg.svg !== "string") return;
    if (window.__esRasterizing) return;
    window.__esRasterizing = true;
    try {
      const data = await rasterizeSvg(msg.svg);
      vscode.postMessage({ type: "pngData", id: msg.id, data: data });
    } catch (err) {
      vscode.postMessage({ type: "exportError", id: msg.id, message: String(err && err.message || err) });
    } finally {
      window.__esRasterizing = false;
    }
  });
})();
`;
