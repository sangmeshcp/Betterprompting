# Architecture

## Data flow

```
client ──► proxy (Fastify) ──► provider
             │
             │   (buffered copy of request + response stream)
             ▼
         SQLite (events)
             ▲
             │  read
             │
      Next.js dashboard ──► POST /api/events/:id/analyze ──► analyzer
                                                               │
                                                               ▼
                                                         prompt_analyses
```

## Proxy

- One Fastify instance. All methods, all paths; paths matched against provider
  regexes in `apps/proxy/src/config.ts`. Unmatched paths return 404 to avoid
  silently blackholing unrelated traffic.
- Raw request body is captured via a custom `application/json` parser so we can
  forward it to the upstream byte-for-byte while also parsing it for analytics.
- Credentials (`authorization`, `x-api-key`, `cookie`, …) are forwarded to the
  provider and redacted in the stored `request_headers`.
- Responses are streamed to the client as they arrive (`reply.hijack()` +
  `reply.raw.write`). A parallel buffer of the full body is kept in memory and
  parsed after the stream closes, so:
  - JSON responses → parsed directly.
  - `text/event-stream` (Anthropic + OpenAI streaming) → `extractFromSseBuffer`
    reassembles the completion text and pulls token usage out of
    `message_start` / `message_delta` (Anthropic) or `usage` blocks (OpenAI).

## Storage

Two tables, both in a single SQLite file (WAL journal mode):

- `events` — one row per request. Indexed on `created_at`, `provider`,
  `client`, `model`.
- `prompt_analyses` — zero or more rows per event (re-analysis keeps history).

Schema lives in `packages/db/src/schema.ts`.

## Analyzer

Two-stage workflow in `packages/analyzer/src/index.ts`:

1. `runHeuristics(prompt)` — deterministic rules in `heuristics.ts`. Detects
   volatile timestamps / IDs in the prefix, large static content at the tail,
   redundant restatements, missing `cache_control` hints, and overly long
   prompts.
2. `analyzePrompt(input)` — calls Claude with the heuristic findings folded
   into the user message. The system prompt is long and stable, and is tagged
   with `cache_control: { type: "ephemeral" }` so repeat analyses hit the
   Anthropic prompt cache. Output is strict JSON:

   ```json
   {
     "score": 78,
     "cacheScore": 42,
     "notes": "...",
     "suggestions": [
       { "title": "...", "detail": "...", "estimatedTokenSavings": 1200 }
     ],
     "rewrittenPrompt": "..."
   }
   ```

   Malformed output falls back to heuristics-only.

`analyzeAndStore(eventId)` wraps everything, persists the result to
`prompt_analyses`, and is called by the dashboard's `/api/events/:id/analyze`
route.

## Dashboard

Next.js 14 App Router. Server components read directly from SQLite via
`@betterprompting/db` (the `better-sqlite3` native module is allowed via
`serverComponentsExternalPackages`). Only the analyze button is a client
component; it POSTs to the server API route and refreshes.

## Why SQLite

- Zero setup for solo developers (the primary audience).
- Good enough for tens of millions of events on a laptop.
- Swapping in Postgres later is a mechanical change — the query surface is
  small and concentrated in `packages/db`.
