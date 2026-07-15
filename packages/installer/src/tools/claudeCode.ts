import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { home } from "../paths.js";
import { applyJsonPatch, readJson } from "../json.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";

// Claude Code reads ~/.claude/settings.json. The `env` block is prepended to
// every session, which is exactly what we want — no shell reload required.
function settingsPath(): string {
  return resolve(home(".claude"), "settings.json");
}

// Detection: presence of ~/.claude directory (created on first run).
function claudeDirExists(): boolean {
  return existsSync(home(".claude"));
}

export const claudeCode: ToolDetector = {
  id: "claude-code",
  displayName: "Claude Code",
  detect(): DetectorReport {
    if (!claudeDirExists()) return { detected: false };
    const path = settingsPath();
    const snap = readJson(path);
    const env = (snap.parsed.env as Record<string, string> | undefined) ?? {};
    return {
      detected: true,
      configPath: path,
      currentBaseUrl: env.ANTHROPIC_BASE_URL ?? null,
    };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    const snap = readJson(report.configPath);
    const existingEnv =
      (snap.parsed.env as Record<string, string> | undefined) ?? {};
    const newEnv = {
      ...existingEnv,
      ANTHROPIC_BASE_URL: ctx.proxyUrl,
    };
    const content = applyJsonPatch(snap, {
      note: "Claude Code: route Anthropic API calls through Betterprompting",
      set: [{ pathSegments: ["env"], value: newEnv }],
    });
    return [
      {
        kind: "write",
        path: report.configPath,
        content,
        note: "env.ANTHROPIC_BASE_URL",
      },
    ];
  },
};
