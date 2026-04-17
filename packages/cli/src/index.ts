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
  // eslint-disable-next-line no-console
  console.log(`betterprompting v${VERSION}

Usage:
  betterprompting [start]               Start the interceptor proxy (default)
  betterprompting init                  Initialize the local database
  betterprompting doctor                Print config + health check
  betterprompting events [--limit N]    List recent events
  betterprompting show <event-id>       Print a single event
  betterprompting summary [--days N]    Print usage summary
  betterprompting analyze <event-id>    Run the AI optimizer on an event

Flags (for start):
  --host <h>       default 127.0.0.1
  --port <p>       default 8787
  --log <level>    info | debug | warn | error

Environment:
  BETTERPROMPTING_DIR      Data directory  (default ~/.betterprompting)
  ANTHROPIC_UPSTREAM       default https://api.anthropic.com
  OPENAI_UPSTREAM          default https://api.openai.com
  ANTHROPIC_API_KEY        Required for the AI analyzer

Configure your client:
  export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
  export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
`);
}

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

async function main(): Promise<void> {
  const { command, flags, positional } = parse(process.argv.slice(2));

  if (flags.help || flags.h || command === "help") {
    help();
    return;
  }
  if (flags.version || flags.v || command === "version") {
    // eslint-disable-next-line no-console
    console.log(VERSION);
    return;
  }

  ensureDataDir();

  switch (command) {
    case "start":
    case "proxy": {
      getDb(); // init schema
      await startProxy({
        host: typeof flags.host === "string" ? flags.host : undefined,
        port: typeof flags.port === "string" ? Number(flags.port) : undefined,
        logLevel: typeof flags.log === "string" ? flags.log : undefined,
      });
      return;
    }
    case "init": {
      getDb();
      // eslint-disable-next-line no-console
      console.log(`Initialized Betterprompting at ${getDataDir()}`);
      // eslint-disable-next-line no-console
      console.log(`Database: ${getDbPath()}`);
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
        // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(ev, null, 2));
      return;
    }
    case "summary": {
      const days = typeof flags.days === "string" ? Number(flags.days) : 30;
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const s = getSummary(since);
      // eslint-disable-next-line no-console
      console.log(
        `Last ${days} days — ${fmt(s.totalEvents)} requests, ${fmt(
          s.totalInputTokens
        )} input + ${fmt(s.totalOutputTokens)} output tokens, cache read ${fmt(
          s.totalCacheReadTokens
        )}, est cost $${s.totalCostUsd.toFixed(4)}`
      );
      for (const r of s.byModel) {
        // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      console.error(`Unknown command: ${command}`);
      help();
      process.exit(1);
  }
}

function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dbDir = dirname(getDbPath());
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
}

function doctor(): void {
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
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(info, null, 2));
  if (!info.analyzerKeyConfigured) {
    // eslint-disable-next-line no-console
    console.log(
      "\nNote: ANTHROPIC_API_KEY is not set. The AI analyzer will run in heuristics-only mode."
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
