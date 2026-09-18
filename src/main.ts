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
const boardSizer = document.querySelector<HTMLElement>("#board-sizer")!;
const viewport = document.querySelector<HTMLElement>("#board-viewport")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const sampleSelect = document.querySelector<HTMLSelectElement>("#sample-select")!;
const splitter = document.querySelector<HTMLElement>("#splitter")!;
const editorPane = document.querySelector<HTMLElement>(".editor-pane")!;

let zoom = 1;
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
  document.querySelector("#btn-zoom-in")!.addEventListener("click", () => setZoom(zoom + 0.1));
  document.querySelector("#btn-zoom-out")!.addEventListener("click", () => setZoom(zoom - 0.1));
  document.querySelector("#btn-zoom-reset")!.addEventListener("click", () => setZoom(1));
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
  let sl = 0;
  let st = 0;
  viewport.addEventListener("mousedown", (event) => {
    if ((event.target as Element).closest(".sticky")) return;
    panning = true;
    viewport.classList.add("is-panning");
    startX = event.clientX;
    startY = event.clientY;
    sl = viewport.scrollLeft;
    st = viewport.scrollTop;
  });
  window.addEventListener("mousemove", (event) => {
    if (!panning) return;
    viewport.scrollLeft = sl - (event.clientX - startX);
    viewport.scrollTop = st - (event.clientY - startY);
  });
  window.addEventListener("mouseup", () => {
    panning = false;
    viewport.classList.remove("is-panning");
  });
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
    },
    { passive: false },
  );
}

function setZoom(next: number) {
  zoom = Math.min(2.2, Math.max(0.4, next));
  applyZoom();
  document.querySelector("#btn-zoom-reset")!.textContent = `${Math.round(zoom * 100)}%`;
}

function applyZoom() {
  const svg = boardEl.querySelector("svg");
  const width = Number(svg?.getAttribute("width") ?? 960);
  const height = Number(svg?.getAttribute("height") ?? 420);
  boardEl.style.transform = `scale(${zoom})`;
  boardSizer.style.width = `${width * zoom + 56}px`;
  boardSizer.style.height = `${height * zoom + 56}px`;
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
