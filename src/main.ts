import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { compile } from "./compile";
import { stormLanguage } from "./editor/storm";
import { exportPng, exportSvg } from "./export";
import { readHash, shareUrl, writeHash } from "./share";
import createClient from "../samples/create-client.storm?raw";
import orderPlaced from "../samples/order-placed.storm?raw";

const samples = [
  { id: "create-client", name: "Create client", source: createClient },
  { id: "order-placed", name: "Place order", source: orderPlaced },
];

const editorRoot = document.querySelector<HTMLElement>("#editor")!;
const boardEl = document.querySelector<HTMLElement>("#board")!;
const viewport = document.querySelector<HTMLElement>("#board-viewport")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const sampleSelect = document.querySelector<HTMLSelectElement>("#sample-select")!;
const splitter = document.querySelector<HTMLElement>("#splitter")!;
const editorPane = document.querySelector<HTMLElement>(".editor-pane")!;

let zoom = 1;
let panX = 28;
let panY = 28;
let didPan = false;
let lastSvg = "";
let lastTitle = "eventstorm";
let activeId: string | undefined;
let previewTimer = 0;

const initial = readHash() ?? createClient;

sampleSelect.innerHTML = [
  `<option value="">Custom</option>`,
  ...samples.map((s) => `<option value="${s.id}">${s.name}</option>`),
].join("");
syncSampleSelect(initial);

const stormLinter = linter((view) => {
  const compiled = compile(view.state.doc.toString());
  return compiled.diagnostics.map((d) => toCm(view, d));
});

const view = new EditorView({
  parent: editorRoot,
  state: EditorState.create({
    doc: initial,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      lintGutter(),
      stormLinter,
      stormLanguage,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          syncSampleSelect(update.state.doc.toString());
          schedulePreview();
        }
        if (update.selectionSet) pulseFromCursor();
      }),
    ],
  }),
});

renderPreview(true);
bindToolbar();
bindSplitter();
bindPan();
bindBoardClicks();

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => renderPreview(false), 80);
}

function renderPreview(writeInitialHash: boolean) {
  const source = view.state.doc.toString();
  const compiled = compile(source, activeId);
  lastSvg = compiled.svg;
  lastTitle = compiled.title;
  boardEl.innerHTML = compiled.svg.replace(/^<\?xml[^>]*>\s*/, "");
  const errors = compiled.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = compiled.diagnostics.filter((d) => d.severity === "warning").length;
  statusEl.textContent = statusText(compiled.stickyCount, errors, warnings);
  if (writeInitialHash || readHash() !== null) writeHash(source);
  applyZoom();
}

function statusText(stickies: number, errors: number, warnings: number): string {
  const parts = [`${stickies} stickie${stickies === 1 ? "" : "s"}`];
  if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function pulseFromCursor() {
  const line = view.state.doc.lineAt(view.state.selection.main.head).number;
  const compiled = compile(view.state.doc.toString());
  const match = [...compiled.layout.stickies]
    .reverse()
    .find((s) => s.sticky.line <= line || s.sticky.value?.line === line);
  activeId = match?.sticky.id;
  const node = boardEl.querySelector(`[data-id="${activeId}"]`);
  boardEl.querySelectorAll(".is-active").forEach((el) => el.classList.remove("is-active"));
  node?.classList.add("is-active");
}

function bindBoardClicks() {
  boardEl.addEventListener("click", (event) => {
    if (didPan) {
      didPan = false;
      return;
    }
    const target = (event.target as Element).closest("[data-line]");
    if (!target) return;
    const line = Number(target.getAttribute("data-line"));
    if (!line) return;
    const pos = view.state.doc.line(clampLine(line)).from;
    view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true,
    });
    view.focus();
  });
}

function bindToolbar() {
  document.querySelector("#btn-svg")!.addEventListener("click", () => {
    exportSvg(lastSvg, lastTitle);
  });
  document.querySelector("#btn-png")!.addEventListener("click", () => {
    void exportPng(lastSvg, lastTitle);
  });
  document.querySelector("#btn-copy")!.addEventListener("click", async () => {
    const url = shareUrl(view.state.doc.toString());
    await navigator.clipboard.writeText(url);
    statusEl.textContent = "Share URL copied";
  });
  document.querySelector("#btn-zoom-in")!.addEventListener("click", () => zoomAt(zoom + 0.1));
  document.querySelector("#btn-zoom-out")!.addEventListener("click", () => zoomAt(zoom - 0.1));
  document.querySelector("#btn-zoom-reset")!.addEventListener("click", () => {
    panX = 28;
    panY = 28;
    setZoom(1);
  });
  sampleSelect.addEventListener("change", () => {
    const sample = samples.find((s) => s.id === sampleSelect.value);
    if (!sample) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: sample.source },
    });
    window.clearTimeout(previewTimer);
    renderPreview(false);
  });
}

function bindSplitter() {
  let dragging = false;
  splitter.addEventListener("mousedown", () => {
    dragging = true;
    document.body.style.cursor = "col-resize";
  });
  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const rect = document.querySelector(".workspace")!.getBoundingClientRect();
    const width = Math.min(Math.max(event.clientX - rect.left, 240), rect.width - 280);
    editorPane.style.width = `${width}px`;
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.cursor = "";
  });
}

function bindPan() {
  let panning = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  viewport.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    panning = true;
    didPan = false;
    startX = event.clientX;
    startY = event.clientY;
    originX = panX;
    originY = panY;
  });
  window.addEventListener("mousemove", (event) => {
    if (!panning) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!didPan && dx * dx + dy * dy < 25) return;
    didPan = true;
    viewport.classList.add("is-panning");
    panX = originX + dx;
    panY = originY + dy;
    applyZoom();
  });
  window.addEventListener("mouseup", () => {
    panning = false;
    viewport.classList.remove("is-panning");
  });
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = viewport.getBoundingClientRect();
        zoomAt(zoom * Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
        return;
      }
      panX -= event.deltaX;
      panY -= event.deltaY;
      applyZoom();
    },
    { passive: false },
  );
}

function zoomAt(next: number, cx?: number, cy?: number) {
  const rect = viewport.getBoundingClientRect();
  const x = cx ?? rect.width / 2;
  const y = cy ?? rect.height / 2;
  const boardX = (x - panX) / zoom;
  const boardY = (y - panY) / zoom;
  const clamped = Math.min(2.2, Math.max(0.4, next));
  panX = x - boardX * clamped;
  panY = y - boardY * clamped;
  setZoom(clamped);
}

function setZoom(next: number) {
  zoom = Math.min(2.2, Math.max(0.4, next));
  applyZoom();
  document.querySelector("#btn-zoom-reset")!.textContent = `${Math.round(zoom * 100)}%`;
}

function applyZoom() {
  boardEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function syncSampleSelect(source: string) {
  const match = samples.find((s) => s.source.trim() === source.trim());
  sampleSelect.value = match?.id ?? "";
}

function toCm(view: EditorView, d: ReturnType<typeof compile>["diagnostics"][number]): CmDiagnostic {
  const line = view.state.doc.line(clampLine(d.line, view.state.doc.lines));
  return {
    from: line.from,
    to: line.to,
    severity: d.severity,
    message: d.message,
  };
}

function clampLine(line: number, max = view.state.doc.lines): number {
  return Math.min(Math.max(line, 1), max);
}
