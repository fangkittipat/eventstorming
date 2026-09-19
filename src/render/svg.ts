import type { Arrow, BoardLayout, PlacedSticky } from "../layout/board";
import type { StickyKind } from "../lang/ast";
import { colors, layout as L } from "./colors";

const FONT = "ui-sans-serif, system-ui, sans-serif";

export interface RenderBoardOptions {
  activeId?: string;
  idPrefix?: string;
  xmlHeader?: boolean;
}

interface SvgIds {
  shadow: string;
  shadowActive: string;
  arrow: string;
}

export function renderBoard(board: BoardLayout, options: RenderBoardOptions = {}): string {
  const activeId = options.activeId;
  const ids = svgIds(options.idPrefix ?? "es");
  const header = options.xmlHeader === false ? "" : `<?xml version="1.0" encoding="UTF-8"?>\n`;
  const legend = renderLegend(ids);
  const labels = board.labels
    .map(
      (label) =>
        `<text x="${label.x}" y="${label.y}" font-family="${FONT}" font-size="13" font-weight="700" fill="${colors.ink}">${esc(label.text)}</text>`,
    )
    .join("");

  const arrows = board.arrows.map(renderArrow).join("");
  const stickies = board.stickies
    .map((s) => renderSticky(s, s.sticky.id === activeId, ids))
    .join("");

  const note = board.note
    ? `<text x="${L.margin}" y="64" font-family="${FONT}" font-size="12" fill="${colors.muted}">${esc(board.note)}</text>`
    : "";

  return `${header}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${board.width} ${board.height}" width="${board.width}" height="${board.height}" role="img" aria-label="${esc(board.title)}">
  <defs>
    <filter id="${ids.shadow}" x="-50%" y="-50%" width="200%" height="220%">
      <feOffset in="SourceAlpha" dx="1.2" dy="4.5" result="off"/>
      <feGaussianBlur in="off" stdDeviation="3.2" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" result="shadow"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="${ids.shadowActive}" x="-50%" y="-50%" width="200%" height="220%">
      <feOffset in="SourceAlpha" dx="1.4" dy="5" result="off"/>
      <feGaussianBlur in="off" stdDeviation="3.6" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.3 0" result="shadow"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <marker id="${ids.arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1c1c1c"/>
    </marker>
  </defs>
  <rect width="${board.width}" height="${board.height}" fill="${colors.paper}"/>
  <text x="${L.margin}" y="42" font-family="${FONT}" font-size="18" font-weight="700" fill="${colors.ink}">${esc(board.title)}</text>
  ${note}
  ${legend}
  ${labels}
  <g fill="none" stroke="#1c1c1c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${ids.arrow})">${arrows}</g>
  ${stickies}
</svg>`;
}

function svgIds(prefix: string): SvgIds {
  return {
    shadow: `${prefix}-sticky-shadow`,
    shadowActive: `${prefix}-sticky-shadow-active`,
    arrow: `${prefix}-storm-arrow`,
  };
}

function renderLegend(ids: SvgIds): string {
  const items: Array<{ kind: StickyKind; label: string }> = [
    { kind: "actor", label: "Actor" },
    { kind: "aggregate", label: "Aggregate" },
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
    const c = colors[item.kind] ?? colors.none;
    const node = `<g>
      <rect x="${x}" y="${y}" width="14" height="14" fill="${c.fill}" filter="url(#${ids.shadow})"/>
      <text x="${x + 20}" y="${y + 11}" font-family="${FONT}" font-size="11" fill="${colors.ink}">${item.label}</text>
    </g>`;
    x += 24 + item.label.length * 6.6;
    return node;
  });
  return `<g>${parts.join("")}</g>`;
}

function renderArrow(a: Arrow): string {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
    return `<path d="M${pt(a.x1)} ${pt(a.y1)} L${pt(a.x2)} ${pt(a.y2)}"/>`;
  }
  const dir = dx >= 0 ? 1 : -1;
  const span = Math.abs(dx);
  const pull = Math.min(span * 0.45, 72);
  const peel = Math.min(Math.abs(dy) * 0.22, 32) * Math.sign(dy || 0);
  return `<path d="M${pt(a.x1)} ${pt(a.y1)} C${pt(a.x1 + dir * pull)} ${pt(a.y1 + peel)}, ${pt(a.x2 - dir * pull)} ${pt(a.y2 - peel)}, ${pt(a.x2)} ${pt(a.y2)}"/>`;
}

function pt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function renderSticky(placed: PlacedSticky, active: boolean, ids: SvgIds): string {
  const { sticky, x, y, w, h, fontSize, lines, captionLines } = placed;
  const theme = colors[sticky.kind] ?? colors.none;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = tilt(sticky.id, sticky.kind);
  const activeClass = active ? " is-active" : "";
  const filter = active ? `url(#${ids.shadowActive})` : `url(#${ids.shadow})`;
  const clipId = `${ids.shadow}-clip-${escAttr(sticky.id)}`;
  const lineHeight = fontSize + 4;

  const policyTag =
    sticky.kind === "policy" && sticky.policyKind
      ? `<text x="${cx}" y="${y + 16}" font-family="${FONT}" font-size="9" font-weight="500" fill="${theme.text}" text-anchor="middle">${esc(sticky.policyKind)}</text>`
      : "";

  const captionBlock = captionLines.length * 13;
  const extraTop = policyTag ? 10 : 0;
  const extraBottom = captionBlock ? captionBlock + 2 : 0;
  const titleY =
    y + extraTop + (h - extraTop - extraBottom) / 2 + 5 - ((lines.length - 1) * lineHeight) / 2;

  const title = lines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${titleY + i * lineHeight}" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${theme.text}" text-anchor="middle">${esc(line)}</text>`,
    )
    .join("");

  const caption = captionLines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${y + h - 12 - (captionLines.length - 1 - i) * 13}" font-family="${FONT}" font-size="10" font-weight="400" fill="${theme.text}" text-anchor="middle">${esc(line)}</text>`,
    )
    .join("");

  const value = sticky.value ? renderValue(placed, ids) : "";

  return `<g class="sticky${activeClass}" data-id="${esc(sticky.id)}" data-line="${sticky.line}" cursor="pointer" transform="rotate(${angle} ${cx} ${cy})">
    <defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>
    <rect class="note" x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.fill}" filter="${filter}"/>
    <g clip-path="url(#${clipId})">${policyTag}${title}${caption}</g>${value}
  </g>`;
}

function renderValue(placed: PlacedSticky, ids: SvgIds): string {
  const mark = placed.sticky.value;
  if (!mark) return "";
  const theme = mark.sign === "+" ? colors.valuePlus : colors.valueMinus;
  const w = Math.max(58, Math.min(placed.w - 10, 12 + mark.label.length * 6.4));
  const h = 22;
  const x = placed.x + placed.w - w + 8;
  const y = placed.y + placed.h - 10;
  const label = `${mark.sign === "+" ? "+" : "−"} ${mark.label}`;
  return `<g data-line="${mark.line}" transform="rotate(4 ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.fill}" filter="url(#${ids.shadow})"/>
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

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(value: string): string {
  return esc(value).replace(/[^A-Za-z0-9._-]/g, "_");
}
