export const FENCE_START = "# >>> betterprompting >>>";
export const FENCE_END = "# <<< betterprompting <<<";

// For file formats where # isn't a comment (e.g. PowerShell uses #, but JSON
// doesn't have comments at all, so JSON files get an object-key sentinel
// instead of a fenced block — see writeJsonWithSentinel below).

export function stripFence(text: string): string {
  const startIdx = text.indexOf(FENCE_START);
  if (startIdx === -1) return text;
  const endIdx = text.indexOf(FENCE_END, startIdx);
  if (endIdx === -1) return text;
  const endOfLine = text.indexOf("\n", endIdx);
  const after = endOfLine === -1 ? "" : text.slice(endOfLine + 1);
  // Remove leading blank line before fence if we're leaving a clean tail.
  let before = text.slice(0, startIdx).replace(/\n+$/, "\n");
  if (!after) before = before.replace(/\n+$/, "");
  return before + after;
}

export function wrapFence(body: string): string {
  return `${FENCE_START}\n${body.trimEnd()}\n${FENCE_END}\n`;
}

// Replace an existing fenced block, or append a new one.
export function upsertFence(text: string, body: string): string {
  const stripped = stripFence(text);
  const sep = stripped.length && !stripped.endsWith("\n") ? "\n\n" : stripped.length ? "\n" : "";
  return stripped + sep + wrapFence(body);
}

export const SENTINEL_KEY = "__betterprompting";
