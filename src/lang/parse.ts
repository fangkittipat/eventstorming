import type {
  Board,
  Diagnostic,
  ParseResult,
  Path,
  PathItem,
  PolicyKind,
  Sticky,
  StickyKind,
} from "./ast";

const STICKY_KINDS = new Set<StickyKind>([
  "actor",
  "command",
  "system",
  "event",
  "read",
  "policy",
  "hotspot",
  "none",
]);

const TOP_LEVEL = new Set(["eventstorming", "note", "path"]);

interface SrcLine {
  n: number;
  indent: number;
  text: string;
  raw: string;
}

interface Phrase {
  text: string;
  closed: boolean;
  col: number;
}

export function parseStorm(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const lines = splitLines(source);
  let i = 0;
  let nextId = 1;

  const board: Board = {
    title: "Untitled board",
    paths: [],
  };

  function peek(): SrcLine | undefined {
    return lines[i];
  }

  function eat(): SrcLine {
    return lines[i++];
  }

  function skipBlanks() {
    while (i < lines.length && lines[i].text === "") i++;
  }

  while (i < lines.length) {
    skipBlanks();
    const line = peek();
    if (!line) break;

    const { kw, rest, col } = splitKeyword(line.text);
    if (kw === "eventstorming") {
      eat();
      board.title = readLabel(rest, line.n, col, diagnostics).text || board.title;
      continue;
    }
    if (kw === "note") {
      eat();
      board.note = readLabel(rest, line.n, col, diagnostics).text;
      continue;
    }
    if (kw === "path") {
      board.paths.push(parsePath(eat()));
      continue;
    }
    if (isItemKeyword(kw)) {
      board.paths.push(parseImplicitPath());
      continue;
    }

    diagnostics.push({
      line: line.n,
      col: 1,
      message: `Unknown keyword "${kw}"`,
      severity: "error",
    });
    eat();
  }

  return { board, diagnostics };

  function parsePath(header: SrcLine): Path {
    const { rest, col } = splitKeyword(header.text);
    const label = readLabel(rest, header.n, col, diagnostics).text;
    return {
      label: label || undefined,
      items: parseBlock(header.indent, true),
      line: header.n,
    };
  }

  function parseImplicitPath(): Path {
    const start = peek();
    return {
      items: parseBlock(-1, false),
      line: start?.n ?? 1,
    };
  }

  function parseBlock(parentIndent: number, allowSameIndent: boolean): PathItem[] {
    const items: PathItem[] = [];

    while (i < lines.length) {
      skipBlanks();
      const line = peek();
      if (!line) break;

      const { kw, rest, col } = splitKeyword(line.text);

      if (TOP_LEVEL.has(kw) && line.indent <= Math.max(parentIndent, 0)) break;
      if (line.indent < parentIndent) break;
      if (line.indent === parentIndent && !allowSameIndent) break;
      if (line.indent === parentIndent && (kw === "branch" || TOP_LEVEL.has(kw))) break;

      if (kw === "branch") {
        eat();
        items.push({
          kind: "branch",
          items: parseBlock(line.indent, false),
          line: line.n,
        });
        continue;
      }

      if (kw === "value+" || kw === "value-") {
        eat();
        attachValue(items, kw, rest, line, col);
        continue;
      }

      if (STICKY_KINDS.has(kw as StickyKind)) {
        eat();
        items.push(parseSticky(kw as StickyKind, rest, line, col));
        continue;
      }

      if (kw === "path" || kw === "eventstorming" || kw === "note") break;

      diagnostics.push({
        line: line.n,
        col: 1,
        message: `Unknown keyword "${kw}"`,
        severity: "error",
      });
      eat();
    }

    return items;
  }

  function parseSticky(
    kind: StickyKind,
    rest: string,
    line: SrcLine,
    col: number,
  ): Sticky {
    let policyKind: PolicyKind | undefined;
    let body = rest;

    if (kind === "policy") {
      const mode = splitKeyword(rest);
      if (mode.kw === "auto" || mode.kw === "person") {
        policyKind = mode.kw;
        body = mode.rest;
      } else {
        policyKind = "auto";
        diagnostics.push({
          line: line.n,
          col,
          message: 'Policy needs "auto" or "person"; defaulting to auto',
          severity: "warning",
        });
      }
    }

    const phrase = readLabel(body, line.n, col, diagnostics);
    return {
      kind,
      id: `s${nextId++}`,
      label: phrase.text || untitled(kind),
      caption: phrase.caption,
      policyKind,
      line: line.n,
    };
  }

  function attachValue(
    items: PathItem[],
    kw: string,
    rest: string,
    line: SrcLine,
    col: number,
  ) {
    const last = lastSticky(items);
    const phrase = readLabel(rest, line.n, col, diagnostics);
    if (!last) {
      diagnostics.push({
        line: line.n,
        col: 1,
        message: `${kw} needs a sticky above it`,
        severity: "error",
      });
      return;
    }
    last.value = {
      sign: kw === "value+" ? "+" : "-",
      label: phrase.text || "value",
      line: line.n,
    };
  }
}

