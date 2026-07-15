import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { home, currentPlatform } from "../paths.js";
import { applyJsonPatch, readJson } from "../json.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";

function settingsPath(): string {
  // Zed stores settings under XDG on Linux and ~/.config/zed on macOS as of
  // recent versions (they use ~/.config regardless of OS).
  const p = currentPlatform();
  if (p === "win32") {
    const appdata = process.env.APPDATA;
    return appdata
      ? resolve(appdata, "Zed", "settings.json")
      : home("AppData", "Roaming", "Zed", "settings.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg
    ? resolve(xdg, "zed", "settings.json")
    : home(".config", "zed", "settings.json");
}

export const zed: ToolDetector = {
  id: "zed",
  displayName: "Zed",
  detect(): DetectorReport {
    const path = settingsPath();
    if (!existsSync(path)) return { detected: false };
    const snap = readJson(path);
    const openai =
      (snap.parsed?.language_models as any)?.openai ??
      (snap.parsed?.assistant as any)?.openai ??
      {};
    return {
      detected: true,
      configPath: path,
      currentBaseUrl: (openai.api_url as string | undefined) ?? null,
    };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    const snap = readJson(report.configPath);
    const existing =
      (snap.parsed.language_models as Record<string, any> | undefined) ?? {};
    const patched = {
      ...existing,
      openai: {
        ...(existing.openai ?? {}),
        api_url: ctx.openaiBase,
      },
    };
    const content = applyJsonPatch(snap, {
      note: "Zed: point OpenAI provider at Betterprompting",
      set: [{ pathSegments: ["language_models"], value: patched }],
    });
    return [
      {
        kind: "write",
        path: report.configPath,
        content,
        note: "language_models.openai.api_url",
      },
    ];
  },
};
