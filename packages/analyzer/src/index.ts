import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import {
  getEvent,
  insertAnalysis,
  type AnalysisRow,
} from "@betterprompting/db";
import { runHeuristics, type HeuristicFinding } from "./heuristics.js";

export type { HeuristicFinding };

export interface Suggestion {
  title: string;
  detail: string;
  estimatedTokenSavings?: number;
  source: "heuristic" | "ai";
}

export interface AnalysisResult {
  id: string;
  eventId: string;
  score: number;
  cacheScore: number;
  suggestions: Suggestion[];
  rewrittenPrompt: string | null;
  notes: string;
  analyzerModel: string;
}

const ANALYZER_MODEL =
  process.env.BETTERPROMPTING_ANALYZER_MODEL ?? "claude-opus-4-7";

// This system prompt is long and stable on purpose — we mark it with
// cache_control so repeat analyses are dirt cheap. That's the feature we're
// recommending to users; we use it ourselves.
const ANALYZER_SYSTEM = `You are the Betterprompting analyzer. Given a captured LLM prompt and (optionally) its completion and token usage, you return a short JSON report focused on reducing token spend via prompt caching and structural improvements.

Scoring rubric (0-100, higher is better):
- score: overall prompt quality (clarity, specificity, signal/noise).
- cacheScore: how well the prompt exploits prefix caching. A perfect prompt places all large, stable content (system rules, docs, schemas, few-shot examples) as a contiguous prefix, and puts volatile content (user's current question, timestamps, IDs) at the very end.

For EACH suggestion include an estimatedTokenSavings integer if you can justify it from the prompt length; otherwise omit it.

Output ONLY a JSON object matching:
{
  "score": number,
  "cacheScore": number,
  "notes": string,
  "suggestions": [ { "title": string, "detail": string, "estimatedTokenSavings"?: number } ],
  "rewrittenPrompt": string | null
}

Rules:
- rewrittenPrompt must preserve the user's intent; only restructure/compress.
- If the prompt is already near-optimal, return an empty suggestions array and rewrittenPrompt: null.
- Never invent facts that aren't in the original prompt.
- No preamble, no code fences, JSON only.`;

export interface AnalyzeInput {
  prompt: string;
  completion?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export async function analyzePrompt(input: AnalyzeInput): Promise<{
  score: number;
  cacheScore: number;
  suggestions: Suggestion[];
  rewrittenPrompt: string | null;
  notes: string;
}> {
  const heuristicFindings = runHeuristics(input.prompt);
  const heuristicSuggestions: Suggestion[] = heuristicFindings.map((f) => ({
    title: f.title,
    detail: f.detail,
    estimatedTokenSavings: f.estimatedTokenSavings,
    source: "heuristic",
  }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Heuristics-only mode when no API key is configured.
    const cacheScore = computeCacheScore(heuristicFindings);
    return {
      score: 60,
      cacheScore,
      suggestions: heuristicSuggestions,
      rewrittenPrompt: null,
      notes:
        "ANTHROPIC_API_KEY not set — showing heuristic findings only. Configure a key to enable AI rewrite.",
    };
  }

  const client = new Anthropic({ apiKey });
  const userBlock = buildUserBlock(input, heuristicFindings);

  const msg = await client.messages.create({
    model: ANALYZER_MODEL,
    max_tokens: 2000,
    // The published @anthropic-ai/sdk types for this SDK version don't yet
    // include cache_control on system text blocks; the API accepts it fine.
    system: [
      {
        type: "text",
        text: ANALYZER_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ] as any,
    messages: [{ role: "user", content: userBlock }],
  });

  const text = msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  const parsed = safeParseJson(text);
  if (!parsed) {
    return {
      score: 50,
      cacheScore: computeCacheScore(heuristicFindings),
      suggestions: heuristicSuggestions,
      rewrittenPrompt: null,
      notes: "Analyzer returned unparseable output; falling back to heuristics.",
    };
  }

  const aiSuggestions: Suggestion[] = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((s: any) => ({
        title: String(s.title ?? ""),
        detail: String(s.detail ?? ""),
        estimatedTokenSavings:
          typeof s.estimatedTokenSavings === "number"
            ? s.estimatedTokenSavings
            : undefined,
        source: "ai" as const,
      }))
    : [];

  return {
    score: clampScore(parsed.score),
    cacheScore: clampScore(parsed.cacheScore),
    suggestions: [...heuristicSuggestions, ...aiSuggestions],
    rewrittenPrompt:
      typeof parsed.rewrittenPrompt === "string" ? parsed.rewrittenPrompt : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

export async function analyzeAndStore(eventId: string): Promise<AnalysisResult> {
  const ev = getEvent(eventId);
  if (!ev) throw new Error(`Event not found: ${eventId}`);

  const res = await analyzePrompt({
    prompt: ev.prompt_text ?? "",
    completion: ev.completion_text,
    model: ev.model,
    inputTokens: ev.input_tokens,
    outputTokens: ev.output_tokens,
  });

  const row: AnalysisRow = {
    id: nanoid(),
    event_id: eventId,
    created_at: Date.now(),
    analyzer_model: ANALYZER_MODEL,
    score: res.score,
    cache_score: res.cacheScore,
    suggestions: JSON.stringify(res.suggestions),
    rewritten_prompt: res.rewrittenPrompt,
    notes: res.notes,
  };
  insertAnalysis(row);
  return {
    id: row.id,
    eventId,
    score: res.score,
    cacheScore: res.cacheScore,
    suggestions: res.suggestions,
    rewrittenPrompt: res.rewrittenPrompt,
    notes: res.notes,
    analyzerModel: ANALYZER_MODEL,
  };
}

function buildUserBlock(input: AnalyzeInput, findings: HeuristicFinding[]) {
  const parts: Array<{ type: "text"; text: string }> = [];
  parts.push({
    type: "text",
    text: `Prompt model: ${input.model ?? "unknown"}
Input tokens: ${input.inputTokens ?? "unknown"}
Output tokens: ${input.outputTokens ?? "unknown"}

Heuristic findings (pre-computed, you can reuse or refute these):
${findings.length ? findings.map((f) => `- [${f.code}] ${f.title}: ${f.detail}`).join("\n") : "(none)"}

--- ORIGINAL PROMPT ---
${input.prompt}
--- END PROMPT ---

${input.completion ? `--- MODEL RESPONSE (for context) ---\n${input.completion.slice(0, 4000)}\n--- END RESPONSE ---` : ""}`,
  });
  return parts;
}

function computeCacheScore(findings: HeuristicFinding[]): number {
  let score = 85;
  for (const f of findings) {
    if (f.code === "heavy-tail") score -= 25;
    if (f.code === "volatile-timestamp" || f.code === "volatile-id") score -= 20;
    if (f.code === "time-reference") score -= 10;
    if (f.code === "cache-control") score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

function clampScore(v: unknown): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function safeParseJson(s: string): any | null {
  const trimmed = s.trim().replace(/^```json\s*|```$/g, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
