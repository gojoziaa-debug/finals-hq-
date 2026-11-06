import { leaderboardById } from "@finals-hq/db/catalog";
import { NextResponse, type NextRequest } from "next/server";
import { getBoard } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { clientIp, createLimiter } from "@/lib/ratelimit";

const limiter = createLimiter(60);

/** Classement complet en colonnes (voir BoardColumns). Le CDN garde la réponse 60 s, puis la sert périmée pendant le recalcul. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const retry = limiter.check(clientIp(request.headers));
  if (retry !== null) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retry) } });
  const { id } = await params;
  const lb = /^\d{1,5}$/.test(id) ? leaderboardById(Number(id)) : undefined;
  if (!lb) return NextResponse.json({ error: "unknown_leaderboard" }, { status: 404 });
  try {
    const board = await getBoard(lb);
    const maxAge = lb.isLive ? 60 : 3600;
    return NextResponse.json(board, {
      headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 10}` },
    });
  } catch (error) {
    if (error instanceof DataUnavailableError) return NextResponse.json({ error: "data_unavailable" }, { status: 503 });
    throw error;
  }
}
