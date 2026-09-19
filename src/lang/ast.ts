export type StickyKind =
  | "actor"
  | "aggregate"
  | "command"
  | "system"
  | "event"
  | "read"
  | "policy"
  | "hotspot"
  | "none";

export type PolicyKind = "auto" | "person";

export interface ValueMark {
  sign: "+" | "-";
  label: string;
  line: number;
}

export interface Sticky {
  kind: StickyKind;
  id: string;
  label: string;
  caption?: string;
  policyKind?: PolicyKind;
  value?: ValueMark;
  line: number;
}

export interface Branch {
  kind: "branch";
  items: PathItem[];
  line: number;
}

export type PathItem = Sticky | Branch;

export interface Path {
  label?: string;
  items: PathItem[];
  line: number;
}

export interface Board {
  title: string;
  note?: string;
  paths: Path[];
}

export interface Diagnostic {
  line: number;
  col: number;
  message: string;
  severity: "error" | "warning";
}

export interface ParseResult {
  board: Board;
  diagnostics: Diagnostic[];
}

export function isSticky(item: PathItem): item is Sticky {
  return item.kind !== "branch";
}

export function isBranch(item: PathItem): item is Branch {
  return item.kind === "branch";
}
