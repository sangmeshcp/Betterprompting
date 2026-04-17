import { NextResponse } from "next/server";
import { analyzeAndStore } from "@betterprompting/analyzer";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await analyzeAndStore(params.id);
    return NextResponse.json(result);
  } catch (err) {
    const e = err as Error;
    return new NextResponse(e.message, { status: 400 });
  }
}
