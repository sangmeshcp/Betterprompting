// Normalize Anthropic + OpenAI request/response shapes into flat prompt/completion text
// and extract token usage.

export interface Extracted {
  model: string | null;
  promptText: string;
  completionText: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

type Msg = { role?: string; content?: unknown };

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: any) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      if (part?.type === "input_text" && typeof part.text === "string") return part.text;
      if (part?.type === "tool_use") return `[tool_use ${part.name ?? ""}]`;
      if (part?.type === "tool_result")
        return `[tool_result]\n${flattenContent(part.content)}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function extractFromRequest(provider: "anthropic" | "openai", body: any): {
  model: string | null;
  promptText: string;
} {
  if (!body || typeof body !== "object") {
    return { model: null, promptText: "" };
  }
  const model = typeof body.model === "string" ? body.model : null;
  const parts: string[] = [];

  if (provider === "anthropic") {
    if (typeof body.system === "string") parts.push(`[system]\n${body.system}`);
    else if (Array.isArray(body.system))
      parts.push(`[system]\n${flattenContent(body.system)}`);
    if (Array.isArray(body.messages)) {
      for (const m of body.messages as Msg[]) {
        parts.push(`[${m.role ?? "user"}]\n${flattenContent(m.content)}`);
      }
    }
  } else {
    // openai
    if (Array.isArray(body.messages)) {
      for (const m of body.messages as Msg[]) {
        parts.push(`[${m.role ?? "user"}]\n${flattenContent(m.content)}`);
      }
    } else if (typeof body.prompt === "string") {
      parts.push(body.prompt);
    } else if (Array.isArray(body.input)) {
      parts.push(flattenContent(body.input));
    } else if (typeof body.input === "string") {
      parts.push(body.input);
    }
  }
  return { model, promptText: parts.join("\n\n") };
}

export function extractFromJsonResponse(
  provider: "anthropic" | "openai",
  body: any
): Omit<Extracted, "promptText"> {
  if (!body || typeof body !== "object") {
    return {
      model: null,
      completionText: "",
      inputTokens: null,
      outputTokens: null,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: null,
    };
  }
  if (provider === "anthropic") {
    const model = body.model ?? null;
    const completionText = flattenContent(body.content);
    const u = body.usage ?? {};
    return {
      model,
      completionText,
      inputTokens: numOrNull(u.input_tokens),
      outputTokens: numOrNull(u.output_tokens),
      cacheCreationInputTokens: numOrNull(u.cache_creation_input_tokens),
      cacheReadInputTokens: numOrNull(u.cache_read_input_tokens),
    };
  }
  // openai
  const model = body.model ?? null;
  let completionText = "";
  if (Array.isArray(body.choices)) {
    completionText = body.choices
      .map((c: any) => c?.message?.content ?? c?.text ?? "")
      .join("\n");
  } else if (Array.isArray(body.output)) {
    completionText = flattenContent(body.output);
  }
  const u = body.usage ?? {};
  return {
    model,
    completionText,
    inputTokens: numOrNull(u.prompt_tokens ?? u.input_tokens),
    outputTokens: numOrNull(u.completion_tokens ?? u.output_tokens),
    cacheCreationInputTokens: null,
    cacheReadInputTokens: numOrNull(u.prompt_tokens_details?.cached_tokens),
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

// Parse an entire SSE stream buffer (as a single string) to derive the final
// completion text + token usage. Works for both Anthropic and OpenAI.
export function extractFromSseBuffer(
  provider: "anthropic" | "openai",
  buf: string
): Omit<Extracted, "promptText"> {
  const events = buf.split(/\n\n/);
  let model: string | null = null;
  let completion = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let cacheCreate: number | null = null;
  let cacheRead: number | null = null;

  for (const block of events) {
    const dataLines = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) continue;
    const payload = dataLines.join("\n");
    if (!payload || payload === "[DONE]") continue;
    let data: any;
    try {
      data = JSON.parse(payload);
    } catch {
      continue;
    }

    if (provider === "anthropic") {
      const type = data.type;
      if (type === "message_start" && data.message) {
        model = data.message.model ?? model;
        const u = data.message.usage ?? {};
        inputTokens = numOrNull(u.input_tokens) ?? inputTokens;
        cacheCreate = numOrNull(u.cache_creation_input_tokens) ?? cacheCreate;
        cacheRead = numOrNull(u.cache_read_input_tokens) ?? cacheRead;
      } else if (type === "content_block_delta") {
        const d = data.delta;
        if (d?.type === "text_delta" && typeof d.text === "string") completion += d.text;
      } else if (type === "message_delta") {
        const u = data.usage ?? {};
        outputTokens = numOrNull(u.output_tokens) ?? outputTokens;
      }
    } else {
      // openai
      model = data.model ?? model;
      if (Array.isArray(data.choices)) {
        for (const c of data.choices) {
          const t = c?.delta?.content ?? c?.text ?? "";
          if (typeof t === "string") completion += t;
        }
      }
      if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
        completion += data.delta;
      }
      if (data.usage) {
        const u = data.usage;
        inputTokens = numOrNull(u.prompt_tokens ?? u.input_tokens) ?? inputTokens;
        outputTokens = numOrNull(u.completion_tokens ?? u.output_tokens) ?? outputTokens;
        cacheRead =
          numOrNull(u.prompt_tokens_details?.cached_tokens) ?? cacheRead;
      }
    }
  }

  return {
    model,
    completionText: completion,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: cacheCreate,
    cacheReadInputTokens: cacheRead,
  };
}
