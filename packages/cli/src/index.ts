#!/usr/bin/env node
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  getDataDir,
  getDb,
  getDbPath,
  getEvent,
  listEvents,
  getSummary,
} from "@betterprompting/db";
import { startProxy } from "@betterprompting/proxy";
import { analyzeAndStore } from "@betterprompting/analyzer";
import {
  ALL_TOOLS,
  apply as applyInstall,
  buildPlan,
  currentStatus,
  revert as revertInstall,
  summarize,
} from "@betterprompting/installer";

const VERSION = "0.1.0";

interface Args {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parse(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = argv[0] ?? "start";
  if (command.startsWith("-")) {
    command = "start";
  } else {
    argv = argv.slice(1);
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
        flags[k] = argv[++i];
      } else flags[k] = true;
    } else if (a.startsWith("-")) {
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

function help(): void {
  console.log(`betterprompting v${VERSION}

Usage:
  betterprompting [start]                 Start the interceptor proxy (default)
  betterprompting install                 Auto-detect and configure every AI tool
  betterprompting install --dry-run       Print the changes without applying them
  betterprompting install --only <ids>    Configure only the listed tools (comma-sep)
  betterprompting install --force         Override existing base-URL values
  betterprompting install --no-service    Skip auto-start service setup
  betterprompting uninstall               Reverse everything install did
  betterprompting init                    Initialize the local database
  betterprompting doctor                  Print config + health check
  betterprompting events [--limit N]      List recent events
  betterprompting show <event-id>         Print a single event
  betterprompting summary [--days N]      Print usage summary
  betterprompting analyze <event-id>      Run the AI optimizer on an event

Tools recognized by install:
${ALL_TOOLS.map((t) => `  ${t.id.padEnd(16)} ${t.displayName}`).join("\n")}

Environment:
  BETTERPROMPTING_DIR    Data directory  (default ~/.betterprompting)
  ANTHROPIC_UPSTREAM     default https://api.anthropic.com
  OPENAI_UPSTREAM        default https://api.openai.com
  ANTHROPIC_API_KEY      Required for the AI analyzer
`);
}

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

function parseOnly(flag: string | boolean | undefined): string[] | undefined {
  if (typeof flag !== "string") return undefined;
  return flag.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { command, flags, positional } = parse(process.argv.slice(2));

  if (flags.help || flags.h || command === "help") {
    help();
    return;
  }
  if (flags.version || flags.v || command === "version") {
    console.log(VERSION);
    return;
  }

  ensureDataDir();

  switch (command) {
    case "start":
    case "proxy": {
      getDb();
      await startProxy({
        host: typeof flags.host === "string" ? flags.host : undefined,
        port: typeof flags.port === "string" ? Number(flags.port) : undefined,
        logLevel: typeof flags.log === "string" ? flags.log : undefined,
      });
      return;
    }
    case "init": {
      getDb();
      console.log(`Initialized Betterprompting at ${getDataDir()}`);
      console.log(`Database: ${getDbPath()}`);
      return;
    }
    case "install": {
      await runInstall(flags);
      return;
    }
    case "uninstall": {
      runUninstall();
      return;
    }
    case "doctor": {
      doctor();
      return;
    }
    case "events": {
      const limit =
        typeof flags.limit === "string" ? Number(flags.limit) : 20;
      const rows = listEvents({ limit });
      for (const r of rows) {
        console.log(
          `${new Date(r.created_at).toISOString()}  ${r.id}  ${r.client ?? "unknown"
          }  ${r.model ?? "-"}  in=${fmt(r.input_tokens)} out=${fmt(
            r.output_tokens
          )} cache=${fmt(
            (r.cache_read_input_tokens ?? 0) +
              (r.cache_creation_input_tokens ?? 0)
          )}  ${(r.prompt_text ?? "").slice(0, 60).replace(/\s+/g, " ")}`
        );
      }
      return;
    }
    case "show": {
      const id = positional[0];
      if (!id) {
        console.error("Usage: betterprompting show <event-id>");
        process.exit(1);
      }
      const ev = getEvent(id);
      if (!ev) {
        console.error(`No such event: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify(ev, null, 2));
      return;
    }
    case "summary": {
      const days = typeof flags.days === "string" ? Number(flags.days) : 30;
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const s = getSummary(since);
      console.log(
        `Last ${days} days — ${fmt(s.totalEvents)} requests, ${fmt(
          s.totalInputTokens
        )} input + ${fmt(s.totalOutputTokens)} output tokens, cache read ${fmt(
          s.totalCacheReadTokens
        )}, est cost $${s.totalCostUsd.toFixed(4)}`
      );
      for (const r of s.byModel) {
        console.log(`  ${r.model.padEnd(30)} ${fmt(r.count)} reqs  ${fmt(r.tokens)} tokens`);
      }
      return;
    }
    case "analyze": {
      const id = positional[0];
      if (!id) {
        console.error("Usage: betterprompting analyze <event-id>");
        process.exit(1);
      }
      const result = await analyzeAndStore(id);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      console.error(`Unknown command: ${command}`);
      help();
      process.exit(1);
  }
}

async function runInstall(flags: Record<string, string | boolean>): Promise<void> {
  const dryRun = Boolean(flags["dry-run"] ?? flags.n);
  const force = Boolean(flags.force);
  const skipService = Boolean(flags["no-service"]);
  const only = parseOnly(flags.only);
  const port = typeof flags.port === "string" ? Number(flags.port) : undefined;
  const host = typeof flags.host === "string" ? flags.host : undefined;

  const plan = buildPlan({
    proxyHost: host,
    proxyPort: port,
    only,
    force,
    dryRun,
    skipService,
  });

  console.log(summarize(plan));

  if (dryRun) {
    console.log("\n(dry run — no files were written)");
    return;
  }

  const anyEdits =
    plan.entries.some((e) => e.edits.length) ||
    plan.shellEdits.length ||
    plan.serviceEdits.length;
  if (!anyEdits) {
    console.log("\nNothing to do — every detected tool is already configured.");
    return;
  }

  const res = applyInstall(plan);
  console.log(
    `\nWrote ${res.written.length} file(s); deleted ${res.deleted.length}.`
  );
  if (plan.serviceEdits.length) {
    console.log(
      res.serviceActivated
        ? `Auto-start service activated.`
        : `Auto-start service files written. Activate manually if needed (see docs/install.md).`
    );
  }

  const configured = plan.entries.filter((e) => e.status === "will-configure");
  const conflict = plan.entries.filter((e) => e.status === "conflict");
  const alreadyOurs = plan.entries.filter((e) => e.status === "already-configured");
  console.log(
    `\nConfigured: ${configured.length}  · Already ours: ${alreadyOurs.length}  · Conflicts: ${conflict.length}`
  );
  if (conflict.length) {
    console.log(
      "\nConflicts left in place. Re-run with --force to override them:"
    );
    for (const e of conflict) console.log(`  ${e.displayName}: ${e.note ?? ""}`);
  }
  console.log(
    "\nTo capture prompts: restart the affected tools (or open a new shell) so they pick up the new base URL."
  );
}

function runUninstall(): void {
  const res = revertInstall();
  console.log(
    `Restored ${res.restored.length} file(s); removed ${res.removed.length}.`
  );
  if (res.serviceDeactivated) console.log("Auto-start service deactivated.");
  console.log(
    "Existing shells will keep the exports until you open a new shell or `source` your rc."
  );
}

function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dbDir = dirname(getDbPath());
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
}

function doctor(): void {
  const status = currentStatus();
  const info = {
    version: VERSION,
    dataDir: getDataDir(),
    dbPath: getDbPath(),
    anthropicUpstream:
      process.env.ANTHROPIC_UPSTREAM ?? "https://api.anthropic.com",
    openaiUpstream:
      process.env.OPENAI_UPSTREAM ?? "https://api.openai.com",
    analyzerKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    analyzerModel:
      process.env.BETTERPROMPTING_ANALYZER_MODEL ?? "claude-opus-4-7",
    service: {
      installed: status.serviceInstalled,
      path: status.servicePath,
    },
    installTouchedFiles: status.touchedCount,
  };
  console.log(JSON.stringify(info, null, 2));

  console.log("\nDetected tools:");
  for (const tool of ALL_TOOLS) {
    const r = tool.detect();
    const marker = r.detected ? "[✓]" : "[ ]";
    const configured = r.currentBaseUrl ? ` → ${r.currentBaseUrl}` : "";
    console.log(`  ${marker} ${tool.displayName.padEnd(18)}${configured}`);
  }

  if (!info.analyzerKeyConfigured) {
    console.log(
      "\nNote: ANTHROPIC_API_KEY is not set. The AI analyzer will run in heuristics-only mode."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
