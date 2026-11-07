import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { cardPath } from "@/lib/cards";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { KpiCard } from "@/components/hq/KpiCard";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { ShareButton } from "@/components/hq/ShareButton";
import { EmptyState, ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { boardPath, DEFAULT_BOARD, LIVE_SEASON } from "@/lib/boards";
import { clubPosition, summarizeClub } from "@/lib/clubs";
import { getClub, getClubs } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatDate, formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { ClubData } from "@/lib/types";

export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; tag: string }>;

function decodeTag(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, tag: raw } = await params;
  const tag = decodeTag(raw);
  const t = await getTranslations({ locale, namespace: "meta" });
  const path = `/clubs/${encodeURIComponent(tag)}`;
  return { title: t("clubTitle", { tag }), description: t("clubDescription", { tag, season: LIVE_SEASON.name }), alternates: alternates(locale, path), openGraph: { images: [{ url: cardPath("club", encodeURIComponent(tag), locale), width: 1200, height: 630, alt: t("clubTitle", { tag }) }] }, twitter: { card: "summary_large_image" } };
}

/** Page club (phase E) : en-tête, KPI (RS moyen, meilleur rang, progression 7 j), membres classés avec leur ligue. */
export default async function ClubPage({ params }: { params: Params }) {
  const { locale, tag: raw } = await params;
  setRequestLocale(locale);
  const tag = decodeTag(raw);
  const t = await getTranslations("club");
  const tc = await getTranslations("common");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let club: ClubData | null = null;
  let position: number | null = null;
  let clubCount = 0;
  try {
    const [c, all] = await Promise.all([getClub(tag), getClubs().catch(() => null)]);
    club = c;
    if (c && all) {
      position = clubPosition(all.clubs, c.tag);
      clubCount = all.clubs.length;
    }
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
    return <ErrorState title={te("title")} body={te("body")} />;
  }
  if (!club) {
    return <EmptyState title={t("notFound", { tag })} body={t("notFoundHint")} action={<Link href={`/clubs?q=${encodeURIComponent(tag)}`} className="text-body-sm font-semibold text-accent-ink underline">{t("searchClubs")}</Link>} />;
  }
  const s = summarizeClub(club.members);
  const renderedAt = new Date().toISOString();
  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid grid-cols-1 gap-2">
        <Link href="/clubs" className="text-body-sm text-text-2 hover:text-text">← {t("back")}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words font-display text-display-xl">[{club.tag}]</h1>
            {club.name && <p className="text-body text-text-2">{club.name}</p>}
          </div>
          <ShareButton title={`[${club.tag}] · FINALS HQ`} />
        </div>
        <p className="text-body-sm text-text-2">
          {position !== null ? t("position", { position: formatNumber(position, l), count: formatNumber(clubCount, l) }) : t("unranked")} · {t("board", { board: `Ranked ${LIVE_SEASON.name}` })}
          {club.takenAt && (
            <>
              {" · "}
              {tc("takenAt", { time: "" })}
              <RelativeTime iso={club.takenAt} now={renderedAt} />
            </>
          )}
        </p>
      </header>

      {s.members === 0 ? (
        <EmptyState title={t("noMembers")} body={t("noMembersHint", { date: club.lastSeenAt ? formatDate(new Date(club.lastSeenAt), l) : "—" })} />
      ) : (
        <>
          <section aria-label={t("kpis")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={t("kpiMembers")} value={formatNumber(s.members, l)} footer={s.inTop500 > 0 ? t("kpiTop500", { count: s.inTop500 }) : t("kpiMembersFooter")} />
            <KpiCard label={t("kpiAvg")} value={formatNumber(s.avg!, l)} unit="RS" footer={t("kpiTotal", { value: formatNumber(s.total, l) })} />
            <KpiCard label={t("kpiBest")} value={formatRank(s.bestRank!, l)} />
            <KpiCard label={t("kpi7d")} value={<DeltaChip value={s.d7} />} unit={s.d7 !== null ? "RS" : undefined} footer={s.d7 === null ? t("kpi7dPending") : t("kpi7dFooter", { count: s.d7Known })} />
          </section>

          <section aria-labelledby="members" className="grid grid-cols-1 gap-2">
            <h2 id="members" className="text-title-lg">{t("members")}</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-body-sm">
                <caption className="sr-only">{t("members")}</caption>
                <thead className="border-b border-border text-caption uppercase text-text-2">
                  <tr>
                    <th scope="col" className="w-16 px-2 py-2 text-left font-medium sm:w-20 sm:px-3">#</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t("colPlayer")}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">RS</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">24 h</th>
                    <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">7 j</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {club.members.map((m) => {
                    const n = m.name ? splitName(m.name) : null;
                    return (
                      <tr key={m.rank} className="hover:bg-surface-raised">
                        <td className="whitespace-nowrap px-2 py-2 tnum sm:px-3">{formatRank(m.rank, l)}</td>
                        <td className="px-3 py-2">
                          {n ? (
                            <Link href={`/players/${playerSlug(m.name!)}`} className="flex min-h-8 items-center gap-2 font-medium hover:underline">
                              <LeagueBadge leagueNumber={m.league} />
                              <span className="min-w-0 max-w-[10rem] truncate sm:max-w-none">
                                {n.base}
                                {n.tag && <span className="text-text-2">{n.tag}</span>}
                              </span>
                            </Link>
                          ) : (
                            <span className="flex min-h-8 items-center gap-2">
                              <LeagueBadge leagueNumber={m.league} />
                              <span className="italic text-text-2">{tc("hidden")}</span>
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tnum sm:px-3">{formatNumber(m.score, l)}</td>
                        <td className="hidden px-3 py-2 text-right sm:table-cell"><DeltaChip value={m.d24} compact /></td>
                        <td className="hidden px-3 py-2 text-right sm:table-cell"><DeltaChip value={m.d7} compact /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-text-2">{t("note")}</p>
            <Link href={`${boardPath(DEFAULT_BOARD)}?club=${encodeURIComponent(club.tag)}`} className="justify-self-start text-body-sm font-semibold text-accent-ink underline">{t("onBoard")}</Link>
          </section>
        </>
      )}
    </div>
  );
}
