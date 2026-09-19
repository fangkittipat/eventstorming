import type { Board, Branch, PathItem, Sticky, StickyKind } from "./lang/ast";
import { isBranch } from "./lang/ast";
import { colors } from "./render/colors";

export function boardToMermaid(board: Board): string {
  const lines: string[] = ["flowchart LR"];
  const classes = new Set<StickyKind>();
  let seq = 0;
  const nextId = () => `n${seq++}`;

  for (const [pathIndex, path] of board.paths.entries()) {
    const pad = path.label ? "    " : "  ";
    if (path.label) lines.push(`  subgraph p${pathIndex}["${esc(path.label)}"]`);
    emitItems(path.items, lines, classes, nextId, pad);
    if (path.label) lines.push("  end");
  }

  for (const kind of classes) {
    const theme = colors[kind];
    lines.push(`  classDef ${kind} fill:${theme.fill},stroke:#1c1c1c,color:${theme.text}`);
  }

  return `${lines.join("\n")}\n`;
}

function emitItems(
  items: PathItem[],
  lines: string[],
  classes: Set<StickyKind>,
  nextId: () => string,
  pad: string,
): { entries: string[]; exits: string[] } {
  const entries: string[] = [];
  let prev: string[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (isBranch(item)) {
      const group: Branch[] = [];
      while (i < items.length && isBranch(items[i])) {
        group.push(items[i] as Branch);
        i++;
      }
      const heads: string[] = [];
      const tails: string[] = [];
      for (const branch of group) {
        const inner = emitItems(branch.items, lines, classes, nextId, pad);
        heads.push(...inner.entries);
        tails.push(...inner.exits);
      }
      if (entries.length === 0) entries.push(...heads);
      for (const a of prev) for (const b of heads) lines.push(`${pad}${a} --> ${b}`);
      prev = tails;
      continue;
    }

    const id = nextId();
    lines.push(`${pad}${id}${shape(item)}:::${item.kind}`);
    classes.add(item.kind);
    if (entries.length === 0) entries.push(id);
    for (const a of prev) lines.push(`${pad}${a} --> ${id}`);
    prev = [id];
    i++;
  }

  return { entries, exits: prev };
}

function shape(sticky: Sticky): string {
  const label = esc(sticky.label);
  if (sticky.kind === "actor") return `(["${label}"])`;
  if (sticky.kind === "event" || sticky.kind === "hotspot") return `{{"${label}"}}`;
  if (sticky.kind === "policy") return `[["${label}"]]`;
  if (sticky.kind === "read") return `[/"${label}"/]`;
  return `["${label}"]`;
}

function esc(value: string): string {
  return value.replace(/"/g, "'");
}
