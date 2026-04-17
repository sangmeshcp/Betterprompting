import { getSummary } from "@betterprompting/db";
import { DailyChart } from "@/components/DailyChart";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default function DashboardPage() {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const s = getSummary(since);
  const cacheSavingsPct =
    s.totalInputTokens + s.totalCacheReadTokens > 0
      ? Math.round(
          (s.totalCacheReadTokens /
            (s.totalInputTokens + s.totalCacheReadTokens)) *
            100
        )
      : 0;

  return (
    <>
      <h1>Last 30 days</h1>
      {s.totalEvents === 0 ? (
        <div className="card empty">
          <h2 style={{ color: "var(--text)", letterSpacing: 0, textTransform: "none" }}>
            No events yet
          </h2>
          <p>
            Point your AI tool at the Betterprompting proxy to start capturing
            prompts.{" "}
            <a href="/setup">See setup instructions →</a>
          </p>
        </div>
      ) : (
        <>
          <div className="grid cols-4">
            <div className="card stat">
              <span className="label">Requests</span>
              <span className="value">{fmt(s.totalEvents)}</span>
            </div>
            <div className="card stat">
              <span className="label">Input tokens</span>
              <span className="value">{fmt(s.totalInputTokens)}</span>
            </div>
            <div className="card stat">
              <span className="label">Output tokens</span>
              <span className="value">{fmt(s.totalOutputTokens)}</span>
            </div>
            <div className="card stat">
              <span className="label">Est. cost</span>
              <span className="value">{fmtUsd(s.totalCostUsd)}</span>
            </div>
          </div>

          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <div className="card stat">
              <span className="label">Cache read tokens</span>
              <span className="value">{fmt(s.totalCacheReadTokens)}</span>
              <div className="bar" style={{ marginTop: 8 }}>
                <span style={{ width: `${cacheSavingsPct}%` }} />
              </div>
              <span className="muted">
                {cacheSavingsPct}% of input was served from cache
              </span>
            </div>
            <div className="card stat">
              <span className="label">Cache creation tokens</span>
              <span className="value">{fmt(s.totalCacheCreationTokens)}</span>
              <span className="muted">
                One-time write cost to populate prompt caches.
              </span>
            </div>
          </div>

          <h2>Daily usage</h2>
          <div className="card">
            <DailyChart data={s.daily} />
          </div>

          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>By client</h2>
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byClient.map((r) => (
                    <tr key={r.client}>
                      <td>
                        <span className="badge">{r.client}</span>
                      </td>
                      <td>{fmt(r.count)}</td>
                      <td>{fmt(r.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>By model</h2>
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byModel.map((r) => (
                    <tr key={r.model}>
                      <td>{r.model}</td>
                      <td>{fmt(r.count)}</td>
                      <td>{fmt(r.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
