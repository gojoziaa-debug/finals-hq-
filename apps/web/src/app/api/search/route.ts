import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { clientIp, createLimiter } from "@/lib/ratelimit";

const limiter = createLimiter(20);

export async function GET(request: NextRequest) {
  const retry = limiter.check(clientIp(request.headers));
  if (retry !== null) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retry) } });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const results = await search(q, 8);
    return NextResponse.json({ q, results }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    if (error instanceof DataUnavailableError) return NextResponse.json({ error: "data_unavailable" }, { status: 503 });
    throw error;
  }
}
