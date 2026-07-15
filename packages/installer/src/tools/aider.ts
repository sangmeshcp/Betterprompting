import { existsSync, readFileSync } from "node:fs";
import { home } from "../paths.js";
import { upsertFence, stripFence } from "../fence.js";
import type { DetectorReport, FileEdit, InstallContext, ToolDetector } from "../types.js";

// Aider uses ~/.aider.conf.yml (YAML). Because YAML editing is fragile, we
// upsert a fenced comment block that sets openai-api-base and rely on Aider
// respecting the last-declared value. If the user has an existing
// `openai-api-base:` line outside our fence we leave it in place (conflict)
// and defer to --force.
function configPath(): string {
  return home(".aider.conf.yml");
}

function existingBaseFromRaw(raw: string): string | null {
  const withoutFence = stripFence(raw);
  const m = withoutFence.match(/^\s*openai-api-base:\s*["']?([^"'\n#]+)/m);
  return m?.[1]?.trim() ?? null;
}

export const aider: ToolDetector = {
  id: "aider",
  displayName: "Aider",
  detect(): DetectorReport {
    // Aider is a Python CLI; the config file is only created when the user
    // opts in. Presence of the file is a good detection signal, but Aider
    // may also be installed globally without one. We fall back to checking
    // ~/.aider* — cheap enough.
    const path = configPath();
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      return {
        detected: true,
        configPath: path,
        currentBaseUrl: existingBaseFromRaw(raw),
      };
    }
    return { detected: false };
  },
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[] {
    if (!report.detected || !report.configPath) return [];
    const existing = existsSync(report.configPath)
      ? readFileSync(report.configPath, "utf8")
      : "";
    const body = `openai-api-base: ${ctx.openaiBase}`;
    return [
      {
        kind: "write",
        path: report.configPath,
        content: upsertFence(existing, body),
        note: "openai-api-base (fenced block)",
      },
    ];
  },
};
