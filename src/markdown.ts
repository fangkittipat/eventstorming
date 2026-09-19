import { compile } from "./compile";

export const STORM_FENCE_LANGS = new Set(["eventstorm", "storm", "eventstorming"]);

const FENCE_RE = /```(?:eventstorm|storm|eventstorming)[^\n]*\r?\n([\s\S]*?)```/g;

export function hasStormFence(text: string): boolean {
  FENCE_RE.lastIndex = 0;
  return FENCE_RE.test(text);
}

export function stormSources(text: string, fileKind: "markdown" | "storm"): string[] {
  if (fileKind === "storm") {
    const trimmed = text.trim();
    return trimmed ? [text] : [];
  }
  FENCE_RE.lastIndex = 0;
  return [...text.matchAll(new RegExp(FENCE_RE, "g"))].map((match) => match[1] ?? "");
}

export function renderStormHtml(source: string, idPrefix: string): string {
  const compiled = compile(source, { idPrefix, xmlHeader: false });
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  const errorBlock = errors.length
    ? `<pre class="eventstorm-error"><code>${escapeHtml(
        errors.map((d) => `line ${d.line}: ${d.message}`).join("\n"),
      )}</code></pre>`
    : "";
  const board = compiled.stickyCount
    ? `<div class="eventstorm-board">${compiled.svg}</div>`
    : "";
  return errorBlock + board || `<pre class="eventstorm-error"><code>Empty EventStorm board</code></pre>`;
}

export function renderStormDocument(text: string, fileKind: "markdown" | "storm"): string {
  const sources = stormSources(text, fileKind);
  if (sources.length === 0) {
    return `<pre class="eventstorm-error"><code>No eventstorm / storm fence in this file.</code></pre>`;
  }
  return sources.map((source, index) => renderStormHtml(source, `es-${index}`)).join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
