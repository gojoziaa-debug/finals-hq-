import type { NextRequest } from "next/server";
import { cardLocale, render, siteCard } from "@/lib/og";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Carte par défaut de toutes les pages (accueil, classements, pages légales). */
export async function GET(request: NextRequest) {
  return render(siteCard(cardLocale(request.nextUrl.searchParams.get("l")), siteUrl()), "og", { "Cache-Control": "public, max-age=86400, s-maxage=86400" });
}
