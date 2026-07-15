import { existsSync } from "node:fs";
import { appConfigDir } from "../paths.js";
import { applyJsonPatch, readJson } from "../json.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";
import { resolve } from "node:path";

// Cursor stores user prefs at <ConfigDir>/Cursor/User/settings.json across
// all platforms (VS Code fork layout).
function settingsPath(): string {
  return resolve(appConfigDir("Cursor"), "User", "settings.json");
}

export const cursor: ToolDetector = {
  id: "cursor",
  displayName: "Cursor",
  detect(): DetectorReport {
    const path = settingsPath();
    if (!existsSync(path)) {
      // Cursor may still be installed but never launched; treat as not-detected
      // for safety — we don't want to create a fresh config for a tool the
      // user doesn't actually have.
      return { detected: false };
    }
    const snap = readJson(path);
    const currentBaseUrl =
      snap.parsed["cursor.general.openAIBaseUrl"] ??
      snap.parsed["cursor.general.betaOpenAIBaseUrl"] ??
      null;
    return { detected: true, configPath: path, currentBaseUrl };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    const snap = readJson(report.configPath);
    const content = applyJsonPatch(snap, {
      note: "Cursor: route OpenAI-compatible calls through Betterprompting",
      set: [
        {
          pathSegments: ["cursor.general.openAIBaseUrl"],
          value: ctx.openaiBase,
        },
      ],
    });
    return [
      {
        kind: "write",
        path: report.configPath,
        content,
        note: "cursor.general.openAIBaseUrl",
      },
    ];
  },
};
