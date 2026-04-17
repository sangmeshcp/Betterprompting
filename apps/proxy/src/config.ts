export interface ProviderConfig {
  name: "anthropic" | "openai";
  upstream: string;
  matchEndpoints: RegExp[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    name: "anthropic",
    upstream: process.env.ANTHROPIC_UPSTREAM ?? "https://api.anthropic.com",
    matchEndpoints: [/^\/v1\/messages/, /^\/v1\/complete/],
  },
  {
    name: "openai",
    upstream: process.env.OPENAI_UPSTREAM ?? "https://api.openai.com",
    matchEndpoints: [
      /^\/v1\/chat\/completions/,
      /^\/v1\/completions/,
      /^\/v1\/responses/,
    ],
  },
];

export const PORT = Number(process.env.PORT ?? 8787);
export const HOST = process.env.HOST ?? "127.0.0.1";

// Approximate per-million-token prices (USD). Easy to tweak.
// Not authoritative - only used for a rough cost estimate on the dashboard.
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheWrite?: number; cacheRead?: number }
> = {
  // Anthropic
  "claude-opus-4-7": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  // OpenAI (illustrative)
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
};

export function estimateCost(
  model: string | null,
  input = 0,
  output = 0,
  cacheWrite = 0,
  cacheRead = 0
): number | null {
  if (!model) return null;
  const key = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
  if (!key) return null;
  const p = MODEL_PRICING[key];
  const cw = p.cacheWrite ?? p.input;
  const cr = p.cacheRead ?? p.input;
  return (
    (input * p.input +
      output * p.output +
      cacheWrite * cw +
      cacheRead * cr) /
    1_000_000
  );
}
