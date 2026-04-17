import type { Client } from "@betterprompting/db";

export function detectClient(headers: Record<string, string | string[] | undefined>): Client {
  const ua = String(headers["user-agent"] ?? "").toLowerCase();
  const xClient = String(headers["x-client"] ?? headers["x-app"] ?? "").toLowerCase();

  if (ua.includes("cursor") || xClient.includes("cursor")) return "cursor";
  if (ua.includes("claude-code") || xClient.includes("claude-code")) return "claude-code";
  if (ua.includes("github-copilot") || ua.includes("copilot") || xClient.includes("copilot"))
    return "copilot";
  if (ua.includes("anthropic")) return "anthropic-sdk";
  if (ua.includes("openai")) return "openai-sdk";
  return "unknown";
}

const REDACT_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "openai-organization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    const value = Array.isArray(v) ? v.join(", ") : v;
    out[k] = REDACT_HEADERS.has(k.toLowerCase()) ? "***redacted***" : value;
  }
  return out;
}
