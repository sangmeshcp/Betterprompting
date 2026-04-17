# Client configuration

The Betterprompting proxy is API-compatible with Anthropic and OpenAI. Any tool
that accepts a custom base URL can be pointed at it without code changes.

## Claude Code

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export ANTHROPIC_API_KEY=sk-ant-...
```

Claude Code will use the proxy for all `/v1/messages` calls. Streaming
responses are relayed unchanged; you won't notice a latency difference.

## Anthropic SDK (Python / TS)

```python
from anthropic import Anthropic
client = Anthropic(base_url="http://127.0.0.1:8787")
```

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ baseURL: "http://127.0.0.1:8787" });
```

## OpenAI SDK

```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8787/v1")
```

## Cursor

1. Open **Settings → Models**.
2. Toggle **Override OpenAI Base URL**.
3. Set the URL to `http://127.0.0.1:8787/v1`.
4. Paste your OpenAI (or OpenAI-compatible) API key.

Cursor's agent, tab-completion, and chat all route through the proxy.

## GitHub Copilot

Copilot doesn't expose a base-URL setting directly. Two workable approaches:

### Option A: System HTTP(S) proxy

```bash
export HTTPS_PROXY=http://127.0.0.1:8787
export HTTP_PROXY=http://127.0.0.1:8787
```

This requires Betterprompting to terminate TLS and present a trusted CA. A
`mkcert`-based setup script is tracked in issue #1 — contributions welcome.

### Option B: Local DNS + reverse proxy

Point `api.githubcopilot.com` at `127.0.0.1` in `/etc/hosts` and run the proxy
with a self-signed cert. Same TLS caveat.

For most users Option A is simpler.

## Verifying it works

```bash
curl http://127.0.0.1:8787/__health
# -> { "ok": true, "service": "betterprompting-proxy" }

curl http://127.0.0.1:8787/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
```

Then open http://localhost:3000/events — the request should appear within a
second.
