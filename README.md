# Betterprompting

An open-source, self-hosted observability + optimization layer for AI coding
tools. Betterprompting sits transparently between your editor (Cursor, Claude
Code, Copilot, any Anthropic/OpenAI SDK client) and the model provider, logs
every prompt + streaming response to a local database, and runs an AI workflow
that tells you **how to prompt better to save tokens — especially via prompt
caching**.

> Status: early — MIT licensed, contributions welcome.

## Install

Pick whichever fits your setup. All three land at the same place: a
`betterprompting` command that starts the interceptor on `:8787` and stores
data in `~/.betterprompting/`.

### One-line install (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/sangmeshcp/betterprompting/main/install.sh | sh
betterprompting            # starts the proxy
```

### npm

```bash
npm install -g betterprompting
betterprompting
```

### Docker

```bash
docker run -d --name betterprompting \
  -p 8787:8787 -p 3000:3000 \
  -v betterprompting-data:/data \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ghcr.io/sangmeshcp/betterprompting:latest
```

Or with compose:

```bash
git clone https://github.com/sangmeshcp/betterprompting && cd betterprompting
ANTHROPIC_API_KEY=sk-ant-... docker compose up -d
```

### From source

```bash
git clone https://github.com/sangmeshcp/betterprompting && cd betterprompting
npm install && npm run build
npm run dev    # proxy on :8787, dashboard on :3000
```

## Configure your tools

```bash
betterprompting install
```

That's it. The installer:

- Detects every supported AI tool (Cursor, Claude Code, Claude Desktop,
  Continue.dev, Aider, Cline, Zed) and writes the right base-URL setting
  into each tool's own config file.
- Appends fenced `export ANTHROPIC_BASE_URL=…` / `OPENAI_BASE_URL=…` blocks
  to your shell rc (`.zshrc` / `.bashrc` / fish / PowerShell profile).
- Registers an auto-start service (LaunchAgent / systemd user unit /
  Task Scheduler) so the proxy is always running.
- Every change is idempotent, dry-runnable (`--dry-run`), and fully
  reversible (`betterprompting uninstall`).

Fire a request from any tool and it lands in the dashboard
(<http://localhost:3000>) — or run `betterprompting events` to watch from
the terminal. Full per-tool details, including the manual/headless path,
in [`docs/clients.md`](./docs/clients.md).

## What it does

1. **Intercepts** calls from Cursor, Claude Code, GitHub Copilot, and any
   other tool that uses the Anthropic or OpenAI APIs.
2. **Stores** the prompt, response, model, token usage, and cache usage in a
   local SQLite database — no cloud, no telemetry.
3. **Shows** analytics: requests, input/output tokens, cache hit ratio,
   estimated cost, per-client and per-model breakdowns.
4. **Optimizes**: an AI workflow (Claude with prompt caching of its own
   system prompt, naturally) analyzes each prompt and suggests concrete
   restructurings, compressions, and cache-control placements that
   measurably reduce input tokens on repeat calls.

## CLI

```
betterprompting [start]          Start the interceptor proxy (default)
betterprompting install          Auto-detect + configure every AI tool
betterprompting install --dry-run
betterprompting install --only cursor,claude-code
betterprompting install --force  Override existing base URLs
betterprompting uninstall        Reverse every change install made
betterprompting init             Initialize the local database
betterprompting doctor           Config + detected-tool status + health check
betterprompting events           List recent events
betterprompting show <id>        Print a single event as JSON
betterprompting summary          Print usage summary for the last 30 days
betterprompting analyze <id>     Run the AI optimizer on an event
```

## Architecture

```
┌──────────────┐   HTTPS    ┌───────────────────┐   HTTPS    ┌──────────────┐
│ Cursor /     │ ─────────▶ │ betterprompting   │ ─────────▶ │ Anthropic /  │
│ Claude Code /│            │   proxy (:8787)   │            │ OpenAI       │
│ Copilot / …  │ ◀───────── │ streams through   │ ◀───────── │              │
└──────────────┘   SSE      └────────┬──────────┘   SSE      └──────────────┘
                                     │ writes
                                     ▼
                             ┌──────────────┐      ┌──────────────────────┐
                             │ SQLite  (db) │ ◀─── │ Next.js dashboard    │
                             └──────────────┘      │   (:3000)            │
                                                   │  + /analyze endpoint │
                                                   │  (Claude analyzer)   │
                                                   └──────────────────────┘
```

The proxy preserves streaming end-to-end (SSE chunks are relayed as they
arrive) and parses a copy of the stream in the background to extract the
completion text and token usage. Your tool sees zero latency overhead beyond a
local hop.

## Repo layout

```
apps/
  proxy/       Fastify interceptor (Anthropic + OpenAI endpoints)
  web/         Next.js 14 dashboard + analysis API routes
packages/
  cli/         `betterprompting` binary — publishable to npm
  db/          Shared SQLite schema & query helpers (better-sqlite3)
  analyzer/    AI workflow: heuristics + Claude-powered prompt optimizer
```

## The AI optimization workflow

When you click **Analyze** on an event (or run
`betterprompting analyze <id>`), Betterprompting runs a two-stage workflow:

1. **Heuristic pass** (deterministic, no API call) — flags cache-hostile
   patterns like volatile timestamps / IDs in the prefix, large static
   content at the tail, redundant restatements, and missing `cache_control`
   hints on long prompts.
2. **AI pass** — calls Claude with a cached system prompt. The model
   receives the original prompt, the heuristic findings, and the completion,
   and returns structured JSON with: a quality score, a cache-friendliness
   score, ranked suggestions (each with an estimated token savings), and an
   optional rewritten prompt that preserves intent while moving volatile
   content to the end.

Both passes are stored in `prompt_analyses` so you can see scoring drift over
time as you refactor prompts.

## Configuration

| Env var | Default | What |
|---|---|---|
| `BETTERPROMPTING_DIR` | `~/.betterprompting` | Where SQLite lives. |
| `BETTERPROMPTING_DB` | `$BETTERPROMPTING_DIR/betterprompting.db` | Override DB path directly. |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Proxy listen address. |
| `ANTHROPIC_UPSTREAM` | `https://api.anthropic.com` | Override for testing. |
| `OPENAI_UPSTREAM` | `https://api.openai.com` | Same, for OpenAI-compatible APIs. |
| `ANTHROPIC_API_KEY` | — | Required for the AI rewrite step. Heuristic-only without it. |
| `BETTERPROMPTING_ANALYZER_MODEL` | `claude-opus-4-7` | Any Claude model id. |

Credentials from the upstream client (your `x-api-key` / `Authorization`
header) are forwarded to the provider and **redacted** before storage.

## Privacy

Betterprompting is designed to run entirely on your workstation. Prompts,
completions, and token usage are written to a local SQLite file. The analyzer
sends only the prompt you explicitly click "Analyze" on to Anthropic — never
automatically.

## Contributing

Issues and PRs are welcome. Good first projects:

- Add more provider shapes (Google Gemini, AWS Bedrock, Azure OpenAI).
- Record tool-use rounds as a linked trace, not just one flat prompt.
- Export / sync to Postgres for team deployments.
- A VS Code side panel that surfaces the dashboard inline.

## License

MIT — see [LICENSE](./LICENSE).
