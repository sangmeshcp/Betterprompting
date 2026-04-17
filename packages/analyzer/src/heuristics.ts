// Cheap, deterministic checks that run before any AI call. These flag the
// most common cache-hostile and token-wasteful patterns in a prompt so the
// UI has something to show instantly and the AI pass has a starting point.

export interface HeuristicFinding {
  code: string;
  title: string;
  detail: string;
  severity: "info" | "warn" | "high";
  estimatedTokenSavings?: number;
}

const VOLATILE_PATTERNS: Array<{ rx: RegExp; code: string; detail: string }> = [
  {
    rx: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    code: "volatile-timestamp",
    detail:
      "ISO timestamps near the top of a prompt invalidate the prefix cache on every call.",
  },
  {
    rx: /\bsession[_-]?id\b|\brequest[_-]?id\b|\btrace[_-]?id\b/i,
    code: "volatile-id",
    detail:
      "Per-request IDs change each call and break cached prefixes. Move them to the end of the prompt or omit them.",
  },
  {
    rx: /\btoday is\b|\bcurrent date\b|\bnow\b/i,
    code: "time-reference",
    detail:
      "Natural-language 'today'/'now' references force a unique prefix. Pin the date only when the model actually needs it.",
  },
];

export function runHeuristics(promptText: string): HeuristicFinding[] {
  const findings: HeuristicFinding[] = [];
  const length = promptText.length;
  const approxTokens = Math.ceil(length / 4);

  for (const p of VOLATILE_PATTERNS) {
    if (p.rx.test(promptText)) {
      findings.push({
        code: p.code,
        title: "Volatile content in prompt prefix",
        detail: p.detail,
        severity: "high",
        estimatedTokenSavings: Math.min(approxTokens, 500),
      });
    }
  }

  // Position of the largest static block: if the biggest chunk is at the end,
  // reordering can unlock the cache on repeat calls.
  const sections = promptText.split(/\n\s*\n/);
  if (sections.length >= 2) {
    const lastLen = sections[sections.length - 1].length;
    const firstLen = sections[0].length;
    if (lastLen > firstLen * 3 && lastLen > 2000) {
      findings.push({
        code: "heavy-tail",
        title: "Large static content appears at the end",
        detail:
          "Prompt caching works on the prefix. Move your long, stable context (docs, schemas, system instructions) to the top of the prompt and keep the variable user input at the bottom.",
        severity: "high",
        estimatedTokenSavings: Math.min(Math.ceil(lastLen / 4), 4000),
      });
    }
  }

  // Redundant restatement
  if (/\b(as I said|as mentioned|again,|to reiterate)\b/i.test(promptText)) {
    findings.push({
      code: "repetition",
      title: "Redundant restatement detected",
      detail:
        "Repeating earlier instructions wastes input tokens without improving output quality.",
      severity: "warn",
      estimatedTokenSavings: Math.min(Math.ceil(approxTokens * 0.05), 200),
    });
  }

  // Over-long prompt
  if (approxTokens > 8000) {
    findings.push({
      code: "length",
      title: "Prompt is very long",
      detail: `~${approxTokens.toLocaleString()} tokens. Consider compressing examples, moving reference material into a cached system block, or summarizing prior turns.`,
      severity: "warn",
      estimatedTokenSavings: Math.ceil(approxTokens * 0.2),
    });
  }

  // Missing cache_control hint (Anthropic) — we can't see the raw request shape
  // here, but we can advise when the prompt is long and static-looking.
  if (approxTokens > 2000 && !/cache_control/i.test(promptText)) {
    findings.push({
      code: "cache-control",
      title: "Consider marking stable content with cache_control",
      detail:
        "For Anthropic API calls, add `cache_control: { type: 'ephemeral' }` on the last stable system/user block to enable prompt caching.",
      severity: "info",
    });
  }

  return findings;
}
