export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  created_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  duration_ms     INTEGER,

  client          TEXT,              -- cursor | claude-code | copilot | anthropic-sdk | openai-sdk | unknown
  provider        TEXT NOT NULL,     -- anthropic | openai
  model           TEXT,
  endpoint        TEXT NOT NULL,     -- e.g. /v1/messages, /v1/chat/completions
  method          TEXT NOT NULL,
  status          INTEGER,
  streamed        INTEGER NOT NULL DEFAULT 0,

  request_headers TEXT,              -- JSON (redacted)
  request_body    TEXT,              -- JSON
  response_body   TEXT,              -- JSON (assembled from stream if streamed)

  prompt_text     TEXT,              -- flattened user/system prompt for search
  completion_text TEXT,              -- flattened assistant output

  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cache_creation_input_tokens INTEGER,
  cache_read_input_tokens     INTEGER,
  total_tokens    INTEGER,

  estimated_cost_usd REAL,

  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_provider    ON events(provider);
CREATE INDEX IF NOT EXISTS idx_events_client      ON events(client);
CREATE INDEX IF NOT EXISTS idx_events_model       ON events(model);

CREATE TABLE IF NOT EXISTS prompt_analyses (
  id             TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  analyzer_model TEXT NOT NULL,
  score          INTEGER,             -- 0..100 prompt quality
  cache_score    INTEGER,             -- 0..100 cache-friendliness
  suggestions    TEXT NOT NULL,       -- JSON array of {title, detail, estimatedTokenSavings}
  rewritten_prompt TEXT,
  notes          TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analyses_event ON prompt_analyses(event_id);
`;
