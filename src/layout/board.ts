import type { Board, PathItem, Sticky } from "../lang/ast";
import { isBranch, isSticky } from "../lang/ast";
import { layout as L } from "../render/colors";
import { measureSticky, type StickyMetrics } from "./measure";

export interface PlacedSticky {
  sticky: Sticky;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lines: string[];
  captionLines: string[];
}

export interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathLabel {
  x: number;
  y: number;
  text: string;
}

export interface BoardLayout {
  width: number;
  height: number;
  title: string;
  note?: string;
  labels: PathLabel[];
  stickies: PlacedSticky[];
  arrows: Arrow[];
}

interface Chunk {
  width: number;
  height: number;
  stickies: PlacedSticky[];
  arrows: Arrow[];
  entries: PlacedSticky[];
  exits: PlacedSticky[];
}

interface Anchors {
  entries: PlacedSticky[];
  exits: PlacedSticky[];
}

interface Column {
  width: number;
  height: number;
  entryCount: number;
  exitCount: number;
  place: (x: number, y: number) => Anchors;
}

export function layoutBoard(board: Board): BoardLayout {
  const labels: PathLabel[] = [];
  const stickies: PlacedSticky[] = [];
  const arrows: Arrow[] = [];

  let y = L.header;
  let maxRight = L.minWidth - L.margin;

  for (const path of board.paths) {
    if (path.label) {
      labels.push({ x: L.margin, y, text: path.label });
      y += L.labelH;
    }
    const chunk = layoutItems(path.items);
    offsetChunk(chunk, L.margin, y);
    stickies.push(...chunk.stickies);
    arrows.push(...chunk.arrows);
    maxRight = Math.max(maxRight, L.margin + chunk.width);
    y += Math.max(chunk.height, 84) + L.pathGap;
  }

  const height = Math.max(y + L.margin - L.pathGap + 24, 420);
  const width = Math.max(maxRight + L.margin, L.minWidth);

  return {
    width,
    height,
    title: board.title,
    note: board.note,
    labels,
    stickies,
    arrows,
  };
}

