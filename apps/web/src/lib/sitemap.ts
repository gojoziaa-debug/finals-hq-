/** Sitemaps XML avec hreflang (sprint 6). Pur : la route lit la base, ce module ne fait que l'écriture. */
import { LEADERBOARDS } from "@finals-hq/db/catalog";
import { boardPath } from "./boards";
import { clubPath } from "./clubs";
import { playerSlug } from "./players";

export const SITEMAPS = ["pages", "players", "clubs"] as const;
export type SitemapName = (typeof SITEMAPS)[number];

/** Pages fixes (sans préfixe de langue) ; les pages non indexées (recherche, suivi, plus, comparaison) n'y sont pas. */
export const STATIC_PATHS = ["/", "/leaderboards", "/top-500", "/clubs", "/movers", "/rating", "/methodology", "/status", "/about", "/privacy", "/legal"];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Une entrée par langue, chacune avec ses alternates fr/en/x-default (format recommandé par Google). */
export function urlset(base: string, paths: readonly string[], lastmod: string | null): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const raw of paths) {
    const p = raw === "/" ? "" : raw;
    const alt = `<xhtml:link rel="alternate" hreflang="fr" href="${esc(`${base}/fr${p}`)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(`${base}/en${p}`)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${base}/fr${p}`)}"/>`;
    for (const l of ["fr", "en"]) out.push(`<url><loc>${esc(`${base}/${l}${p}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${alt}</url>`);
  }
  out.push("</urlset>");
  return out.join("\n");
}

export function sitemapIndex(base: string, lastmod: string | null): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAPS.map((n) => `<sitemap><loc>${esc(`${base}/sitemaps/${n}.xml`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</sitemap>`),
    "</sitemapindex>",
  ].join("\n");
}

export function pagePaths(): string[] {
  return [...STATIC_PATHS, ...LEADERBOARDS.map((lb) => boardPath(lb))];
}

export function playerPaths(names: readonly string[]): string[] {
  return names.map((n) => `/players/${playerSlug(n)}`);
}

export function clubPaths(tags: readonly string[]): string[] {
  return tags.map((t) => clubPath(t));
}
