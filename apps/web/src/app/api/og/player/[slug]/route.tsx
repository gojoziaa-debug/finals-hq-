import { after, type NextRequest } from "next/server";
import { playerCardData } from "@/lib/cards";
import { getPlayer } from "@/lib/data";
import { getDb, hasDatabase, withTimeout } from "@/lib/db";
import { cardLocale, playerCard, render, siteCard } from "@/lib/og";
import { namesFromSlug, playerSlug } from "@/lib/players";
import { siteUrl } from "@/lib/site";
import { bumpUsage } from "@/lib/writes";

export const dynamic = "force-dynamic";

/**
 * Carte d'un profil : /api/og/player/GOJO-6255?l=fr (1200×630) ou &f=story (1080×1920), &dl=1 pour la
 * télécharger. Profil masqué, inconnu ou base indisponible : carte générique du site, jamais le pseudo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = request.nextUrl.searchParams;
  const locale = cardLocale(sp.get("l"));
  const format = sp.get("f") === "story" ? "story" : "og";
  const candidates = namesFromSlug(slug);
  const data = candidates.length > 0 ? await getPlayer(candidates).catch(() => null) : null;
  const card = playerCardData(data);
  if (!card) return render(siteCard(locale, siteUrl()), "og", { "Cache-Control": "public, max-age=300, s-maxage=300" });
  if (hasDatabase()) after(() => withTimeout(bumpUsage(getDb(), format === "story" ? "story" : "card"), 4_000).catch(() => undefined));
  const headers: Record<string, string> = sp.get("dl") === "1" ? { "Content-Disposition": `attachment; filename="finals-hq-${decodeURIComponent(playerSlug(card.name))}-${format}.png"` } : {};
  return render(playerCard(card, locale, format, siteUrl()), format, headers);
}