function layoutItems(items: PathItem[]): Chunk {
  if (items.length === 0) {
    return { width: 0, height: 0, stickies: [], arrows: [], entries: [], exits: [] };
  }

  const columns: Column[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (isBranch(item)) {
      const branches: Chunk[] = [];
      while (i < items.length) {
        const next = items[i];
        if (!isBranch(next)) break;
        branches.push(layoutItems(next.items));
        i++;
      }
      columns.push(stackColumn(branches));
      continue;
    }

    if (item.kind === "actor") {
      const actors: Sticky[] = [];
      while (i < items.length && isSticky(items[i]) && items[i].kind === "actor") {
        actors.push(items[i] as Sticky);
        i++;
      }
      const host = items[i];
      if (host && isSticky(host)) {
        columns.push(hostedColumn(host, actors));
        i++;
      } else {
        for (const actor of actors) columns.push(stickyColumn(actor));
      }
      continue;
    }

    if (item.kind === "command" || item.kind === "policy") {
      i++;
      const actors: Sticky[] = [];
      while (i < items.length && isSticky(items[i]) && items[i].kind === "actor") {
        actors.push(items[i] as Sticky);
        i++;
      }
      columns.push(hostedColumn(item, actors));
      continue;
    }

    columns.push(stickyColumn(item));
    i++;
  }

  const height = Math.max(...columns.map((c) => c.height), 0);
  let width = 0;
  for (let c = 0; c < columns.length; c++) {
    width += columns[c].width;
    if (c < columns.length - 1) width += columnGap(columns[c], columns[c + 1]);
  }

  const stickies: PlacedSticky[] = [];
  const arrows: Arrow[] = [];
  const anchors: Anchors[] = [];

  let x = 0;
  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];
    const y = (height - col.height) / 2;
    anchors.push(col.place(x, y));
    if (c < columns.length - 1) x += col.width + columnGap(col, columns[c + 1]);
  }

  for (let c = 0; c < anchors.length - 1; c++) {
    for (const a of anchors[c].exits) {
      for (const b of anchors[c + 1].entries) {
        arrows.push({
          x1: a.x + a.w,
          y1: a.y + a.h / 2,
          x2: b.x,
          y2: b.y + b.h / 2,
        });
      }
    }
  }

  return {
    width,
    height,
    stickies,
    arrows,
    entries: anchors[0]?.entries ?? [],
    exits: anchors[anchors.length - 1]?.exits ?? [],
  };

  function hostedColumn(host: Sticky, actors: Sticky[]): Column {
    const hostM = measureSticky(host);
    const overlays: Array<{
      actor: Sticky;
      metrics: StickyMetrics;
      offset: { dx: number; dy: number };
    }> = [];

    let prev: { dx: number; dy: number; w: number; h: number } | undefined;
    for (const [index, actor] of actors.entries()) {
      const metrics = measureSticky(actor);
      const offset = prev
        ? cascadeOffset(prev, actor.id, index)
        : overlapOffset(hostM, metrics, actor.id);
      overlays.push({ actor, metrics, offset });
      prev = { ...offset, w: metrics.w, h: metrics.h };
    }

    let extraLeft = 0;
    let extraTop = 0;
    let extraRight = 0;
    let extraBottom = 0;
    for (const overlay of overlays) {
      extraLeft = Math.max(extraLeft, Math.max(0, -overlay.offset.dx));
      extraTop = Math.max(extraTop, Math.max(0, -overlay.offset.dy));
      extraRight = Math.max(extraRight, overlay.offset.dx + overlay.metrics.w - hostM.w);
      extraBottom = Math.max(extraBottom, overlay.offset.dy + overlay.metrics.h - hostM.h);
    }

    const width = hostM.w + extraLeft + Math.max(0, extraRight - 10);
    const height = hostM.h + extraTop + extraBottom;

    return {
      width,
      height,
      entryCount: 1,
      exitCount: 1,
      place(px, py) {
        const hostX = px + extraLeft;
        const hostY = py + extraTop;
        const placedHost: PlacedSticky = {
          sticky: host,
          x: hostX,
          y: hostY,
          w: hostM.w,
          h: hostM.h,
          fontSize: hostM.fontSize,
          lines: hostM.lines,
          captionLines: hostM.captionLines,
        };
        stickies.push(placedHost);
        for (const overlay of [...overlays].reverse()) {
          stickies.push({
            sticky: overlay.actor,
            x: hostX + overlay.offset.dx,
            y: hostY + overlay.offset.dy,
            w: overlay.metrics.w,
            h: overlay.metrics.h,
            fontSize: overlay.metrics.fontSize,
            lines: overlay.metrics.lines,
            captionLines: overlay.metrics.captionLines,
          });
        }
        return { entries: [placedHost], exits: [placedHost] };
      },
    };
  }

  function stickyColumn(sticky: Sticky): Column {
    const metrics = measureSticky(sticky);
    const { w, h, fontSize, lines, captionLines } = metrics;
    return {
      width: w,
      height: h,
      entryCount: 1,
      exitCount: 1,
      place(px, py) {
        const placed: PlacedSticky = {
          sticky,
          x: px,
          y: py,
          w,
          h,
          fontSize,
          lines,
          captionLines,
        };
        stickies.push(placed);
        return { entries: [placed], exits: [placed] };
      },
    };
  }

  function stackColumn(branches: Chunk[]): Column {
    const width = Math.max(...branches.map((b) => b.width), 0);
    const height =
      branches.reduce((sum, b) => sum + b.height, 0) +
      L.branchGap * Math.max(branches.length - 1, 0);
    return {
      width,
      height,
      entryCount: branches.reduce((sum, b) => sum + b.entries.length, 0),
      exitCount: branches.reduce((sum, b) => sum + b.exits.length, 0),
      place(px, py) {
        let y = py;
        const entries: PlacedSticky[] = [];
        const exits: PlacedSticky[] = [];
        for (const branch of branches) {
          offsetChunk(branch, px, y);
          stickies.push(...branch.stickies);
          arrows.push(...branch.arrows);
          entries.push(...branch.entries);
          exits.push(...branch.exits);
          y += branch.height + L.branchGap;
        }
        return { entries, exits };
      },
    };
  }
}

function overlapOffset(
  host: StickyMetrics,
  actor: StickyMetrics,
  id: string,
): { dx: number; dy: number } {
  const hash = hashId(id);
  const hangX = [0.55, 0.68, 0.48, 0.62, 0.42, 0.72][hash % 6];
  const hangY = [0.4, 0.48, 0.32, 0.44, 0.36, 0.52][(hash >> 3) % 6];
  const minOverlapX = Math.min(actor.w * 0.5, host.w * 0.45);
  const minOverlapY = Math.min(actor.h * 0.42, host.h * 0.4);
  return {
    dx: clamp(host.w - actor.w * hangX, minOverlapX - actor.w, host.w - minOverlapX),
    dy: clamp(host.h - actor.h * hangY, minOverlapY - actor.h, host.h - minOverlapY),
  };
}

function cascadeOffset(
  prev: { dx: number; dy: number; w: number; h: number },
  id: string,
  index: number,
): { dx: number; dy: number } {
  const hash = hashId(id) + index * 17;
  const stepX = Math.max(22, prev.w * [0.32, 0.38, 0.28, 0.35][hash % 4]);
  const stepY = Math.max(prev.h - 12, prev.h * [0.76, 0.8, 0.72, 0.78][(hash >> 2) % 4]);
  return { dx: prev.dx + stepX, dy: prev.dy + stepY };
}

function hashId(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 33 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function columnGap(left: Column, right: Column): number {
  return left.exitCount > 1 || right.entryCount > 1 ? L.fanGap : L.gap;
}

function offsetChunk(chunk: Chunk, dx: number, dy: number) {
  for (const s of chunk.stickies) {
    s.x += dx;
    s.y += dy;
  }
  for (const a of chunk.arrows) {
    a.x1 += dx;
    a.y1 += dy;
    a.x2 += dx;
    a.y2 += dy;
  }
}

