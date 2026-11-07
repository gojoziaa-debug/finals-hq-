import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { EmptyState, ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { LIVE_SEASON } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { clubPath, CLUB_SORTS, CLUBS_PAGE, parseClubSort, sortClubs } from "@/lib/clubs";
import { getClubs } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { ClubsData } from "@/lib/types";

/** Dépend de ?q=, ?sort= et ?show= : rendue à la demande, les données restent en cache 60 s. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("clubsTitle"), description: t("clubsDescription", { season: LIVE_SEASON.name }), alternates: alternates(locale, "/clubs") };
}

type Search = Promise<{ q?: string | string[]; sort?: string | string[]; show?: string | string[] }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Classement des clubs (phase E) : tri par RS cumulé par défaut, recherche par tag, fonctionne sans JavaScript. */
export default async function ClubsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Search }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim().slice(0, 32);
  const sort = parseClubSort(one(sp.sort));
  const show = Math.min(5000, Math.max(CLUBS_PAGE, Number.parseInt(one(sp.show) ?? "", 10) || CLUBS_PAGE));
  const t = await getTranslations("clubs");
  const tc = await getTranslations("common");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let data: ClubsData | null = null;
  try {
    data = await getClubs();
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }
  if (!data) return <ErrorState title={te("title")} body={te("body")} />;
  const all = sortClubs(data.clubs, "total");
  const position = new Map(all.map((c, i) => [c.tag, i + 1]));
  const list = sortClubs(data.clubs, sort, q);
  const visible = list.slice(0, show);
  const href = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const next = { q: q || null, sort: sort === "total" ? null : sort, show: null as string | number | null, ...patch };
    for (const [k, v] of Object.entries(next)) if (v !== null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/clubs${s ? `?${s}` : ""}`;
  };
  const renderedAt = new Date().toISOString();
  return (
    <div className="grid grid-cols-1 gap-4">
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-display-xl uppercase">{t("title")}</h1>
        <p className="max-w-prose text-body-sm text-text-2">{t("intro", { count: formatNumber(data.clubs.length, l), season: LIVE_SEASON.name })}</p>
        {data.takenAt && (
          <p className="text-body-sm text-text-2">
            {tc("takenAt", { time: "" })}
            <RelativeTime iso={data.takenAt} now={renderedAt} />
          </p>
        )}
      </header>

      <form role="search" action="" className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-48 flex-1 gap-1">
          <span className="text-caption uppercase text-text-2">{t("searchLabel")}</span>
          <input name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} maxLength={32} className="h-11 rounded-md border border-border-strong bg-surface px-3 text-body placeholder:text-text-3" />
        </label>
        {sort !== "total" && <input type="hidden" name="sort" value={sort} />}
        <button type="submit" className="h-11 rounded-md bg-accent px-4 text-body-sm font-semibold text-accent-contrast">{t("searchButton")}</button>
      </form>

      <nav aria-label={t("sortLabel")} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1.5">
          {CLUB_SORTS.map((s) => (
            <li key={s}>
              <Link href={href({ sort: s === "total" ? null : s })} aria-current={sort === s ? "true" : undefined} className={cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-body-sm font-medium", sort === s ? "border-accent-ink bg-accent/15 text-text" : "border-border text-text-2 hover:text-text")}>
                {t(`sort.${s}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {list.length === 0 ? (
        <EmptyState title={t("none", { q })} body={t("noneHint")} />
      ) : (
        <>
          <p className="text-body-sm text-text-2">{q ? t("found", { count: list.length, q }) : t("showing", { shown: formatNumber(visible.length, l), count: formatNumber(list.length, l) })}</p>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-body-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="border-b border-border text-caption uppercase text-text-2">
                <tr>
                  <th scope="col" className="w-12 px-3 py-2 text-left font-medium">#</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("colClub")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("colMembers")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t(sort === "avg" ? "colAvg" : "colTotal")}</th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">{t("col7d")}</th>
                  <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">{t("colBest")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((c) => {
                  const best = c.bestName ? splitName(c.bestName) : null;
                  return (
                    <tr key={c.tag} className="hover:bg-surface-raised">
                      <td className="px-3 py-2 tnum text-text-2">{position.get(c.tag)}</td>
                      <td className="px-3 py-2">
                        <Link href={clubPath(c.tag)} className="flex min-h-8 flex-col justify-center hover:underline">
                          <span className="font-semibold">[{c.tag}]</span>
                          {c.name && <span className="text-[12px] text-text-2">{c.name}</span>}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tnum">{c.members}</td>
                      <td className="px-3 py-2 text-right tnum">{formatNumber(sort === "avg" ? c.avg : c.total, l)}</td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell">
                        <DeltaChip value={c.d7} compact />
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        <span className="flex items-center gap-2">
                          <LeagueBadge leagueNumber={c.bestLeague} />
                          {best ? (
                            <Link href={`/players/${playerSlug(c.bestName!)}`} className="min-w-0 truncate hover:underline">
                              {best.base}
                            </Link>
                          ) : (
                            <span className="italic text-text-2">{tc("hidden")}</span>
                          )}
                          <span className="tnum text-text-2">{formatRank(c.bestRank, l)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.length > visible.length && (
            <Link href={href({ show: show + CLUBS_PAGE })} scroll={false} className="justify-self-start text-body-sm font-semibold text-accent-ink underline">
              {t("more", { count: Math.min(CLUBS_PAGE, list.length - visible.length) })}
            </Link>
          )}
          <p className="text-[12px] text-text-2">{t("note")}</p>
        </>
      )}
    </div>
  );
}
