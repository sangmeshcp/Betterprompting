# Betterprompting

An open-source, self-hosted observability + optimization layer for AI coding
tools. Betterprompting sits transparently between your editor (Cursor, Claude
Code, Copilot, any Anthropic/OpenAI SDK client) and the model provider, logs
every prompt + streaming response to a local database, and runs an AI workflow
that tells you **how to prompt better to save tokens — especially via prompt
caching**.

> Status: early — MIT licensed, contributions welcome.

## What it does

1. **Intercepts** calls from Cursor, Claude Code, GitHub Copilot, and any other
   tool that uses the Anthropic or OpenAI APIs.
2. **Stores** the prompt, response, model, token usage, and cache usage in a
   local SQLite database — no cloud, no telemetry.
3. **Shows** analytics: requests, input/output tokens, cache hit ratio,
   estimated cost, per-client and per-model breakdowns.
4. **Optimizes**: an AI workflow (powered by Claude with prompt caching of its
   own system prompt, naturally) analyzes each prompt and suggests concrete
   restructurings, compressions, and cache-control placements that measurably
   reduce input tokens on repeat calls.

## Architecture

```
┌──────────────┐   HTTPS    ┌───────────────────┐   HTTPS    ┌──────────────┐
│ Cursor /     │ ─────────▶ │ betterprompting   │ ─────────▶ │ Anthropic /  │
│ Claude Code /│            │   proxy (:8787)   │            │ OpenAI       │
│ Copilot / … │ ◀───────── │ streams through  │ ◀───────── │              │
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

The proxy preserves streaming end-to-end (SSE chunks are relayed as they arrive)
and parses a copy of the stream in the background to extract the completion
text and token usage. Your tool sees zero latency overhead beyond a local hop.

## Repo layout

```
apps/
  proxy/       Fastify interceptor (Anthropic + OpenAI endpoints)
  web/         Next.js 14 dashboard + analysis API routes
packages/
  db/          Shared SQLite schema & query helpers (better-sqlite3)
  analyzer/    AI workflow: heuristics + Claude-powered prompt optimizer
```

## Quickstart

```bash
npm install
npm run build            # compiles db + analyzer
npm run db:init          # creates data/betterprompting.db
npm run dev              # starts proxy on :8787 and dashboard on :3000
```

Open http://localhost:3000 — you'll see an empty dashboard. Then point your
tool at the proxy (see the **Setup** page in the dashboard, or `docs/clients.md`):

```bash
# Claude Code / Anthropic SDK
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787

# Cursor / OpenAI SDK
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
```

Fire a request and refresh the dashboard.

## The AI optimization workflow

When you click **Analyze** on an event, Betterprompting runs a two-stage
workflow:

1. **Heuristic pass** (deterministic, no API call) — flags cache-hostile
   patterns like volatile timestamps / IDs in the prefix, large static content
   at the tail, redundant restatements, and missing `cache_control` hints on
   long prompts.
2. **AI pass** — calls Claude with a cached system prompt. The model receives
   the original prompt, the heuristic findings, and the completion, and returns
   structured JSON with: a quality score, a cache-friendliness score,
   ranked suggestions (each with an estimated token savings), and an optional
   rewritten prompt that preserves intent while moving volatile content to the
   end.

Both passes are stored in `prompt_analyses` so you can see scoring drift over
time as you refactor prompts.

## Configuration

| Env var | Where | Default | What |
|---|---|---|---|
| `BETTERPROMPTING_DB` | proxy + web | `./data/betterprompting.db` | Shared SQLite path. |
| `PORT` / `HOST` | proxy | `8787` / `127.0.0.1` | Proxy listen address. |
| `ANTHROPIC_UPSTREAM` | proxy | `https://api.anthropic.com` | Override for testing / self-hosted gateways. |
| `OPENAI_UPSTREAM` | proxy | `https://api.openai.com` | Same, for OpenAI-compatible APIs. |
| `ANTHROPIC_API_KEY` | web | — | Required for the AI rewrite step. Without it, heuristic-only mode. |
| `BETTERPROMPTING_ANALYZER_MODEL` | web | `claude-opus-4-7` | Any Claude model id. |

Credentials from the upstream client (your `x-api-key` / `Authorization`
header) are forwarded to the provider and **redacted** before storage.

## Privacy

Betterprompting is designed to run entirely on your workstation. Prompts,
completions, and token usage are written to a local SQLite file. The analyzer
sends only the prompt you explicitly click "Analyze" on to Anthropic — never
automatically.

## Contributing

Issues and PRs are welcome. A few natural next steps if you're looking for
somewhere to start:

- Add more provider shapes (Google Gemini, AWS Bedrock, Azure OpenAI).
- Record tool-use rounds as a linked trace, not just one flat prompt.
- Export / sync to Postgres for team deployments.
- A VS Code side panel that surfaces the dashboard inline.

## License

MIT — see [LICENSE](./LICENSE).
