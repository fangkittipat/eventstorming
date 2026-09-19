import { StreamLanguage } from "@codemirror/language";

const KEYWORDS = new Set([
  "eventstorming",
  "note",
  "path",
  "read",
  "actor",
  "aggregate",
  "command",
  "system",
  "event",
  "policy",
  "auto",
  "person",
  "hotspot",
  "none",
  "branch",
]);

export const stormLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^value[+-]/)) return "keyword";
    if (stream.match(/^"(?:[^"\\]|\\.)*("|$)/)) return "string";
    if (stream.match(/^:/)) return "operator";
    if (stream.match(/^[A-Za-z][\w]*/)) {
      const word = stream.current().toLowerCase();
      if (KEYWORDS.has(word)) return "keyword";
      return "variableName";
    }
    stream.next();
    return null;
  },
});
