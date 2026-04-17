"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeButton({
  eventId,
  label,
}: {
  eventId: string;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn" onClick={run} disabled={loading}>
        {loading ? "Analyzing…" : label}
      </button>
      {error && (
        <div style={{ color: "var(--bad)", marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}
