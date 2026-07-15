import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { appConfigDir } from "../paths.js";
import { applyJsonPatch, readJson } from "../json.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";

// Cline is a VS Code extension. It reads from the user's VS Code settings.
// We patch the VS Code `settings.json` under the user config dir.
function vscodeSettingsPath(): string {
  return resolve(appConfigDir("Code"), "User", "settings.json");
}

export const cline: ToolDetector = {
  id: "cline",
  displayName: "Cline (VS Code)",
  detect(): DetectorReport {
    const path = vscodeSettingsPath();
    if (!existsSync(path)) return { detected: false };
    const snap = readJson(path);
    const has =
      "cline.openAiBaseUrl" in snap.parsed ||
      "cline.apiProvider" in snap.parsed;
    return {
      detected: has,
      configPath: path,
      currentBaseUrl:
        (snap.parsed["cline.openAiBaseUrl"] as string | undefined) ?? null,
    };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    const snap = readJson(report.configPath);
    const content = applyJsonPatch(snap, {
      note: "Cline: point OpenAI-compatible provider at Betterprompting",
      set: [
        { pathSegments: ["cline.openAiBaseUrl"], value: ctx.openaiBase },
      ],
    });
    return [
      {
        kind: "write",
        path: report.configPath,
        content,
        note: "cline.openAiBaseUrl",
      },
    ];
  },
};
