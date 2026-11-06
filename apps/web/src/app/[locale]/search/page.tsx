import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { EmptyState, ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { search } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { SearchResult } from "@/lib/types";

/** Dépend de ?q= : toujours rendue à la demande (le layout fixe revalidate = 60 pour les autres pages). */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("searchTitle"), robots: { index: false, follow: true } };
}

/** Page de résultats : même recherche que la palette ⌘K, rendue côté serveur (fonctionne sans JavaScript). */
export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 40) ?? "";
  const t = await getTranslations("search");
  const te = await getTranslations("errors");
  let results: SearchResult[] | null = null;
  let failed = false;
  if (q.length >= 2) {
    try {
      results = await search(q, 30);
    } catch (error) {
      if (!(error instanceof DataUnavailableError)) console.error(error);
      failed = true;
    }
  }
  const l = locale as Locale;
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="font-display text-display-lg uppercase">{t("title")}</h1>
      <form role="search" action="" className="flex gap-2">
        <label className="grid flex-1 gap-1">
          <span className="text-caption uppercase text-text-2">{t("label")}</span>
          <input name="q" type="search" defaultValue={q} placeholder={t("placeholder")} minLength={2} maxLength={40} className="h-11 rounded-md border border-border-strong bg-surface px-3 text-body placeholder:text-text-3" />
        </label>
        <button type="submit" className="mt-auto h-11 rounded-md bg-accent px-4 text-body-sm font-semibold text-accent-contrast">
          {t("title")}
        </button>
      </form>
      {q.length < 2 && <p className="text-body-sm text-text-2">{t("hint")}</p>}
      {failed && <ErrorState title={te("title")} body={t("error")} />}
      {results && results.length === 0 && <EmptyState title={t("none", { q })} body={t("noneHint")} />}
      {results && results.length > 0 && (
        <section aria-label={t("results", { count: results.length, q })}>
          <p className="mb-2 text-body-sm text-text-2">{t("results", { count: results.length, q })}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {results.map((r) => {
              const n = splitName(r.name);
              return (
                <li key={r.playerId}>
                  <Link href={`/players/${playerSlug(r.name)}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-raised">
                    <LeagueBadge leagueNumber={r.league} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {n.base}
                        {n.tag && <span className="text-text-2">{n.tag}</span>}
                        {r.club && <span className="ml-2 text-body-sm text-text-2">{r.club}</span>}
                      </span>
                      {r.formerName && <span className="block truncate text-body-sm text-text-2">{t("former", { name: r.formerName })}</span>}
                    </span>
                    <span className="shrink-0 text-right text-body-sm tnum">
                      {r.rank !== null ? (
                        <>
                          <span className="block font-semibold">{formatRank(r.rank, l)}</span>
                          <span className="block text-text-2">{formatNumber(r.score ?? 0, l)} RS</span>
                        </>
                      ) : (
                        <span className="text-text-2">{t("notRanked")}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
