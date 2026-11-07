import { after, type NextRequest } from "next/server";
import { summarizeClub } from "@/lib/clubs";
import { getClub } from "@/lib/data";
import { getDb, hasDatabase, withTimeout } from "@/lib/db";
import { cardLocale, clubCard, render, siteCard } from "@/lib/og";
import { siteUrl } from "@/lib/site";
import { bumpUsage } from "@/lib/writes";

export const dynamic = "force-dynamic";

/** Carte d'un club : membres classés, RS moyen, meilleur rang, trois premiers non masqués. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  const { tag: raw } = await params;
  let tag = raw;
  try {
    tag = decodeURIComponent(raw);
  } catch {
    // tag mal encodé : utilisé tel quel
  }
  const sp = request.nextUrl.searchParams;
  const locale = cardLocale(sp.get("l"));
  const format = sp.get("f") === "story" ? "story" : "og";
  const club = await getClub(tag).catch(() => null);
  if (!club || club.members.length === 0) return render(siteCard(locale, siteUrl()), "og", { "Cache-Control": "public, max-age=300, s-maxage=300" });
  if (hasDatabase()) after(() => withTimeout(bumpUsage(getDb(), format === "story" ? "story" : "card"), 4_000).catch(() => undefined));
  const topNames = club.members.filter((m) => m.name).map((m) => m.name!);
  return render(clubCard({ tag: club.tag, name: club.name, summary: summarizeClub(club.members), topNames, takenAt: club.takenAt }, locale, format, siteUrl()), format);
}
