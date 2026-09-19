import * as vscode from "vscode";
import { compile } from "../../src/compile";
import { renderStormDocument, renderStormHtml, stormSources, STORM_FENCE_LANGS } from "../../src/markdown";
import { slug } from "../../src/slug";

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
  stormBoards = boards;

  context.subscriptions.push(
    boards,
    vscode.commands.registerCommand("eventstorm.exportSvg", (uri?: vscode.Uri) =>
      exportBoardImage(uri, "svg"),
    ),
    vscode.commands.registerCommand("eventstorm.exportPng", (uri?: vscode.Uri) =>
      exportBoardImage(uri, "png"),
    ),
    vscode.commands.registerCommand("eventstorm.preview", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
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
    vscode.commands.registerCommand("eventstorm.previewBoard", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) return;
      boards.show(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      boards.update(event.document);
    }),
  );

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

function isStormFile(doc: vscode.TextDocument): boolean {
  return doc.languageId === "eventstorm" || doc.fileName.endsWith(".storm");
}

function fileKind(doc: vscode.TextDocument): "markdown" | "storm" {
  return isStormFile(doc) ? "storm" : "markdown";
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
  const sourceUri = already?.uri ?? uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!sourceUri) {
    void vscode.window.showInformationMessage("Open a Markdown or .storm file first.");
    return;
  }
  const { text, kind } = already
    ? { text: already.getText(), kind: fileKind(already) }
    : await readExportSource(sourceUri);
  const sources = stormSources(text, kind);
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
    sourceUri.scheme === "untitled" ? vscode.Uri.file(name) : vscode.Uri.joinPath(sourceUri, "..", name);
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: format === "svg" ? { SVG: ["svg"] } : { PNG: ["png"] },
  });
  if (!target) return;

  try {
    const bytes =
      format === "svg"
        ? new TextEncoder().encode(compiled.svg)
        : await rasterizePng(compiled.svg, sourceUri);
    await vscode.workspace.fs.writeFile(target, bytes);
    void vscode.window.showInformationMessage(`Saved ${target.path.split("/").pop()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Could not export ${format.toUpperCase()}: ${message}`);
  }
}

async function readExportSource(uri: vscode.Uri): Promise<{ text: string; kind: "markdown" | "storm" }> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return { text: open.getText(), kind: fileKind(open) };
  const doc = await vscode.workspace.openTextDocument(uri);
  return { text: doc.getText(), kind: fileKind(doc) };
}

async function rasterizePng(svg: string, uri: vscode.Uri): Promise<Uint8Array> {
  let webview = stormBoards?.webviewFor(uri);
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