function lastSticky(items: PathItem[]): Sticky | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== "branch") return item;
  }
  return undefined;
}

function untitled(kind: StickyKind): string {
  if (kind === "none") return "nothing happened";
  return kind;
}

function isItemKeyword(kw: string): boolean {
  return (
    STICKY_KINDS.has(kw as StickyKind) ||
    kw === "branch" ||
    kw === "value+" ||
    kw === "value-"
  );
}

function splitLines(source: string): SrcLine[] {
  return source.split(/\r?\n/).map((raw, idx) => {
    const indent = raw.match(/^[\t ]*/)?.[0].replace(/\t/g, "  ").length ?? 0;
    return {
      n: idx + 1,
      indent,
      text: raw.trim(),
      raw,
    };
  });
}

function splitKeyword(text: string): { kw: string; rest: string; col: number } {
  const value = text.match(/^(value[+-])(?:\s+(.*))?$/i);
  if (value) {
    return {
      kw: value[1].toLowerCase(),
      rest: value[2] ?? "",
      col: 1,
    };
  }
  const m = text.match(/^([A-Za-z][\w]*)(?:\s+(.*))?$/);
  if (!m) {
    return { kw: text, rest: "", col: 1 };
  }
  return {
    kw: m[1].toLowerCase(),
    rest: m[2] ?? "",
    col: 1,
  };
}

function readLabel(
  rest: string,
  line: number,
  _col: number,
  diagnostics: Diagnostic[],
): { text: string; caption?: string } {
  const trimmed = rest.trim();
  if (!trimmed) return { text: "" };

  const { phrase: first, rest: after } = takePhrase(trimmed, line, diagnostics);
  if (!after.startsWith(":")) return { text: first.text, caption: undefined };

  const captionSrc = after.slice(1).trim();
  const { phrase: caption } = takePhrase(captionSrc, line, diagnostics);
  return { text: first.text, caption: caption.text || undefined };
}

function takePhrase(
  src: string,
  line: number,
  diagnostics: Diagnostic[],
): { phrase: Phrase; rest: string } {
  if (src.startsWith('"')) {
    const end = src.indexOf('"', 1);
    if (end === -1) {
      diagnostics.push({
        line,
        col: 1,
        message: "Unclosed quote",
        severity: "error",
      });
      return {
        phrase: { text: src.slice(1).trim(), closed: false, col: 1 },
        rest: "",
      };
    }
    return {
      phrase: { text: src.slice(1, end), closed: true, col: 1 },
      rest: src.slice(end + 1).trim(),
    };
  }
  const colon = src.indexOf(" : ");
  if (colon >= 0) {
    return {
      phrase: { text: src.slice(0, colon).trim(), closed: true, col: 1 },
      rest: src.slice(colon).trim(),
    };
  }
  if (src.startsWith(":")) {
    return { phrase: { text: "", closed: true, col: 1 }, rest: src };
  }
  return {
    phrase: { text: src, closed: true, col: 1 },
    rest: "",
  };
}
