import type { Sticky, StickyKind } from "../lang/ast";

const MAX_SIDE = 208;
const MAX_LINES = 4;

const KIND_MIN: Record<StickyKind, { w: number; h: number }> = {
  actor: { w: 84, h: 64 },
  read: { w: 78, h: 72 },
  none: { w: 84, h: 72 },
  hotspot: { w: 88, h: 80 },
  command: { w: 96, h: 96 },
  event: { w: 96, h: 96 },
  system: { w: 96, h: 96 },
  policy: { w: 104, h: 96 },
};

export interface StickyMetrics {
  w: number;
  h: number;
  fontSize: number;
  lines: string[];
  captionLines: string[];
}

export function measureSticky(sticky: Sticky): StickyMetrics {
  const fontSize = fontFor(sticky);
  const lines = packLines(sticky.label, fontSize);
  const captionLines = sticky.caption ? packLines(sticky.caption, 10) : [];
  const charW = fontSize * 0.58;
  const captionCharW = 10 * 0.52;
  const textW = Math.max(
    ...lines.map((line) => lineWidth(line, charW)),
    ...captionLines.map((line) => lineWidth(line, captionCharW)),
    24,
  );

  const padX = fontSize >= 16 ? 20 : 14;
  const padY = fontSize >= 16 ? 20 : 14;
  const lineH = fontSize + 4;
  const policyH = sticky.kind === "policy" && sticky.policyKind ? 14 : 0;
  const captionH = captionLines.length ? captionLines.length * 13 + 4 : 0;
  const valueH = sticky.value ? 8 : 0;

  let w = Math.ceil(textW + padX * 2);
  let h = Math.ceil(padY * 2 + policyH + lines.length * lineH + captionH + valueH);

  const min = KIND_MIN[sticky.kind];
  w = clamp(w, min.w, MAX_SIDE);
  h = clamp(h, min.h, MAX_SIDE);

  if (lines.length >= 2 && sticky.kind !== "actor" && sticky.kind !== "read" && sticky.kind !== "none") {
    const side = clamp(Math.max(w, h, 118), Math.max(min.w, min.h), MAX_SIDE);
    w = Math.max(w, Math.round(side * 0.98));
    h = Math.max(h, Math.round(side * 0.94));
  }

  return { w, h, fontSize, lines, captionLines };
}

function fontFor(sticky: Sticky): number {
  const label = sticky.label.trim();
  const n = label.length;
  if (sticky.kind === "actor" || sticky.kind === "read") return n > 22 ? 12 : 13;
  if (sticky.kind === "none") return 12;
  if (n >= 42) return 14;
  if (n >= 26) return 15;
  return 17;
}

function packLines(text: string, fontSize: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  if (words.length === 1) return wrapLongWord(words[0], maxCharsFor(fontSize));

  if (
    words.length === 2 &&
    words.every((word) => word.length <= 12)
  ) {
    return words;
  }

  const total = words.join(" ").length;
  const target =
    total <= 18 ? Math.max(8, Math.ceil(total / 2) + 1) : Math.max(10, Math.ceil(total / 3) + 1);
  return wrapWords(words, target).slice(0, MAX_LINES);
}

function wrapWords(words: string[], maxChars: number): string[] {
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
  return lines;
}

function wrapLongWord(word: string, maxChars: number): string[] {
  if (word.length <= maxChars) return [word];
  const lines: string[] = [];
  for (let i = 0; i < word.length && lines.length < MAX_LINES; i += maxChars) {
    lines.push(word.slice(i, i + maxChars));
  }
  return lines;
}

function maxCharsFor(fontSize: number): number {
  const targetW = 110;
  return Math.max(8, Math.floor(targetW / (fontSize * 0.58)));
}

function lineWidth(line: string, charW: number): number {
  return Math.ceil(line.length * charW);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
