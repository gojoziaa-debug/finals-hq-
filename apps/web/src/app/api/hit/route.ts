import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase, withTimeout } from "@/lib/db";
import { clientIp, createLimiter } from "@/lib/ratelimit";
import { bumpUsage, isUsageEvent } from "@/lib/writes";

export const dynamic = "force-dynamic";

const limiter = createLimiter(60);

/**
 * Compteur d'audience sans cookie (navigator.sendBeacon) : { e: "profile_view" | "follow" | … }.
 * Seul un total par jour et par événement est gardé : ni adresse IP, ni identifiant, ni page précise.
 */
export async function POST(request: NextRequest) {
  if (limiter.check(clientIp(request.headers)) !== null || !hasDatabase()) return new NextResponse(null, { status: 204 });
  let event: unknown;
  try {
    event = ((await request.json()) as { e?: unknown }).e;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (isUsageEvent(event) && event !== "card" && event !== "story" && event !== "hide_request") {
    await withTimeout(bumpUsage(getDb(), event), 4_000).catch(() => undefined);
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
