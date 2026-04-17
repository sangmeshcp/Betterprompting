import Fastify from "fastify";
import { request as undiciRequest } from "undici";
import { nanoid } from "nanoid";
import {
  insertEvent,
  type EventRow,
  type Provider,
} from "@betterprompting/db";
import { HOST, PORT, PROVIDERS, estimateCost } from "./config.js";
import { detectClient, redactHeaders } from "./detect.js";
import {
  extractFromJsonResponse,
  extractFromRequest,
  extractFromSseBuffer,
} from "./extract.js";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 50 * 1024 * 1024,
});

// Capture the raw body for every request so we can forward it byte-for-byte
// to the upstream provider. Also keep the parsed JSON for analytics.
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (_req, body, done) => {
    try {
      const raw = body as Buffer;
      const parsed = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      if (parsed && typeof parsed === "object") (parsed as any).__raw = raw;
      done(null, parsed);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

// Accept any other content-type as an opaque buffer so we can still forward it.
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
  const raw = body as Buffer;
  done(null, { __raw: raw });
});

app.get("/__health", async () => ({ ok: true, service: "betterprompting-proxy" }));

app.all("/*", async (req, reply) => {
  const url = req.url;
  const provider = PROVIDERS.find((p) =>
    p.matchEndpoints.some((rx) => rx.test(url))
  );

  // Unknown endpoint: forward to Anthropic by default (most common use),
  // but without recording. Avoids breaking unrelated calls.
  if (!provider) {
    return reply.code(404).send({ error: "No matching provider route" });
  }

  const startedAt = Date.now();
  const eventId = nanoid();
  const client = detectClient(req.headers as Record<string, string | string[] | undefined>);
  const safeHeaders = redactHeaders(
    req.headers as Record<string, string | string[] | undefined>
  );

  const parsedBody = (req.body as any) ?? {};
  const rawBody: Buffer | undefined = parsedBody?.__raw;
  const requestJson = stripRaw(parsedBody);
  const { model, promptText } = extractFromRequest(provider.name, requestJson);
  const streamed = Boolean(requestJson?.stream);

  // Forward headers: strip hop-by-hop and override host.
  const fwdHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    const lk = k.toLowerCase();
    if (["host", "content-length", "connection", "accept-encoding"].includes(lk)) continue;
    fwdHeaders[k] = Array.isArray(v) ? v.join(", ") : String(v);
  }

  const upstreamUrl = provider.upstream.replace(/\/$/, "") + url;
  let upstream;
  try {
    upstream = await undiciRequest(upstreamUrl, {
      method: req.method as any,
      headers: fwdHeaders,
      body: rawBody,
    });
  } catch (err) {
    const e = err as Error;
    app.log.error({ err: e }, "upstream request failed");
    await persist({
      id: eventId,
      created_at: startedAt,
      finished_at: Date.now(),
      duration_ms: Date.now() - startedAt,
      client,
      provider: provider.name,
      model,
      endpoint: url.split("?")[0],
      method: req.method,
      status: 502,
      streamed: streamed ? 1 : 0,
      request_headers: JSON.stringify(safeHeaders),
      request_body: safeStringify(requestJson),
      response_body: null,
      prompt_text: promptText,
      completion_text: null,
      input_tokens: null,
      output_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      total_tokens: null,
      estimated_cost_usd: null,
      error: e.message,
    });
    return reply.code(502).send({ error: "Upstream request failed", message: e.message });
  }

  // Mirror upstream status + headers back to the client.
  reply.code(upstream.statusCode);
  for (const [k, v] of Object.entries(upstream.headers)) {
    if (v === undefined) continue;
    const lk = k.toLowerCase();
    if (["transfer-encoding", "content-encoding", "content-length"].includes(lk)) continue;
    reply.header(k, Array.isArray(v) ? v.join(", ") : String(v));
  }

  const contentType = String(upstream.headers["content-type"] ?? "");
  const isSse = contentType.includes("text/event-stream");

  // Buffer the full response body so we can both forward it and parse it.
  // Fastify's reply.raw lets us stream chunks to the client as we receive them.
  const chunks: Buffer[] = [];
  reply.hijack();
  const res = reply.raw;
  res.writeHead(upstream.statusCode, filterResHeaders(upstream.headers));

  try {
    for await (const chunk of upstream.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      res.write(buf);
    }
  } catch (err) {
    app.log.error({ err }, "stream relay failed");
  }
  res.end();

  const finishedAt = Date.now();
  const bodyBuf = Buffer.concat(chunks);
  const bodyText = bodyBuf.toString("utf8");

  let extracted;
  if (isSse) {
    extracted = extractFromSseBuffer(provider.name, bodyText);
  } else {
    let parsedResp: any = null;
    try {
      parsedResp = JSON.parse(bodyText);
    } catch {
      /* non-json */
    }
    extracted = extractFromJsonResponse(provider.name, parsedResp);
  }

  const inputT = extracted.inputTokens ?? 0;
  const outputT = extracted.outputTokens ?? 0;
  const cacheC = extracted.cacheCreationInputTokens ?? 0;
  const cacheR = extracted.cacheReadInputTokens ?? 0;
  const totalT = inputT + outputT + cacheC + cacheR;

  const resolvedModel = extracted.model ?? model;

  await persist({
    id: eventId,
    created_at: startedAt,
    finished_at: finishedAt,
    duration_ms: finishedAt - startedAt,
    client,
    provider: provider.name,
    model: resolvedModel,
    endpoint: url.split("?")[0],
    method: req.method,
    status: upstream.statusCode,
    streamed: isSse ? 1 : 0,
    request_headers: JSON.stringify(safeHeaders),
    request_body: safeStringify(requestJson),
    response_body: truncate(bodyText, 256 * 1024),
    prompt_text: promptText,
    completion_text: extracted.completionText,
    input_tokens: extracted.inputTokens,
    output_tokens: extracted.outputTokens,
    cache_creation_input_tokens: extracted.cacheCreationInputTokens,
    cache_read_input_tokens: extracted.cacheReadInputTokens,
    total_tokens: totalT || null,
    estimated_cost_usd: estimateCost(
      resolvedModel,
      inputT,
      outputT,
      cacheC,
      cacheR
    ),
    error: null,
  });
});

function filterResHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    const lk = k.toLowerCase();
    if (["transfer-encoding", "content-encoding", "content-length"].includes(lk))
      continue;
    out[k] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

function stripRaw(body: any): any {
  if (!body || typeof body !== "object") return body;
  const { __raw, ...rest } = body;
  return rest;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + `\n... [truncated ${s.length - max} bytes]` : s;
}

async function persist(row: EventRow) {
  try {
    insertEvent(row);
  } catch (err) {
    app.log.error({ err }, "failed to persist event");
  }
}

app
  .listen({ host: HOST, port: PORT })
  .then(() => {
    app.log.info(
      `betterprompting proxy listening on http://${HOST}:${PORT} (providers: ${PROVIDERS.map(
        (p) => p.name
      ).join(", ")})`
    );
  })
  .catch((err) => {
    app.log.error({ err }, "failed to start proxy");
    process.exit(1);
  });

export type { Provider };
