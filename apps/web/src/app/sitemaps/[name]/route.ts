import { getSitemap } from "@/lib/data";
import { siteUrl } from "@/lib/site";
import { clubPaths, pagePaths, playerPaths, SITEMAPS, urlset, type SitemapName } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

const XML = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" };

/** /sitemaps/pages.xml, /sitemaps/players.xml (top 10 000 visible, ≈ 20 000 URL), /sitemaps/clubs.xml. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name.replace(/\.xml$/, "") as SitemapName;
  if (!SITEMAPS.includes(name)) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  if (name === "pages") return new Response(urlset(base, pagePaths(), null), { headers: XML });
  try {
    const data = await getSitemap();
    return new Response(urlset(base, name === "players" ? playerPaths(data.players) : clubPaths(data.clubs), data.takenAt), { headers: XML });
  } catch {
    return new Response("Service unavailable", { status: 503, headers: { "Retry-After": "600" } });
  }
}
