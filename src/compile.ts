import type { Diagnostic } from "./lang/ast";
import { lintBoard } from "./lang/lint";
import { parseStorm } from "./lang/parse";
import { layoutBoard, type BoardLayout } from "./layout/board";
import { renderBoard } from "./render/svg";

export interface Compiled {
  title: string;
  note?: string;
  diagnostics: Diagnostic[];
  layout: BoardLayout;
  svg: string;
  stickyCount: number;
}

export function compile(source: string, activeId?: string): Compiled {
  const parsed = parseStorm(source);
  const diagnostics = [...parsed.diagnostics];
  for (const path of parsed.board.paths) {
    lintBoard(path.items, diagnostics);
  }
  const layout = layoutBoard(parsed.board);
  return {
    title: parsed.board.title,
    note: parsed.board.note,
    diagnostics,
    layout,
    svg: renderBoard(layout, activeId),
    stickyCount: layout.stickies.length,
  };
}
