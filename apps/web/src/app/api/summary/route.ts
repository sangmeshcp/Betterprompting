import { NextResponse } from "next/server";
import { getSummary } from "@betterprompting/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "30");
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return NextResponse.json(getSummary(since));
}
