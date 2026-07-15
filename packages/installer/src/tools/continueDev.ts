import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { home } from "../paths.js";
import { applyJsonPatch, readJson } from "../json.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";

// Continue.dev writes to ~/.continue/config.yaml (newer) or config.json (older).
// We handle both; JSON is easier for us to patch idempotently, so we prefer it
// when present. For YAML we upsert a betterprompting-managed block.
function jsonPath(): string { return resolve(home(".continue"), "config.json"); }
function yamlPath(): string { return resolve(home(".continue"), "config.yaml"); }

export const continueDev: ToolDetector = {
  id: "continue",
  displayName: "Continue.dev",
  detect(): DetectorReport {
    if (existsSync(jsonPath())) {
      const snap = readJson(jsonPath());
      const models = (snap.parsed.models as Array<Record<string, any>> | undefined) ?? [];
      const currentBaseUrl =
        models.find((m) => typeof m.apiBase === "string")?.apiBase ?? null;
      return { detected: true, configPath: jsonPath(), currentBaseUrl };
    }
    if (existsSync(yamlPath())) {
      const raw = readFileSync(yamlPath(), "utf8");
      const m = raw.match(/apiBase:\s*["']?([^"'\n]+)/);
      return {
        detected: true,
        configPath: yamlPath(),
        currentBaseUrl: m?.[1] ?? null,
        notes:
          "YAML config detected. Add `apiBase: <proxy>/v1` to each OpenAI-compatible model manually — see docs/clients.md.",
      };
    }
    return { detected: false };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    if (report.configPath.endsWith(".yaml")) {
      // Don't try to patch YAML — too fragile. The doctor step will remind
      // the user; documented in docs/clients.md.
      return [];
    }
    const snap = readJson(report.configPath);
    const models = ((snap.parsed.models as Array<Record<string, any>>) ?? []).map(
      (m) => (m.provider === "openai" ? { ...m, apiBase: ctx.openaiBase } : m)
    );
    const content = applyJsonPatch(snap, {
      note: "Continue.dev: point OpenAI-provider models at Betterprompting",
      set: [{ pathSegments: ["models"], value: models }],
    });
    return [
      {
        kind: "write",
        path: report.configPath,
        content,
        note: "models[*].apiBase for openai provider",
      },
    ];
  },
};
