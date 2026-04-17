// Lightweight inline SVG bar chart — avoids pulling in a chart library.
interface Row {
  day: string;
  count: number;
  tokens: number;
  cost: number;
}

export function DailyChart({ data }: { data: Row[] }) {
  if (!data.length) {
    return <div className="muted">No activity yet.</div>;
  }
  const max = Math.max(...data.map((d) => d.tokens), 1);
  const width = 700;
  const height = 160;
  const barW = Math.max(6, Math.floor(width / data.length) - 4);

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 30}`}
      style={{ width: "100%", height: "auto" }}
    >
      {data.map((d, i) => {
        const h = Math.max(2, Math.round((d.tokens / max) * height));
        const x = i * (barW + 4);
        const y = height - h;
        return (
          <g key={d.day}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill="#7c8cff"
              rx={2}
            >
              <title>
                {d.day}: {d.tokens.toLocaleString()} tokens, {d.count} requests,
                ${d.cost.toFixed(4)}
              </title>
            </rect>
            {i % Math.ceil(data.length / 8) === 0 && (
              <text
                x={x + barW / 2}
                y={height + 18}
                fill="#8a93a6"
                fontSize="10"
                textAnchor="middle"
              >
                {d.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
