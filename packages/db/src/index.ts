import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SCHEMA_SQL } from "./schema.js";

export type Provider = "anthropic" | "openai";
export type Client =
  | "cursor"
  | "claude-code"
  | "copilot"
  | "anthropic-sdk"
  | "openai-sdk"
  | "unknown";

export interface EventRow {
  id: string;
  created_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  client: Client | null;
  provider: Provider;
  model: string | null;
  endpoint: string;
  method: string;
  status: number | null;
  streamed: 0 | 1;
  request_headers: string | null;
  request_body: string | null;
  response_body: string | null;
  prompt_text: string | null;
  completion_text: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  error: string | null;
}

export interface AnalysisRow {
  id: string;
  event_id: string;
  created_at: number;
  analyzer_model: string;
  score: number | null;
  cache_score: number | null;
  suggestions: string;
  rewritten_prompt: string | null;
  notes: string | null;
}

let _db: Database.Database | null = null;

export function getDbPath(): string {
  return (
    process.env.BETTERPROMPTING_DB ??
    resolve(process.cwd(), "data", "betterprompting.db")
  );
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const path = getDbPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  _db = db;
  return db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

export function insertEvent(row: EventRow): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO events (
      id, created_at, finished_at, duration_ms,
      client, provider, model, endpoint, method, status, streamed,
      request_headers, request_body, response_body,
      prompt_text, completion_text,
      input_tokens, output_tokens,
      cache_creation_input_tokens, cache_read_input_tokens,
      total_tokens, estimated_cost_usd, error
    ) VALUES (
      @id, @created_at, @finished_at, @duration_ms,
      @client, @provider, @model, @endpoint, @method, @status, @streamed,
      @request_headers, @request_body, @response_body,
      @prompt_text, @completion_text,
      @input_tokens, @output_tokens,
      @cache_creation_input_tokens, @cache_read_input_tokens,
      @total_tokens, @estimated_cost_usd, @error
    )`
  ).run(row);
}

export function insertAnalysis(row: AnalysisRow): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO prompt_analyses (
      id, event_id, created_at, analyzer_model,
      score, cache_score, suggestions, rewritten_prompt, notes
    ) VALUES (
      @id, @event_id, @created_at, @analyzer_model,
      @score, @cache_score, @suggestions, @rewritten_prompt, @notes
    )`
  ).run(row);
}

export function listEvents(opts: {
  limit?: number;
  offset?: number;
  provider?: Provider;
  client?: Client;
  search?: string;
} = {}): EventRow[] {
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.provider) {
    where.push("provider = @provider");
    params.provider = opts.provider;
  }
  if (opts.client) {
    where.push("client = @client");
    params.client = opts.client;
  }
  if (opts.search) {
    where.push("(prompt_text LIKE @q OR completion_text LIKE @q)");
    params.q = `%${opts.search}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.limit = opts.limit ?? 50;
  params.offset = opts.offset ?? 0;
  return db
    .prepare(
      `SELECT * FROM events ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
    )
    .all(params) as EventRow[];
}

export function getEvent(id: string): EventRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM events WHERE id = ?`)
    .get(id) as EventRow | undefined;
}

export function getAnalysesForEvent(eventId: string): AnalysisRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM prompt_analyses WHERE event_id = ? ORDER BY created_at DESC`
    )
    .all(eventId) as AnalysisRow[];
}

export interface Summary {
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  byClient: Array<{ client: string; count: number; tokens: number }>;
  byModel: Array<{ model: string; count: number; tokens: number }>;
  daily: Array<{ day: string; count: number; tokens: number; cost: number }>;
}

export function getSummary(sinceMs = 0): Summary {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS totalEvents,
        COALESCE(SUM(input_tokens),0) AS totalInputTokens,
        COALESCE(SUM(output_tokens),0) AS totalOutputTokens,
        COALESCE(SUM(cache_read_input_tokens),0) AS totalCacheReadTokens,
        COALESCE(SUM(cache_creation_input_tokens),0) AS totalCacheCreationTokens,
        COALESCE(SUM(estimated_cost_usd),0) AS totalCostUsd
      FROM events WHERE created_at >= ?`
    )
    .get(sinceMs) as {
      totalEvents: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheReadTokens: number;
      totalCacheCreationTokens: number;
      totalCostUsd: number;
    };

  const byClient = db
    .prepare(
      `SELECT COALESCE(client,'unknown') AS client, COUNT(*) AS count,
              COALESCE(SUM(total_tokens),0) AS tokens
       FROM events WHERE created_at >= ?
       GROUP BY client ORDER BY count DESC`
    )
    .all(sinceMs) as Array<{ client: string; count: number; tokens: number }>;

  const byModel = db
    .prepare(
      `SELECT COALESCE(model,'unknown') AS model, COUNT(*) AS count,
              COALESCE(SUM(total_tokens),0) AS tokens
       FROM events WHERE created_at >= ?
       GROUP BY model ORDER BY count DESC`
    )
    .all(sinceMs) as Array<{ model: string; count: number; tokens: number }>;

  const daily = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') AS day,
              COUNT(*) AS count,
              COALESCE(SUM(total_tokens),0) AS tokens,
              COALESCE(SUM(estimated_cost_usd),0) AS cost
       FROM events WHERE created_at >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .all(sinceMs) as Array<{
      day: string;
      count: number;
      tokens: number;
      cost: number;
    }>;

  return { ...totals, byClient, byModel, daily };
}
