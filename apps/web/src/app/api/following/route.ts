import { NextResponse, type NextRequest } from "next/server";
import { getFollowed } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { MAX_FOLLOWED } from "@/lib/queries";
import { clientIp, createLimiter } from "@/lib/ratelimit";

const limiter = createLimiter(20);

/** État des joueurs suivis : ?ids=12,34 (identifiants internes, 50 au plus). Les profils masqués ne sont jamais renvoyés. */
export async function GET(request: NextRequest) {
  const retry = limiter.check(clientIp(request.headers));
  if (retry !== null) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retry) } });
  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,18}$/.test(s))
    .slice(0, MAX_FOLLOWED);
  try {
    const players = ids.length ? await getFollowed(ids) : [];
    return NextResponse.json({ players }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    if (error instanceof DataUnavailableError) return NextResponse.json({ error: "data_unavailable" }, { status: 503 });
    throw error;
  }
}
