import type { Diagnostic, PathItem } from "./ast";
import { isBranch, isSticky } from "./ast";

export function lintBoard(items: PathItem[], into: Diagnostic[] = []): Diagnostic[] {
  walk(items, into);
  return into;
}

function walk(items: PathItem[], diagnostics: Diagnostic[]) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (isBranch(item)) {
      walk(item.items, diagnostics);
      continue;
    }
    if (item.kind === "command") {
      if (!hasInitiator(items, i)) {
        diagnostics.push({
          line: item.line,
          col: 1,
          message: "Command has no actor or policy before it",
          severity: "warning",
        });
      }
    }
    if (item.kind === "event") {
      if (!hasPrecedingCommand(items, i)) {
        diagnostics.push({
          line: item.line,
          col: 1,
          message: "Event has no command before it",
          severity: "warning",
        });
      }
    }
    if (item.kind === "read") {
      if (!leadsToDecision(items, i)) {
        diagnostics.push({
          line: item.line,
          col: 1,
          message: "Read model is not sitting before a decision",
          severity: "warning",
        });
      }
    }
  }
}

function hasInitiator(items: PathItem[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const item = items[i];
    if (isBranch(item)) return true;
    if (item.kind === "actor" || item.kind === "policy") return true;
    if (item.kind === "read" || item.kind === "hotspot") continue;
    if (item.kind === "system" || item.kind === "aggregate") continue;
    return false;
  }
  return false;
}

function hasPrecedingCommand(items: PathItem[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const item = items[i];
    if (isBranch(item)) return false;
    if (item.kind === "command") return true;
    if (
      item.kind === "system" ||
      item.kind === "aggregate" ||
      item.kind === "hotspot" ||
      item.kind === "none"
    ) {
      continue;
    }
    if (item.kind === "event") return false;
  }
  return false;
}

function leadsToDecision(items: PathItem[], index: number): boolean {
  for (let i = index + 1; i < items.length; i++) {
    const item = items[i];
    if (isBranch(item)) return stickyDecision(item.items);
    if (item.kind === "actor" || item.kind === "command" || item.kind === "policy") {
      return true;
    }
    if (item.kind === "hotspot" || item.kind === "read") continue;
    return false;
  }
  return false;
}

function stickyDecision(items: PathItem[]): boolean {
  return items.some(
    (item) =>
      isSticky(item) &&
      (item.kind === "actor" || item.kind === "command" || item.kind === "policy"),
  );
}
