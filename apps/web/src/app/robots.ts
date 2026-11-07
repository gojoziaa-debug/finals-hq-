import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Tant que le site n'est pas sur son domaine définitif (ou sur une preview), rien n'est exploré, sauf les cartes de
 * partage : Twitterbot respecte robots.txt et n'afficherait pas l'image d'un lien collé sur X.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexable()) return { rules: { userAgent: "*", allow: "/api/og/", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/", "/fr/search", "/en/search", "/fr/following", "/en/following", "/fr/styleguide", "/en/styleguide"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
