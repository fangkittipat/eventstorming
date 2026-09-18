import type { Board, PathItem, Sticky } from "../lang/ast";
import { isBranch } from "../lang/ast";
import { layout as L } from "../render/colors";
import { measureSticky } from "./measure";

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
    } else {
      columns.push(stickyColumn(item));
      i++;
    }
  }

  const height = Math.max(...columns.map((c) => c.height), 0);
  const width =
    columns.reduce((sum, c) => sum + c.width, 0) +
    L.gap * Math.max(columns.length - 1, 0);

  const stickies: PlacedSticky[] = [];
  const arrows: Arrow[] = [];
  const anchors: Anchors[] = [];

  let x = 0;
  for (const col of columns) {
    const y = (height - col.height) / 2;
    anchors.push(col.place(x, y));
    x += col.width + L.gap;
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

  function stickyColumn(sticky: Sticky): Column {
    const metrics = measureSticky(sticky);
    const { w, h, fontSize, lines, captionLines } = metrics;
    return {
      width: w,
      height: h,
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

