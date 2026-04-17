export default function SetupPage() {
  const proxy = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://127.0.0.1:8787";
  return (
    <>
      <h1>Setup</h1>
      <p className="muted">
        Point any AI coding tool at the Betterprompting proxy and every prompt +
        streaming response flows through it transparently. Nothing leaves your
        machine; everything is logged to a local SQLite database.
      </p>

      <h2>1. Start the proxy</h2>
      <div className="card">
        <pre>{`# from the repo root
npm install
npm run db:init
npm run dev   # starts proxy on ${proxy} and dashboard on http://localhost:3000`}</pre>
      </div>

      <h2>2. Point your tools at it</h2>

      <div className="grid cols-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Claude Code / Anthropic SDK</h2>
          <pre>{`export ANTHROPIC_BASE_URL=${proxy}
export ANTHROPIC_API_KEY=sk-ant-...   # unchanged`}</pre>
          <p className="muted">
            The proxy forwards to <code>api.anthropic.com</code> and preserves
            streaming.
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>OpenAI SDK / Cursor / Copilot</h2>
          <pre>{`export OPENAI_BASE_URL=${proxy}/v1
export OPENAI_API_KEY=sk-...          # unchanged`}</pre>
          <p className="muted">
            Works for any tool that respects <code>OPENAI_BASE_URL</code>,
            including Cursor's &quot;OpenAI-compatible&quot; provider.
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Cursor</h2>
          <pre>{`Settings → Models → Override OpenAI Base URL
  ${proxy}/v1

Settings → Models → API Key
  <your OpenAI or Anthropic key>`}</pre>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>GitHub Copilot Chat</h2>
          <p className="muted">
            Copilot itself doesn&apos;t expose a base URL override, but you can
            route traffic through the proxy using your system HTTP proxy:
          </p>
          <pre>{`export HTTPS_PROXY=${proxy}
# Proxy mode for Copilot requires installing the generated CA cert;
# see docs/clients.md for the full walkthrough.`}</pre>
        </div>
      </div>

      <h2>3. Watch it work</h2>
      <p>
        Fire a request from your tool, then open <a href="/events">Events</a>.
        Click a row to see the full prompt, completion, token usage, and run the
        AI analyzer to get cache-friendly rewrite suggestions.
      </p>
    </>
  );
}
