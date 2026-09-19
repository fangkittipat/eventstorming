import type { Diagnostic } from "./lang/ast";
import { lintBoard } from "./lang/lint";
import { parseStorm } from "./lang/parse";
import { layoutBoard, type BoardLayout } from "./layout/board";
import { boardToMermaid } from "./mermaid";
import { renderBoard, type RenderBoardOptions } from "./render/svg";

export interface CompileOptions extends RenderBoardOptions {}

export interface Compiled {
  title: string;
  note?: string;
  diagnostics: Diagnostic[];
  layout: BoardLayout;
  svg: string;
  mermaid: string;
  stickyCount: number;
}

export function compile(source: string, activeIdOrOptions?: string | CompileOptions): Compiled {
  const options: CompileOptions =
    typeof activeIdOrOptions === "string"
      ? { activeId: activeIdOrOptions }
      : (activeIdOrOptions ?? {});
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
    svg: renderBoard(layout, options),
    mermaid: boardToMermaid(parsed.board),
    stickyCount: layout.stickies.length,
  };
}
