import * as vscode from "vscode";
import { compile } from "../../src/compile";
import { renderStormDocument, renderStormHtml, stormSources, STORM_FENCE_LANGS } from "../../src/markdown";
import { previewClientScript } from "./previewClient";
import { slug } from "../../src/slug";

const PREVIEW_TYPE = "eventstorm.previewEditor";

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
    vscode.window.registerCustomEditorProvider(
      PREVIEW_TYPE,
      new StormPreviewEditorProvider(boards),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true,
      },
    ),
    vscode.commands.registerCommand("eventstorm.exportSvg", (uri?: vscode.Uri) =>
      exportBoardImage(uri, "svg"),
    ),
    vscode.commands.registerCommand("eventstorm.exportPng", (uri?: vscode.Uri) =>
      exportBoardImage(uri, "png"),
    ),
    vscode.commands.registerCommand("eventstorm.preview", async (uri?: vscode.Uri) => {
      const target = uri ?? activeStormUri();
      if (!target) {
        void vscode.window.showInformationMessage("Open a Markdown or .storm file first.");
        return;
      }
      if (target.path.endsWith(".storm")) {
        await vscode.commands.executeCommand("vscode.openWith", target, PREVIEW_TYPE, vscode.ViewColumn.Active);
        return;
      }
      await vscode.commands.executeCommand("markdown.showPreviewToSide");
    }),
    vscode.commands.registerCommand("eventstorm.showSource", async (uri?: vscode.Uri) => {
      const target = uri ?? activeStormUri();
      if (!target) return;
      await vscode.commands.executeCommand("vscode.openWith", target, "default", vscode.ViewColumn.Active);
    }),
    vscode.commands.registerCommand("eventstorm.previewBoard", async () => {
      const target = activeStormUri() ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;
      if (target.path.endsWith(".storm")) {
        await vscode.commands.executeCommand("vscode.openWith", target, PREVIEW_TYPE, vscode.ViewColumn.Beside);
        return;
      }
      const doc =
        vscode.workspace.textDocuments.find((d) => d.uri.toString() === target.toString()) ??
        (await vscode.workspace.openTextDocument(target));
      boards.showPanel(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      boards.update(event.document);
    }),
    registerPreviewAffordances(context),
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

function isStormUri(uri: vscode.Uri | undefined): boolean {
  return uri?.path.endsWith(".storm") === true;
}

function isPreviewTabActive(): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { viewType?: string } | undefined;
  return input?.viewType === PREVIEW_TYPE;
}

function registerPreviewAffordances(_context: vscode.ExtensionContext): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  item.name = "EventStorm";

  const refresh = () => {
    const uri = activeStormUri();
    const storm =
      isStormUri(uri) || vscode.window.activeTextEditor?.document.languageId === "eventstorm" || isPreviewTabActive();
    if (!storm) {
      item.hide();
      return;
    }
    if (isPreviewTabActive()) {
      item.text = "$(go-to-file) Storm";
      item.tooltip = "Show Storm source";
      item.command = "eventstorm.showSource";
    } else {
      item.text = "$(open-preview) Preview";
      item.tooltip = "Show EventStorm board";
      item.command = "eventstorm.preview";
    }
    item.show();
  };

  const lenses = vscode.languages.registerCodeLensProvider(
    [{ language: "eventstorm" }, { pattern: "**/*.storm" }],
    {
      provideCodeLenses(doc) {
        return [
          new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
            title: "$(open-preview) Preview",
            tooltip: "Show the paper-note board",
            command: "eventstorm.preview",
            arguments: [doc.uri],
          }),
        ];
      },
    },
  );

  refresh();
  return vscode.Disposable.from(
    item,
    lenses,
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.window.tabGroups.onDidChangeTabs(refresh),
    vscode.window.tabGroups.onDidChangeTabGroups(refresh),
  );
}

function isStormFile(doc: vscode.TextDocument): boolean {
  return doc.languageId === "eventstorm" || doc.fileName.endsWith(".storm");
}

function fileKind(doc: vscode.TextDocument): "markdown" | "storm" {
  return isStormFile(doc) ? "storm" : "markdown";
}

function activeStormUri(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && (isStormFile(editor.document) || editor.document.languageId === "markdown")) {
    return editor.document.uri;
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as
    | { uri?: vscode.Uri }
    | undefined;
  return input?.uri;
}

function nonceValue(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

function setPreviewActive(active: boolean) {
  void vscode.commands.executeCommand("setContext", "eventstormPreviewActive", active);
}

class StormPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly boards: BoardPreview) {}

  async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return { uri, dispose() {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(document.uri);
    this.boards.attach(doc, webviewPanel);
  }
}

type PreviewSession = {
  panel: vscode.WebviewPanel;
  document: vscode.TextDocument;
  ready: boolean;
  pending?: { html: string; resetPan: boolean };
};

class BoardPreview implements vscode.Disposable {
  private readonly sessions = new Map<string, PreviewSession>();
  private fallback: PreviewSession | undefined;

