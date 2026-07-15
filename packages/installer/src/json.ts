import { existsSync, readFileSync } from "node:fs";
import { SENTINEL_KEY } from "./fence.js";

// Read a JSON config file, tolerating missing files and trailing commas
// (many editor configs allow JSONC). Returns the parsed object AND a
// snapshot we can restore later.
export interface JsonSnapshot {
  path: string;
  existed: boolean;
  original: string | null;
  parsed: Record<string, any>;
}

export function readJson(path: string): JsonSnapshot {
  if (!existsSync(path)) {
    return { path, existed: false, original: null, parsed: {} };
  }
  const raw = readFileSync(path, "utf8");
  const cleaned = stripJsonComments(raw);
  let parsed: Record<string, any> = {};
  try {
    parsed = cleaned.trim() ? JSON.parse(cleaned) : {};
  } catch {
    // If it's malformed we won't touch it — caller can decide.
    parsed = {};
  }
  return { path, existed: true, original: raw, parsed };
}

// Minimal JSONC stripper: removes // and /* */ comments and trailing commas.
// Not exhaustive but handles VS Code / Cursor / Zed configs which are the
// only JSONC we currently deal with.
function stripJsonComments(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < input.length) {
    const c = input[i];
    const n = input[i + 1];
    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        out += c;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && n === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\" && n !== undefined) {
        out += n;
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Strip trailing commas.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

// Merge our fields into a JSON object under a sentinel so we can find & remove
// them later. We record which top-level keys we ADDED (didn't previously
// exist) plus what we changed, so uninstall is exact.
export interface JsonPatch {
  set: Array<{ pathSegments: string[]; value: unknown }>;
  note?: string;
}

export function applyJsonPatch(snapshot: JsonSnapshot, patch: JsonPatch): string {
  const doc = deepClone(snapshot.parsed);
  const previouslyPresent: Record<string, unknown> = {};
  const previouslyAbsent: string[] = [];

  for (const s of patch.set) {
    const topKey = s.pathSegments[0];
    if (!(topKey in doc)) previouslyAbsent.push(topKey);
    else if (!(topKey in previouslyPresent))
      previouslyPresent[topKey] = deepClone(doc[topKey]);
    setDeep(doc, s.pathSegments, s.value);
  }

  const existingSentinel = doc[SENTINEL_KEY] ?? {};
  doc[SENTINEL_KEY] = {
    managed: true,
    version: 1,
    previouslyAbsent: mergeUnique(
      (existingSentinel as any)?.previouslyAbsent ?? [],
      previouslyAbsent
    ),
    previouslyPresent: {
      ...(existingSentinel as any)?.previouslyPresent,
      ...previouslyPresent,
    },
    note: patch.note,
  };

  return JSON.stringify(doc, null, 2) + "\n";
}

// Restore a JSON file from its sentinel. Returns null if no sentinel found.
export function revertJson(currentText: string): string | null {
  let doc: Record<string, any>;
  try {
    doc = JSON.parse(stripJsonComments(currentText));
  } catch {
    return null;
  }
  const sentinel = doc[SENTINEL_KEY];
  if (!sentinel || sentinel.managed !== true) return null;

  for (const key of sentinel.previouslyAbsent ?? []) {
    delete doc[key];
  }
  for (const [key, value] of Object.entries(sentinel.previouslyPresent ?? {})) {
    doc[key] = value;
  }
  delete doc[SENTINEL_KEY];
  return JSON.stringify(doc, null, 2) + "\n";
}

function deepClone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function setDeep(obj: Record<string, any>, segments: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key];
  }
  cur[segments[segments.length - 1]] = value;
}

function mergeUnique<T>(a: T[], b: T[]): T[] {
  const s = new Set<T>([...a, ...b]);
  return Array.from(s);
}
