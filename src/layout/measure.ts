import type { Sticky, StickyKind } from "../lang/ast";

const KIND_MIN: Record<StickyKind, { w: number; h: number }> = {
  actor: { w: 72, h: 52 },
  read: { w: 78, h: 72 },
  none: { w: 84, h: 72 },
  hotspot: { w: 108, h: 100 },
  command: { w: 118, h: 112 },
  event: { w: 118, h: 112 },
  aggregate: { w: 118, h: 112 },
  system: { w: 118, h: 112 },
  policy: { w: 122, h: 112 },
};

const WRAP_WIDTH = 148;
const MAX_WIDTH = 280;
const MAX_HEIGHT = 520;

export interface StickyMetrics {
  w: number;
  h: number;
  fontSize: number;
  lines: string[];
  captionLines: string[];
}

export function measureSticky(sticky: Sticky): StickyMetrics {
  const fontSize = fontFor(sticky);
  const charW = fontSize * 0.7;
  const captionCharW = 10 * 0.52;
  const padX = fontSize >= 16 ? 20 : 14;
  const padY = fontSize >= 16 ? 20 : 14;
  const lineH = fontSize + 4;
  const policyH = sticky.kind === "policy" && sticky.policyKind ? 14 : 0;
  const valueH = sticky.value ? 8 : 0;
  const min = KIND_MIN[sticky.kind] ?? KIND_MIN.none;

  let innerW = Math.max(WRAP_WIDTH, min.w - padX * 2);
  let lines = wrapToWidth(sticky.label, charW, innerW);
  let captionLines = sticky.caption ? wrapToWidth(sticky.caption, captionCharW, innerW) : [];

  if (lines.length + captionLines.length > 5) {
    innerW = Math.min(MAX_WIDTH - padX * 2, innerW + 48);
    lines = wrapToWidth(sticky.label, charW, innerW);
    captionLines = sticky.caption ? wrapToWidth(sticky.caption, captionCharW, innerW) : [];
  }

  const textW = Math.max(
    ...lines.map((line) => lineWidth(line, charW)),
    ...captionLines.map((line) => lineWidth(line, captionCharW)),
    24,
  );
  const captionH = captionLines.length ? captionLines.length * 13 + 4 : 0;

  let w = Math.ceil(textW + padX * 2);
  let h = Math.ceil(padY * 2 + policyH + lines.length * lineH + captionH + valueH);
  w = clamp(w, min.w, MAX_WIDTH);
  h = clamp(h, min.h, MAX_HEIGHT);

  if (lines.length >= 2 && sticky.kind !== "actor" && sticky.kind !== "read" && sticky.kind !== "none") {
    const side = clamp(Math.max(w, h, 118), Math.max(min.w, min.h), MAX_WIDTH);
    w = Math.max(w, Math.round(side * 0.98));
    h = Math.max(h, Math.round(side * 0.94));
  }

  const fitH = Math.ceil(padY * 2 + policyH + lines.length * lineH + captionH + valueH);
  h = clamp(Math.max(h, fitH), min.h, MAX_HEIGHT);

  return { w, h, fontSize, lines, captionLines };
}

function fontFor(sticky: Sticky): number {
  const label = sticky.label.trim();
  const n = label.length;
  if (sticky.kind === "actor") return n > 18 ? 13 : 14;
  if (sticky.kind === "read") return n > 22 ? 12 : 13;
  if (sticky.kind === "none") return 12;
  if (n >= 42) return 14;
  if (n >= 26) return 15;
  return 17;
}

export function wrapToWidth(text: string, charW: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    for (const piece of breakWord(word, charW, maxWidth)) {
      const next = current ? `${current} ${piece}` : piece;
      if (lineWidth(next, charW) > maxWidth && current) {
        lines.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function breakWord(word: string, charW: number, maxWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / charW));
  if (word.length <= maxChars) return [word];
  const pieces: string[] = [];
  for (let i = 0; i < word.length; i += maxChars) {
    pieces.push(word.slice(i, i + maxChars));
  }
  return pieces;
}

function lineWidth(line: string, charW: number): number {
  return Math.ceil(line.length * charW);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
