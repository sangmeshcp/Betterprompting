import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { home, currentPlatform } from "./paths.js";
import { upsertFence, stripFence } from "./fence.js";
import type { FileEdit, InstallContext } from "./types.js";

// Files that MAY exist as a login shell rc. We upsert into whichever exist,
// plus at least one on each platform even if absent (creating it is fine).
function candidateRcFiles(): string[] {
  const p = currentPlatform();
  if (p === "win32") return [];  // PowerShell handled separately below
  const files = [
    home(".zshrc"),
    home(".bashrc"),
    home(".bash_profile"),
    home(".profile"),
    home(".config", "fish", "config.fish"),
  ];
  const existing = files.filter((f) => existsSync(f));
  if (existing.length) return existing;
  // Nothing exists — create the one for the user's likely shell.
  const shell = String(process.env.SHELL ?? "");
  if (shell.endsWith("zsh")) return [home(".zshrc")];
  if (shell.endsWith("fish")) return [home(".config", "fish", "config.fish")];
  return [home(".bashrc")];
}

function shellBody(ctx: InstallContext, isFish: boolean): string {
  if (isFish) {
    return [
      `# Managed by \`betterprompting install\`. Run \`betterprompting uninstall\` to remove.`,
      `set -x ANTHROPIC_BASE_URL "${ctx.proxyUrl}"`,
      `set -x OPENAI_BASE_URL "${ctx.openaiBase}"`,
    ].join("\n");
  }
  return [
    `# Managed by \`betterprompting install\`. Run \`betterprompting uninstall\` to remove.`,
    `export ANTHROPIC_BASE_URL="${ctx.proxyUrl}"`,
    `export OPENAI_BASE_URL="${ctx.openaiBase}"`,
  ].join("\n");
}

export function planShellEdits(ctx: InstallContext): FileEdit[] {
  const edits: FileEdit[] = [];

  if (currentPlatform() === "win32") {
    const profile =
      process.env.PROFILE ??
      home("Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
    const existing = existsSync(profile) ? readFileSync(profile, "utf8") : "";
    const body = [
      `# Managed by \`betterprompting install\`. Run \`betterprompting uninstall\` to remove.`,
      `$Env:ANTHROPIC_BASE_URL = "${ctx.proxyUrl}"`,
      `$Env:OPENAI_BASE_URL = "${ctx.openaiBase}"`,
    ].join("\n");
    edits.push({
      kind: "write",
      path: profile,
      content: upsertFence(existing, body),
      note: "PowerShell profile",
    });
    return edits;
  }

  for (const rc of candidateRcFiles()) {
    const isFish = rc.endsWith("config.fish");
    const existing = existsSync(rc) ? readFileSync(rc, "utf8") : "";
    const body = shellBody(ctx, isFish);
    edits.push({
      kind: "write",
      path: rc,
      content: upsertFence(existing, body),
      note: `Shell exports (${isFish ? "fish" : "sh"})`,
    });
  }
  return edits;
}

// Used by the uninstaller AND by any tool detector that wants to strip its
// own fenced block on removal.
export function stripFenceFromFile(path: string): FileEdit | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const next = stripFence(raw);
  if (next === raw) return null;
  return next.trim().length
    ? { kind: "write", path, content: next }
    : { kind: "delete", path };
}
