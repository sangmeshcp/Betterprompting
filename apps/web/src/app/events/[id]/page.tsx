import { notFound } from "next/navigation";
import { getAnalysesForEvent, getEvent } from "@betterprompting/db";
import { AnalyzeButton } from "@/components/AnalyzeButton";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

export default function EventDetail({ params }: { params: { id: string } }) {
  const ev = getEvent(params.id);
  if (!ev) return notFound();
  const analyses = getAnalysesForEvent(ev.id);
  const latest = analyses[0];
  const suggestions = latest
    ? (JSON.parse(latest.suggestions) as Array<{
        title: string;
        detail: string;
        estimatedTokenSavings?: number;
        source: "heuristic" | "ai";
      }>)
    : [];

  return (
    <>
      <h1>
        Event <span className="muted">{ev.id}</span>
      </h1>

      <div className="grid cols-4">
        <Stat label="Client" value={ev.client ?? "unknown"} />
        <Stat label="Model" value={ev.model ?? "—"} />
        <Stat label="Status" value={String(ev.status ?? "—")} />
        <Stat label="Duration" value={`${ev.duration_ms ?? 0} ms`} />
      </div>

      <div className="grid cols-4" style={{ marginTop: 14 }}>
        <Stat label="Input tokens" value={fmt(ev.input_tokens)} />
        <Stat label="Output tokens" value={fmt(ev.output_tokens)} />
        <Stat
          label="Cache read"
          value={fmt(ev.cache_read_input_tokens)}
        />
        <Stat
          label="Cache write"
          value={fmt(ev.cache_creation_input_tokens)}
        />
      </div>

      <h2>Prompt</h2>
      <div className="card">
        <pre>{ev.prompt_text ?? "(empty)"}</pre>
      </div>

      <h2>Completion</h2>
      <div className="card">
        <pre>{ev.completion_text ?? "(empty)"}</pre>
      </div>

      <h2>AI analysis</h2>
      <div className="card">
        {latest ? (
          <>
            <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
              <ScoreDial label="Quality" value={latest.score ?? 0} />
              <ScoreDial label="Cache-friendly" value={latest.cache_score ?? 0} />
              <div className="muted" style={{ alignSelf: "center" }}>
                analyzed by {latest.analyzer_model} ·{" "}
                {new Date(latest.created_at).toLocaleString()}
              </div>
            </div>
            {latest.notes && <p className="muted">{latest.notes}</p>}
            {suggestions.length === 0 ? (
              <p className="muted">No suggestions — this prompt looks clean.</p>
            ) : (
              <ol>
                {suggestions.map((s, i) => (
                  <li key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong>{s.title}</strong>
                      <span
                        className={`badge ${s.source === "ai" ? "good" : "warn"}`}
                      >
                        {s.source}
                      </span>
                      {s.estimatedTokenSavings ? (
                        <span className="badge good">
                          ~{s.estimatedTokenSavings.toLocaleString()} tokens
                        </span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {s.detail}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {latest.rewritten_prompt && (
              <>
                <h2>Rewritten prompt</h2>
                <pre>{latest.rewritten_prompt}</pre>
              </>
            )}
            <AnalyzeButton eventId={ev.id} label="Re-run analysis" />
          </>
        ) : (
          <>
            <p className="muted">
              Run the Betterprompting analyzer on this prompt to get scores,
              concrete suggestions, and an optional cache-friendly rewrite.
            </p>
            <AnalyzeButton eventId={ev.id} label="Analyze this prompt" />
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="value" style={{ fontSize: 16 }}>
        {value}
      </span>
    </div>
  );
}

function ScoreDial({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "var(--good)" : value >= 45 ? "var(--warn)" : "var(--bad)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: `conic-gradient(${color} ${value * 3.6}deg, var(--panel-2) 0)`,
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--panel)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {value}
        </div>
      </div>
      <span className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {label}
      </span>
    </div>
  );
}
