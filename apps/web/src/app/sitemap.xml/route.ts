import { siteUrl } from "@/lib/site";
import { sitemapIndex } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Index des sitemaps (à soumettre dans Google Search Console une fois le domaine branché). */
export function GET() {
  return new Response(sitemapIndex(siteUrl(), null), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
