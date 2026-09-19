import * as vscode from "vscode";
import { compile } from "../../src/compile";
import { renderStormDocument, renderStormHtml, stormSources, STORM_FENCE_LANGS } from "../../src/markdown";
import { slug } from "../../src/slug";

const EDITOR_ID = "eventstorm.boardEditor";

let stormEditor: StormEditorProvider;
let stormBoards: BoardPreview;

interface MarkdownItLike {
  renderer: {
    rules: {
      fence?: FenceRule;
    };
  };
}

type FenceRule = (
  tokens: Array<{ info: string; content: string }>,
  idx: number,
  options: unknown,
  env: { eventstormId?: number },
  self: { renderToken: (tokens: unknown, idx: number, options: unknown) => string },
) => string;

export function activate(context: vscode.ExtensionContext) {
  const boards = new BoardPreview();
  const editor = new StormEditorProvider();

  stormBoards = boards;
  stormEditor = editor;

  const exportSvg = vscode.commands.registerCommand("eventstorm.exportSvg", (uri?: vscode.Uri) =>
    exportBoardImage(uri, "svg"),
  );
  const exportPng = vscode.commands.registerCommand("eventstorm.exportPng", (uri?: vscode.Uri) =>
    exportBoardImage(uri, "png"),
  );

  context.subscriptions.push(
    boards,
    exportSvg,
    exportPng,
    vscode.window.registerCustomEditorProvider(EDITOR_ID, editor, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand("eventstorm.preview", async (uri?: vscode.Uri) => {
      const target = uri ?? activeStormUri() ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showInformationMessage("Open a Markdown or .storm file first.");
        return;
      }
      if (target.path.endsWith(".storm")) {
        const doc =
          vscode.workspace.textDocuments.find((d) => d.uri.toString() === target.toString()) ??
          (await vscode.workspace.openTextDocument(target));
        await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
        boards.show(doc, true);
        return;
      }
      await vscode.commands.executeCommand("markdown.showPreviewToSide");
    }),
    vscode.commands.registerCommand("eventstorm.openSource", async (uri?: vscode.Uri) => {
      const target = uri ?? activeStormUri();
      if (!target) return;
      await vscode.commands.executeCommand("vscode.openWith", target, "default");
    }),
    vscode.commands.registerCommand("eventstorm.previewBoard", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) return;
      boards.show(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      boards.update(event.document);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      maybeShowStormBoard(editor, boards);
    }),
  );

  maybeShowStormBoard(vscode.window.activeTextEditor, boards);

  return {
    extendMarkdownIt(md: MarkdownItLike) {
      const defaultFence: FenceRule =
        md.renderer.rules.fence ??
        ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const lang = tokens[idx].info.trim().split(/\s+/)[0] ?? "";
        if (!STORM_FENCE_LANGS.has(lang)) {
          return defaultFence(tokens, idx, options, env, self);
        }
        const idPrefix = `es-${env.eventstormId ?? 0}`;
        env.eventstormId = (env.eventstormId ?? 0) + 1;
        return renderStormHtml(tokens[idx].content, idPrefix);
      };

      return md;
    },
  };
}

export function deactivate() {}

function activeStormUri(): vscode.Uri | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const input = tab?.input as { uri?: vscode.Uri } | undefined;
  if (input?.uri?.path.endsWith(".storm")) return input.uri;
  const doc = vscode.window.activeTextEditor?.document;
  if (doc?.fileName.endsWith(".storm")) return doc.uri;
  return undefined;
}

function maybeShowStormBoard(editor: vscode.TextEditor | undefined, boards: BoardPreview) {
  const doc = editor?.document;
  if (!doc || !isStormFile(doc)) return;
  boards.show(doc, true);
}

function isStormFile(doc: vscode.TextDocument): boolean {
  return doc.languageId === "eventstorm" || doc.fileName.endsWith(".storm");
}

