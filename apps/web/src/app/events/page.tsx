import Link from "next/link";
import { listEvents } from "@betterprompting/db";

export const dynamic = "force-dynamic";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function EventsPage({
  searchParams,
}: {
  searchParams: { q?: string; client?: string; provider?: string };
}) {
  const rows = listEvents({
    limit: 100,
    search: searchParams.q,
    client: searchParams.client as any,
    provider: searchParams.provider as any,
  });

  return (
    <>
      <h1>Events</h1>
      <form className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Search prompts / completions"
            style={{
              flex: 1,
              minWidth: 220,
              padding: 8,
              background: "var(--panel-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          />
          <select
            name="provider"
            defaultValue={searchParams.provider ?? ""}
            style={selectStyle}
          >
            <option value="">All providers</option>
            <option value="anthropic">anthropic</option>
            <option value="openai">openai</option>
          </select>
          <select
            name="client"
            defaultValue={searchParams.client ?? ""}
            style={selectStyle}
          >
            <option value="">All clients</option>
            <option value="cursor">cursor</option>
            <option value="claude-code">claude-code</option>
            <option value="copilot">copilot</option>
            <option value="anthropic-sdk">anthropic-sdk</option>
            <option value="openai-sdk">openai-sdk</option>
            <option value="unknown">unknown</option>
          </select>
          <button className="btn" type="submit">
            Filter
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div className="empty">No events match these filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Client</th>
                <th>Model</th>
                <th>Tokens (in / out / cache)</th>
                <th>Cost</th>
                <th>Prompt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{fmtTime(r.created_at)}</td>
                  <td>
                    <span className="badge">{r.client ?? "unknown"}</span>
                  </td>
                  <td>{r.model ?? "—"}</td>
                  <td>
                    {r.input_tokens ?? 0} / {r.output_tokens ?? 0} /{" "}
                    {(r.cache_read_input_tokens ?? 0) +
                      (r.cache_creation_input_tokens ?? 0)}
                  </td>
                  <td>
                    {r.estimated_cost_usd
                      ? `$${r.estimated_cost_usd.toFixed(4)}`
                      : "—"}
                  </td>
                  <td
                    style={{
                      maxWidth: 320,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r.prompt_text ?? ""}
                  >
                    {r.prompt_text?.slice(0, 140) ?? "—"}
                  </td>
                  <td>
                    <Link href={`/events/${r.id}`}>Inspect →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const selectStyle: React.CSSProperties = {
  padding: 8,
  background: "var(--panel-2)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
};
