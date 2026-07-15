import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { getDataDir } from "@betterprompting/db";

export interface TouchedFile {
  path: string;
  previousContent: string | null;   // null = did not exist before we touched it
  previousHash: string | null;
  toolId: string;
  timestamp: number;
}

export interface InstallState {
  version: 1;
  touched: TouchedFile[];
  serviceInstalled: boolean;
}

function statePath(): string {
  return resolve(getDataDir(), "install-state.json");
}

export function readState(): InstallState {
  const p = statePath();
  if (!existsSync(p)) {
    return { version: 1, touched: [], serviceInstalled: false };
  }
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as InstallState;
    if (parsed.version !== 1) throw new Error(`Unsupported state version: ${parsed.version}`);
    return parsed;
  } catch (err) {
    throw new Error(`Corrupt install-state at ${p}: ${(err as Error).message}`);
  }
}

export function writeState(s: InstallState): void {
  const p = statePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Idempotently record that we touched a file. If we already have a record for
// this path, keep the ORIGINAL previous content — so uninstall always restores
// to whatever existed before the FIRST time we touched it.
export function recordTouch(
  s: InstallState,
  path: string,
  toolId: string
): InstallState {
  if (s.touched.some((t) => t.path === path)) return s;
  const existed = existsSync(path);
  const previousContent = existed ? readFileSync(path, "utf8") : null;
  const previousHash = previousContent ? sha256(previousContent) : null;
  return {
    ...s,
    touched: [
      ...s.touched,
      { path, previousContent, previousHash, toolId, timestamp: Date.now() },
    ],
  };
}
