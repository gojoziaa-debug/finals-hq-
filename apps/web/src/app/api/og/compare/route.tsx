import { after, type NextRequest } from "next/server";
import { playerCardData } from "@/lib/cards";
import { parseCompare } from "@/lib/compare";
import { getPlayer } from "@/lib/data";
import { getDb, hasDatabase, withTimeout } from "@/lib/db";
import { cardLocale, compareCard, render, siteCard, type PlayerCard } from "@/lib/og";
import { namesFromSlug } from "@/lib/players";
import { siteUrl } from "@/lib/site";
import { bumpUsage } from "@/lib/writes";

export const dynamic = "force-dynamic";

/** Carte d'une comparaison : /api/og/compare?p=GOJO-6255,Autre-1234&l=fr. Les profils masqués sont retirés. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const locale = cardLocale(sp.get("l"));
  const slugs = parseCompare(sp.get("p") ?? undefined);
  const cards: PlayerCard[] = [];
  for (const slug of slugs) {
    const names = namesFromSlug(slug);
    const card = names.length > 0 ? playerCardData(await getPlayer(names).catch(() => null)) : null;
    if (card) cards.push(card);
  }
  if (cards.length < 2) return render(siteCard(locale, siteUrl()), "og", { "Cache-Control": "public, max-age=300, s-maxage=300" });
  if (hasDatabase()) after(() => withTimeout(bumpUsage(getDb(), "card"), 4_000).catch(() => undefined));
  return render(compareCard(cards, locale, siteUrl()), "og");
}
