import { after, type NextRequest } from "next/server";
import { playerCardData } from "@/lib/cards";
import { DAY_MS, cutoffChange, projectTop500, thin } from "@/lib/cutoff";
import { getHome, getMovers, getPlayer, getTop500 } from "@/lib/data";
import { getDb, hasDatabase, withTimeout } from "@/lib/db";
import { render, type PlayerCard } from "@/lib/og";
import { namesFromSlug, playerSlug } from "@/lib/players";
import { siteUrl } from "@/lib/site";
import { supporterRole } from "@/lib/supporters";
import { isVideoKind, parseVideoParams, videoFilename } from "@/lib/video";
import { cutoffVideo, duelVideo, moversVideo } from "@/lib/video-cards";
import { bumpUsage } from "@/lib/writes";

export const dynamic = "force-dynamic";

const unavailable = (status: number, message: string) => new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

async function card(slug: string): Promise<PlayerCard | null> {
  const names = namesFromSlug(slug);
  return names.length > 0 ? playerCardData(await getPlayer(names).catch(() => null)) : null;
}

/**
 * Templates vidéo 1080×1920 (sprint 7) : /api/og/video/movers|duel|cutoff?l=fr&bg=transparent&step=2&dl=1.
 * Mêmes lectures que les pages (profils masqués exclus), même cache CDN de 10 min que les cartes de partage.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isVideoKind(kind)) return unavailable(404, "unknown template");
  const p = parseVideoParams(kind, request.nextUrl.searchParams);
  const site = siteUrl();
  let element: React.ReactElement;
  let takenAt: string | null = null;
  try {
    if (kind === "movers") {
      const data = await getMovers(p.window, p.dir);
      takenAt = data.takenAt;
      const rows = data.rows.slice(0, p.count).map((r) => ({ ...r, supporter: supporterRole(r.name) }));
      element = moversVideo(rows, takenAt, p, site);
    } else if (kind === "duel") {
      let slugs = p.players;
      if (slugs.length !== 2) {
        const home = await getHome();
        slugs = home.top.flatMap((r) => (r.name ? [decodeURIComponent(playerSlug(r.name))] : [])).slice(0, 2);
      }
      const [a, b] = await Promise.all(slugs.map(card));
      if (!a || !b) return unavailable(404, "players not found or hidden");
      takenAt = [a.takenAt, b.takenAt].filter(Boolean).sort().pop() ?? null;
      element = duelVideo(a, b, p, site);
    } else {
      const data = await getTop500();
      takenAt = data.takenAt;
      const projection = projectTop500(data.series);
      const at7 = projection.available ? projection.points.find((pt) => pt.days === 7) ?? null : null;
      const recent = data.series.filter((pt) => Date.parse(pt.t) >= Date.parse(data.series.at(-1)?.t ?? "") - 7 * DAY_MS);
      element = cutoffVideo(
        {
          score: data.latest?.rank500 ?? null,
          d24: cutoffChange(data.series, DAY_MS),
          d7: projection.observedDays >= 7 ? cutoffChange(data.series, 7 * DAY_MS) : null,
          series: thin(recent, 120).map((pt) => pt.score),
          rank1: data.latest?.rank1 ?? null,
          last: data.latest?.last ?? null,
          projection: at7 ? { mid: Math.round(at7.mid), low: Math.round(at7.low), high: Math.round(at7.high) } : null,
          projectionFrom: !projection.available && projection.availableFrom ? projection.availableFrom.slice(0, 10) : null,
          takenAt,
        },
        p,
        site,
      );
    }
  } catch {
    return unavailable(503, "data unavailable");
  }
  if (hasDatabase()) after(() => withTimeout(bumpUsage(getDb(), "video"), 4_000).catch(() => undefined));
  const headers: Record<string, string> = p.download ? { "Content-Disposition": `attachment; filename="${videoFilename(p, takenAt)}"` } : {};
  return render(element, "story", headers);
}
