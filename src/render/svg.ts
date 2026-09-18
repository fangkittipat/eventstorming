import type { Arrow, BoardLayout, PlacedSticky } from "../layout/board";
import type { StickyKind } from "../lang/ast";
import { colors, layout as L } from "./colors";

const FONT = "ui-sans-serif, system-ui, sans-serif";

export function renderBoard(board: BoardLayout, activeId?: string): string {
  const legend = renderLegend();
  const labels = board.labels
    .map(
      (label) =>
        `<text x="${label.x}" y="${label.y}" font-family="${FONT}" font-size="13" font-weight="700" fill="${colors.ink}">${esc(label.text)}</text>`,
    )
    .join("");

  const arrows = board.arrows.map(renderArrow).join("");
  const stickies = board.stickies
    .map((s) => renderSticky(s, s.sticky.id === activeId))
    .join("");

  const note = board.note
    ? `<text x="${L.margin}" y="64" font-family="${FONT}" font-size="12" fill="${colors.muted}">${esc(board.note)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${board.width} ${board.height}" width="${board.width}" height="${board.height}" role="img" aria-label="${esc(board.title)}">
  <defs>
    <filter id="sticky-shadow" x="-50%" y="-50%" width="200%" height="220%">
      <feOffset in="SourceAlpha" dx="1.2" dy="4.5" result="off"/>
      <feGaussianBlur in="off" stdDeviation="3.2" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" result="shadow"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="sticky-shadow-active" x="-50%" y="-50%" width="200%" height="220%">
      <feOffset in="SourceAlpha" dx="1.4" dy="5" result="off"/>
      <feGaussianBlur in="off" stdDeviation="3.6" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.3 0" result="shadow"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <marker id="storm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 1.5 L 9 5 L 0 8.5" fill="none" stroke="#c2c2c2" stroke-width="1.5" stroke-linejoin="round"/>
    </marker>
  </defs>
  <rect width="${board.width}" height="${board.height}" fill="${colors.paper}"/>
  <text x="${L.margin}" y="42" font-family="${FONT}" font-size="18" font-weight="700" fill="${colors.ink}">${esc(board.title)}</text>
  ${note}
  ${legend}
  ${labels}
  <g fill="none" stroke="#d0d0d0" stroke-width="1.25" marker-end="url(#storm-arrow)">${arrows}</g>
  ${stickies}
</svg>`;
}

function renderLegend(): string {
  const items: Array<{ kind: StickyKind; label: string }> = [
    { kind: "actor", label: "Actor" },
    { kind: "command", label: "Command" },
    { kind: "system", label: "System" },
    { kind: "event", label: "Event" },
    { kind: "read", label: "Read model" },
    { kind: "policy", label: "Policy" },
    { kind: "hotspot", label: "Hot spot" },
  ];
  let x = L.margin;
  const y = 82;
  const parts = items.map((item) => {
    const c = colors[item.kind];
    const node = `<g>
      <rect x="${x}" y="${y}" width="14" height="14" rx="2" fill="${c.fill}" filter="url(#sticky-shadow)"/>
      <text x="${x + 20}" y="${y + 11}" font-family="${FONT}" font-size="11" fill="${colors.ink}">${item.label}</text>
    </g>`;
    x += 24 + item.label.length * 6.6;
    return node;
  });
  return `<g>${parts.join("")}</g>`;
}

function renderArrow(a: Arrow): string {
  if (Math.abs(a.y1 - a.y2) < 1) {
    return `<path d="M${a.x1} ${a.y1} H${a.x2}"/>`;
  }
  const mid = a.x1 + Math.max((a.x2 - a.x1) / 2, 12);
  return `<path d="M${a.x1} ${a.y1} H${mid} V${a.y2} H${a.x2}"/>`;
}

function renderSticky(placed: PlacedSticky, active: boolean): string {
  const { sticky, x, y, w, h } = placed;
  const theme = colors[sticky.kind];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = tilt(sticky.id, sticky.kind);
  const activeClass = active ? " is-active" : "";
  const filter = active ? "url(#sticky-shadow-active)" : "url(#sticky-shadow)";
  const fontSize = w >= 120 ? 17 : 13;
  const lineHeight = fontSize + 3;

  const policyTag =
    sticky.kind === "policy" && sticky.policyKind
      ? `<text x="${cx}" y="${y + 18}" font-family="${FONT}" font-size="9" font-weight="500" fill="${theme.text}" text-anchor="middle">${sticky.policyKind}</text>`
      : "";

  const titleY = policyTag ? cy + 4 : sticky.caption ? cy - 7 : cy + 5;
  const lines = wrap(sticky.label, w - 20, fontSize);
  const title = lines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${titleY + i * lineHeight - ((lines.length - 1) * lineHeight) / 2}" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${theme.text}" text-anchor="middle">${esc(line)}</text>`,
    )
    .join("");

  const caption = sticky.caption
    ? `<text x="${cx}" y="${y + h - 14}" font-family="${FONT}" font-size="10" font-weight="400" fill="${theme.text}" text-anchor="middle">${esc(clip(sticky.caption, w - 18, 10))}</text>`
    : "";

  const value = sticky.value ? renderValue(placed) : "";

  return `<g class="sticky${activeClass}" data-id="${sticky.id}" data-line="${sticky.line}" cursor="pointer" transform="rotate(${angle} ${cx} ${cy})">
    <rect class="note" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${theme.fill}" filter="${filter}"/>
    ${policyTag}${title}${caption}${value}
  </g>`;
}

function renderValue(placed: PlacedSticky): string {
  const mark = placed.sticky.value;
  if (!mark) return "";
  const theme = mark.sign === "+" ? colors.valuePlus : colors.valueMinus;
  const w = Math.max(58, Math.min(placed.w - 10, 12 + mark.label.length * 6.4));
  const h = 22;
  const x = placed.x + placed.w - w + 8;
  const y = placed.y + placed.h - 10;
  const label = `${mark.sign === "+" ? "+" : "−"} ${mark.label}`;
  return `<g data-line="${mark.line}" transform="rotate(4 ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${theme.fill}" filter="url(#sticky-shadow)"/>
    <text x="${x + w / 2}" y="${y + 15}" font-family="${FONT}" font-size="10" font-weight="700" fill="${theme.text}" text-anchor="middle">${esc(label)}</text>
  </g>`;
}

function tilt(id: string, kind: StickyKind): number {
  if (kind === "hotspot") return -3.2;
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const tilts = [-2.1, -1.2, 0.6, 1.8, -0.5, 2.4, -1.7, 1.1];
  return tilts[Math.abs(hash) % tilts.length];
}

function wrap(text: string, maxWidth: number, fontSize: number): string[] {
  const charW = fontSize * 0.58;
  const maxChars = Math.max(8, Math.floor(maxWidth / charW));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = clip(shown[2], maxWidth, fontSize);
  return shown;
}

function clip(text: string, maxWidth: number, fontSize = 10): string {
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * 0.52)));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