function fileKind(doc: vscode.TextDocument): "markdown" | "storm" {
  return isStormFile(doc) ? "storm" : "markdown";
}

class StormEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly webviews = new Map<string, vscode.Webview>();

  webviewFor(uri: vscode.Uri): vscode.Webview | undefined {
    return this.webviews.get(uri.toString());
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = editorHtml(document, webviewPanel.webview);
    this.webviews.set(document.uri.toString(), webviewPanel.webview);

    const change = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      void webviewPanel.webview.postMessage({
        type: "update",
        text: event.document.getText(),
        board: renderStormDocument(event.document.getText(), "storm"),
      });
    });

    webviewPanel.webview.onDidReceiveMessage((message: { type?: string; text?: string }) => {
      if (message.type === "exportSvg") {
        void exportBoardImage(document.uri, "svg", document);
        return;
      }
      if (message.type === "exportPng") {
        void exportBoardImage(document.uri, "png", document);
        return;
      }
      if (message.type !== "edit" || typeof message.text !== "string") return;
      const last = document.lineAt(Math.max(document.lineCount - 1, 0));
      const range = new vscode.Range(new vscode.Position(0, 0), last.range.end);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, message.text);
      void vscode.workspace.applyEdit(edit);
    });

    webviewPanel.onDidDispose(() => {
      this.webviews.delete(document.uri.toString());
      change.dispose();
    });
  }
}

