import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { appConfigDir } from "../paths.js";
import { applyJsonPatch, readJson } from "../json.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";

function configPath(): string {
  return resolve(appConfigDir("Claude"), "claude_desktop_config.json");
}

export const claudeDesktop: ToolDetector = {
  id: "claude-desktop",
  displayName: "Claude Desktop",
  detect(): DetectorReport {
    const dir = appConfigDir("Claude");
    if (!existsSync(dir)) return { detected: false };
    const path = configPath();
    const snap = readJson(path);
    const env = (snap.parsed.env as Record<string, string> | undefined) ?? {};
    return {
      detected: true,
      configPath: path,
      currentBaseUrl: env.ANTHROPIC_BASE_URL ?? null,
      notes:
        "Claude Desktop uses its own upstream and does not currently honor ANTHROPIC_BASE_URL for chat. Recorded for future compatibility.",
    };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    const snap = readJson(report.configPath);
    const existingEnv =
      (snap.parsed.env as Record<string, string> | undefined) ?? {};
    const content = applyJsonPatch(snap, {
      note: "Claude Desktop: env for MCP subprocesses spawned by the app",
      set: [
        {
          pathSegments: ["env"],
          value: { ...existingEnv, ANTHROPIC_BASE_URL: ctx.proxyUrl },
        },
      ],
    });
    return [
      {
        kind: "write",
        path: report.configPath,
        content,
        note: "env.ANTHROPIC_BASE_URL (MCP subprocess env)",
      },
    ];
  },
};