  webviewFor(uri: vscode.Uri): vscode.Webview | undefined {
    return this.sessions.get(uri.toString())?.panel.webview ?? this.fallback?.panel.webview;
  }

  attach(doc: vscode.TextDocument, panel: vscode.WebviewPanel) {
    const key = doc.uri.toString();
    const session: PreviewSession = { panel, document: doc, ready: false };
    this.sessions.set(key, session);
    panel.webview.options = { enableScripts: true };
    this.bindMessages(session);
    panel.webview.html = previewHtml(doc, panel.webview);
    setPreviewActive(true);
    panel.onDidChangeViewState(() => setPreviewActive(panel.active));
    panel.onDidDispose(() => {
      this.sessions.delete(key);
      setPreviewActive(false);
    });
  }

  showPanel(doc: vscode.TextDocument) {
    if (!this.fallback) {
      const panel = vscode.window.createWebviewPanel(
        "eventstorm.preview",
        "EventStorm",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.fallback = { panel, document: doc, ready: false };
      this.bindMessages(this.fallback);
      panel.onDidDispose(() => {
        this.fallback = undefined;
      });
    }
    this.fallback.document = doc;
    this.fallback.panel.title = `EventStorm: ${doc.fileName.split("/").pop() ?? "preview"}`;
    this.fallback.ready = false;
    this.fallback.panel.webview.html = previewHtml(doc, this.fallback.panel.webview);
    this.fallback.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  update(doc: vscode.TextDocument) {
    const session = this.sessions.get(doc.uri.toString());
    if (session) {
      session.document = doc;
      this.pushBoards(session, false);
    }
    if (this.fallback && this.fallback.document.uri.toString() === doc.uri.toString()) {
      this.fallback.document = doc;
      this.pushBoards(this.fallback, false);
    }
  }

  dispose() {
    for (const session of this.sessions.values()) session.panel.dispose();
    this.fallback?.panel.dispose();
  }

  private bindMessages(session: PreviewSession) {
    session.panel.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message.type === "ready") {
        session.ready = true;
        if (session.pending) {
          void session.panel.webview.postMessage({ type: "setBoards", ...session.pending });
          session.pending = undefined;
        }
        return;
      }
      const current = session.document;
      if (message.type === "showSource") {
        void vscode.commands.executeCommand("vscode.openWith", current.uri, "default", vscode.ViewColumn.Active);
        return;
      }
      if (message.type === "exportSvg") {
        void exportBoardImage(current.uri, "svg", current);
        return;
      }
      if (message.type === "exportPng") {
        void exportBoardImage(current.uri, "png", current);
      }
    });
  }

  private pushBoards(session: PreviewSession, resetPan: boolean) {
    const html = renderStormDocument(session.document.getText(), fileKind(session.document));
    if (!session.ready) {
      session.pending = { html, resetPan };
      return;
    }
    void session.panel.webview.postMessage({ type: "setBoards", html, resetPan });
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
      html, body { margin: 0; height: 100%; background: #ffffff; overflow: hidden; }
      body { display: flex; flex-direction: column; }
      .chrome {
        position: absolute; top: 10px; right: 12px; z-index: 3;
      }
      .zoom { display: flex; gap: 6px; }
      .zoom button {
        appearance: none; border: 1px solid #d0d0d0; background: #ffffff; color: #333;
        height: 28px; min-width: 28px; padding: 0 10px; border-radius: 6px;
        font: 12px ui-sans-serif, system-ui, sans-serif; cursor: pointer;
        box-shadow: 0 1px 2px rgba(0,0,0,.06);
      }
      #board-viewport { flex: 1; min-height: 0; overflow: hidden; cursor: grab; position: relative; user-select: none; touch-action: none; background: #ffffff; }
      #board-viewport.is-panning { cursor: grabbing; }
      #board { transform-origin: 0 0; width: max-content; }
      .eventstorm-board { margin: 0; overflow: visible; }
      .eventstorm-board svg { display: block; overflow: visible; }
      .eventstorm-board svg > rect:first-of-type { fill: #ffffff; }
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
    <div class="chrome">
      <div class="zoom">
        <button type="button" id="btn-zoom-out" aria-label="Zoom out">−</button>
        <button type="button" id="btn-zoom-reset">100%</button>
        <button type="button" id="btn-zoom-in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <div id="board-viewport">
      <div id="board">${boards}</div>
    </div>
    <script nonce="${nonce}">${previewClientScript}</script>
  </body>
</html>`;
}

async function exportBoardImage(
  uri: vscode.Uri | undefined,
  format: "svg" | "png",
  already?: vscode.TextDocument,
): Promise<void> {
  const sourceUri = already?.uri ?? uri ?? activeStormUri();
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
    await vscode.commands.executeCommand("vscode.openWith", uri, PREVIEW_TYPE, vscode.ViewColumn.Beside);
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