function editorHtml(document: vscode.TextDocument, webview: vscode.Webview): string {
  const nonce = nonceValue();
  const payload = {
    text: document.getText(),
    board: renderStormDocument(document.getText(), "storm"),
  };
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8"/>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src data: blob:; script-src 'nonce-${nonce}';"/>
    <style>
      html, body { height: 100%; margin: 0; background: #1e1f24; color: #ececec; font: 13px ui-sans-serif, system-ui, sans-serif; }
      body { display: grid; grid-template-rows: 36px 1fr; }
      .bar { display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid #2c2e34; background: #1b1c20; }
      .bar button { appearance: none; border: 1px solid #2c2e34; background: #101114; color: #ececec; height: 24px; padding: 0 8px; border-radius: 4px; font: inherit; cursor: pointer; }
      .bar button.is-on { border-color: #ffb74d; color: #ffb74d; }
      .bar .spacer { flex: 1; }
      .work { display: grid; grid-template-columns: minmax(240px, 42%) 6px 1fr; min-height: 0; }
      body.is-board .work { grid-template-columns: 1fr; }
      body.is-board .source, body.is-board .split { display: none; }
      .source { display: flex; min-width: 0; min-height: 0; }
      textarea { flex: 1; resize: none; border: 0; outline: none; padding: 12px 14px; background: #1e1f24; color: #ececec; font: 13.5px ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.45; tab-size: 2; }
      .split { background: #2c2e34; cursor: col-resize; }
      .board-wrap { position: relative; min-width: 0; background: #cfc6b3; overflow: hidden; touch-action: none; }
      .zoom { position: absolute; top: 10px; right: 10px; z-index: 2; display: flex; gap: 6px; }
      .zoom button { width: 28px; height: 28px; border: 1px solid #5b5448; background: #2b2721; color: #f4efe4; border-radius: 6px; cursor: pointer; }
      .scene { width: 100%; height: 100%; cursor: grab; touch-action: none; overscroll-behavior: none; }
      .scene.is-panning { cursor: grabbing; }
      .scene .eventstorm-board { padding: 20px; }
      .eventstorm-board svg { display: block; max-width: none; height: auto; }
      .eventstorm-error { margin: 16px; padding: 12px 14px; background: #2a1f1f; color: #f3c6c6; border: 1px solid #6b3a3a; white-space: pre-wrap; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <div class="bar">
      <button type="button" id="btn-split" class="is-on">Split</button>
      <button type="button" id="btn-board">Board</button>
      <span class="spacer"></span>
      <button type="button" id="btn-svg">SVG</button>
      <button type="button" id="btn-png">PNG</button>
      <span>EventStorm</span>
    </div>
    <div class="work">
      <div class="source"><textarea id="source" spellcheck="false"></textarea></div>
      <div class="split" id="split"></div>
      <div class="board-wrap">
        <div class="zoom">
          <button type="button" id="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" id="zoom-reset">100%</button>
          <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
        </div>
        <div class="scene" id="scene"></div>
      </div>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const source = document.getElementById("source");
      const scene = document.getElementById("scene");
      const zoomReset = document.getElementById("zoom-reset");
      let applying = false;
      let zoom = 1;
      let panX = 20;
      let panY = 20;
      let timer = 0;

      function setBoard(html) {
        scene.innerHTML = html;
        applyView();
      }
      function applyView() {
        const root = scene.querySelector(".eventstorm-board") || scene.firstElementChild;
        if (!root) return;
        root.style.transformOrigin = "0 0";
        root.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + zoom + ")";
        zoomReset.textContent = Math.round(zoom * 100) + "%";
      }
      function clampZoom(value) {
        return Math.min(2.4, Math.max(0.35, value));
      }
      function zoomAtClient(clientX, clientY, next) {
        const rect = scene.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const z = clampZoom(next);
        panX = x - ((x - panX) / zoom) * z;
        panY = y - ((y - panY) / zoom) * z;
        zoom = z;
        applyView();
      }

      const initial = ${JSON.stringify(payload)};
      source.value = initial.text;
      setBoard(initial.board);

      source.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          vscode.postMessage({ type: "edit", text: source.value });
        }, 80);
      });

      window.addEventListener("message", (event) => {
        const msg = event.data || {};
        if (msg.type !== "update") return;
        applying = true;
        if (typeof msg.text === "string" && msg.text !== source.value && document.activeElement !== source) {
          source.value = msg.text;
        }
        if (typeof msg.board === "string") setBoard(msg.board);
        applying = false;
      });

      document.getElementById("btn-split").addEventListener("click", () => {
        document.body.classList.remove("is-board");
        document.getElementById("btn-split").classList.add("is-on");
        document.getElementById("btn-board").classList.remove("is-on");
      });
      document.getElementById("btn-board").addEventListener("click", () => {
        document.body.classList.add("is-board");
        document.getElementById("btn-board").classList.add("is-on");
        document.getElementById("btn-split").classList.remove("is-on");
      });
      document.getElementById("zoom-in").addEventListener("click", () => { zoomAtClient(scene.clientWidth / 2, scene.clientHeight / 2, zoom + 0.1); });
      document.getElementById("zoom-out").addEventListener("click", () => { zoomAtClient(scene.clientWidth / 2, scene.clientHeight / 2, zoom - 0.1); });
      zoomReset.addEventListener("click", () => { zoom = 1; panX = 20; panY = 20; applyView(); });
      document.getElementById("btn-svg").addEventListener("click", () => vscode.postMessage({ type: "exportSvg" }));
      document.getElementById("btn-png").addEventListener("click", () => vscode.postMessage({ type: "exportPng" }));
${rasterizeClientScript()}

      let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
      scene.addEventListener("mousedown", (event) => {
        if (event.target.closest("textarea")) return;
        panning = true;
        scene.classList.add("is-panning");
        sx = event.clientX; sy = event.clientY; ox = panX; oy = panY;
      });
      window.addEventListener("mousemove", (event) => {
        if (!panning) return;
        panX = ox + event.clientX - sx;
        panY = oy + event.clientY - sy;
        applyView();
      });
      window.addEventListener("mouseup", () => {
        panning = false;
        scene.classList.remove("is-panning");
      });
      scene.addEventListener("wheel", (event) => {
        event.preventDefault();
        const pinch = event.ctrlKey || event.metaKey;
        if (pinch) {
          zoomAtClient(event.clientX, event.clientY, zoom * Math.exp(-event.deltaY * 0.01));
          return;
        }
        panX -= event.deltaX;
        panY -= event.deltaY;
        applyView();
      }, { passive: false });
      let pinch0 = 1;
      scene.addEventListener("gesturestart", (event) => {
        event.preventDefault();
        pinch0 = zoom;
      });
      scene.addEventListener("gesturechange", (event) => {
        event.preventDefault();
        zoomAtClient(event.clientX, event.clientY, pinch0 * event.scale);
      });
    </script>
  </body>
</html>`;
}

function nonceValue(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

class BoardPreview implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private document: vscode.TextDocument | undefined;

  webviewFor(uri: vscode.Uri): vscode.Webview | undefined {
    if (!this.panel || this.document?.uri.toString() !== uri.toString()) return undefined;
    return this.panel.webview;
  }

  show(doc: vscode.TextDocument, preserveFocus = false) {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "eventstorm.preview",
        "EventStorm",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.webview.onDidReceiveMessage((message: { type?: string }) => {
        const current = this.document;
        if (!current) return;
        if (message.type === "exportSvg") {
          void exportBoardImage(current.uri, "svg", current);
          return;
        }
        if (message.type === "exportPng") {
          void exportBoardImage(current.uri, "png", current);
        }
      });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.document = undefined;
      });
    }
    this.document = doc;
    this.panel.title = `EventStorm: ${doc.fileName.split("/").pop() ?? "preview"}`;
    this.panel.webview.html = previewHtml(doc, this.panel.webview);
    this.panel.reveal(vscode.ViewColumn.Beside, preserveFocus);
  }

  update(doc: vscode.TextDocument) {
    if (!this.panel || this.document?.uri.toString() !== doc.uri.toString()) return;
    this.document = doc;
    this.panel.webview.html = previewHtml(doc, this.panel.webview);
  }

  dispose() {
    this.panel?.dispose();
  }
}

function previewHtml(doc: vscode.TextDocument, webview: vscode.Webview): string {
  const nonce = nonceValue();
  const boards = renderStormDocument(doc.getText(), fileKind(doc));
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8"/>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src data: blob:; script-src 'nonce-${nonce}';"/>
    <style>
      html, body { margin: 0; padding: 0; background: #cfc6b3; }
      .bar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 12px; background: linear-gradient(#cfc6b3, #cfc6b3 70%, transparent); }
      .bar button { appearance: none; border: 1px solid #5b5448; background: #2b2721; color: #f4efe4; height: 28px; padding: 0 10px; border-radius: 6px; font: 12px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
      .eventstorm-board { margin: 16px; overflow-x: auto; }
      .eventstorm-board svg { display: block; max-width: 100%; height: auto; }
      .eventstorm-error {
        margin: 16px;
        padding: 12px 14px;
        background: #2a1f1f;
        color: #f3c6c6;
        border: 1px solid #6b3a3a;
        white-space: pre-wrap;
        font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    </style>
  </head>
  <body>
    <div class="bar">
      <button type="button" id="btn-svg">SVG</button>
      <button type="button" id="btn-png">PNG</button>
    </div>
    ${boards}
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      document.getElementById("btn-svg").addEventListener("click", () => vscode.postMessage({ type: "exportSvg" }));
      document.getElementById("btn-png").addEventListener("click", () => vscode.postMessage({ type: "exportPng" }));
${rasterizeClientScript()}
    </script>
  </body>
</html>`;
}

function rasterizeClientScript(): string {
  return `
      async function rasterizeSvg(svg) {
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        try {
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Could not rasterize SVG"));
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
      window.addEventListener("message", async (event) => {
        const msg = event.data || {};
        if (msg.type !== "rasterize" || typeof msg.svg !== "string") return;
        if (window.__esRasterizing) return;
        window.__esRasterizing = true;
        try {
          const data = await rasterizeSvg(msg.svg);
          vscode.postMessage({ type: "pngData", id: msg.id, data });
        } catch (err) {
          vscode.postMessage({ type: "exportError", id: msg.id, message: String(err && err.message || err) });
        } finally {
          window.__esRasterizing = false;
        }
      });
`;
}

async function exportBoardImage(
  uri: vscode.Uri | undefined,
  format: "svg" | "png",
  already?: vscode.TextDocument,
): Promise<void> {
  const doc = already ?? (await resolveExportDocument(uri));
  if (!doc) {
    void vscode.window.showInformationMessage("Open a Markdown or .storm file first.");
    return;
  }
  const sources = stormSources(doc.getText(), fileKind(doc));
  if (sources.length === 0) {
    void vscode.window.showErrorMessage("No EventStorm board in this file.");
    return;
  }
  const compiled = compile(sources[0], { xmlHeader: true, idPrefix: "export" });
  if (!compiled.stickyCount) {
    void vscode.window.showErrorMessage("The EventStorm board is empty.");
    return;
  }
  const name = `${slug(compiled.title)}.${format}`;
  const defaultUri =
    doc.uri.scheme === "untitled" ? vscode.Uri.file(name) : vscode.Uri.joinPath(doc.uri, "..", name);
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: format === "svg" ? { SVG: ["svg"] } : { PNG: ["png"] },
  });
  if (!target) return;

  try {
    const bytes =
      format === "svg"
        ? new TextEncoder().encode(compiled.svg)
        : await rasterizePng(compiled.svg, doc.uri);
    await vscode.workspace.fs.writeFile(target, bytes);
    void vscode.window.showInformationMessage(`Saved ${target.path.split("/").pop()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Could not export ${format.toUpperCase()}: ${message}`);
  }
}

async function resolveExportDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (uri) {
    return (
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString()) ??
      vscode.workspace.openTextDocument(uri)
    );
  }
  const active = vscode.window.activeTextEditor?.document;
  if (active && (isStormFile(active) || active.languageId === "markdown" || active.fileName.endsWith(".md"))) {
    return active;
  }
  const stormUri = activeStormUri();
  if (stormUri) {
    return (
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === stormUri.toString()) ??
      vscode.workspace.openTextDocument(stormUri)
    );
  }
  return undefined;
}

