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

      <h2>1. One command</h2>
      <div className="card">
        <pre>{`betterprompting install`}</pre>
        <p className="muted" style={{ marginTop: 8 }}>
          Auto-detects every supported AI tool on your machine (Cursor, Claude
          Code, Claude Desktop, Continue.dev, Aider, Cline, Zed), writes the
          right base-URL into each one&apos;s config, appends fenced shell
          exports, and registers an auto-start service so the proxy always
          runs.
        </p>
        <p className="muted">
          Preview first: <code>betterprompting install --dry-run</code>.
          Override existing settings: <code>--force</code>. Undo everything:{" "}
          <code>betterprompting uninstall</code>.
        </p>
      </div>

      <h2>2. Verify</h2>
      <div className="card">
        <pre>{`betterprompting doctor`}</pre>
        <p className="muted" style={{ marginTop: 8 }}>
          Shows which tools were detected, what base URL each one currently
          uses (should be {proxy} after install), and whether the auto-start
          service is registered.
        </p>
      </div>

      <h2>3. Watch it work</h2>
      <p>
        Fire a request from your tool, then open{" "}
        <a href="/events">Events</a>. Click a row to see the full prompt,
        completion, token usage, and run the AI analyzer to get cache-friendly
        rewrite suggestions.
      </p>

      <h2>Manual / headless</h2>
      <p className="muted">
        On a server or in CI, export the base URL yourself:
      </p>

      <div className="grid cols-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Claude Code / Anthropic SDK</h2>
          <pre>{`export ANTHROPIC_BASE_URL=${proxy}
export ANTHROPIC_API_KEY=sk-ant-...   # unchanged`}</pre>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>OpenAI SDK / any OpenAI-compatible</h2>
          <pre>{`export OPENAI_BASE_URL=${proxy}/v1
export OPENAI_API_KEY=sk-...          # unchanged`}</pre>
        </div>
      </div>

      <p className="muted">
        Full per-tool details in{" "}
        <a
          href="https://github.com/sangmeshcp/betterprompting/blob/main/docs/clients.md"
          target="_blank"
          rel="noreferrer"
        >
          docs/clients.md
        </a>
        .
      </p>
    </>
  );
}