function rasterWebview(uri: vscode.Uri): vscode.Webview | undefined {
  return stormEditor?.webviewFor(uri) ?? stormBoards?.webviewFor(uri);
}

async function rasterizePng(svg: string, uri: vscode.Uri): Promise<Uint8Array> {
  let webview = rasterWebview(uri);
  if (!webview) {
    const doc =
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString()) ??
      (await vscode.workspace.openTextDocument(uri));
    stormBoards.show(doc, true);
    webview = stormBoards.webviewFor(uri);
  }
  if (!webview) throw new Error("Open the EventStorm board to export PNG");
  return requestPng(webview, svg);
}

function requestPng(webview: vscode.Webview, svg: string): Promise<Uint8Array> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const sub = webview.onDidReceiveMessage(
      (msg: { type?: string; id?: string; data?: string; message?: string }) => {
        if (msg.id !== id) return;
        if (msg.type === "pngData" && typeof msg.data === "string") {
          cleanup();
          resolve(Uint8Array.from(Buffer.from(msg.data, "base64")));
        } else if (msg.type === "exportError") {
          cleanup();
          reject(new Error(msg.message ?? "PNG export failed"));
        }
      },
    );
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("PNG export timed out"));
    }, 12000);
    const retry = setInterval(() => {
      void webview.postMessage({ type: "rasterize", id, svg });
    }, 200);
    void webview.postMessage({ type: "rasterize", id, svg });
    function cleanup() {
      sub.dispose();
      clearTimeout(timeout);
      clearInterval(retry);
    }
  });
}
