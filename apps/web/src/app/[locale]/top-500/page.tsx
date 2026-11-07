import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Top500Chart } from "@/components/charts/Top500Chart";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { FollowedVsLine } from "@/components/hq/FollowedVsLine";
import { InfoChip } from "@/components/hq/InfoChip";
import { KpiCard } from "@/components/hq/KpiCard";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { boardPath, DEFAULT_BOARD, LIVE_SEASON } from "@/lib/boards";
import { cutoffChange, DAY_MS, projectTop500 } from "@/lib/cutoff";
import { getPastThresholds, getTop500 } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatDate, formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { PastThreshold, Top500Data } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("top500Title"), description: t("top500Description", { season: LIVE_SEASON.name }), alternates: alternates(locale, "/top-500") };
}

/**
 * Ligne top 500 (sprint 4) : RS du 500e en direct, courbe, projection dès 7 jours de relevés, joueurs autour de la ligne,
 * joueurs suivis face à la ligne, seuils des saisons passées. Libellé « Ruby » si la ligue apparaît en S12.
 */
export default async function Top500Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("top500");
  const tc = await getTranslations("common");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let data: Top500Data | null = null;
  let past: PastThreshold[] = [];
  try {
    [data, past] = await Promise.all([getTop500(), getPastThresholds().catch(() => [])]);
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }
  const renderedAt = new Date().toISOString();
  if (!data) return <ErrorState title={te("title")} body={te("body")} />;

  const projection = projectTop500(data.series);
  const latest = data.latest;
  const r500 = latest?.rank500 ?? null;
  const ruby = latest?.leagueCounts.find((x) => x.league === 21)?.count ?? 0;
  const historyStart = data.series[0]?.t.slice(0, 10) ?? null;
  const d24 = cutoffChange(data.series, DAY_MS);
  const span = projection.observedDays < 1 ? t("spanHours", { count: Math.floor(projection.observedDays * 24) }) : t("spanDays", { count: new Intl.NumberFormat(l === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 1 }).format(Math.floor(projection.observedDays * 10) / 10) });
  const d7 = projection.observedDays >= 7 ? cutoffChange(data.series, 7 * DAY_MS) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid grid-cols-1 gap-2">
        <p className="text-caption uppercase text-league-ruby-ink">{t("kicker", { season: LIVE_SEASON.name })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-display-xl uppercase">{ruby > 0 ? t("titleRuby") : t("title")}</h1>
          {ruby > 0 && <InfoChip tone="accent">{t("rubyChip", { count: ruby })}</InfoChip>}
        </div>
        <p className="max-w-prose text-body-sm text-text-2">{ruby > 0 ? t("introRuby") : t("intro")}</p>
        {data.takenAt && (
          <p className="text-body-sm text-text-2">
            {tc("takenAt", { time: "" })}
            <RelativeTime iso={data.takenAt} now={renderedAt} />
          </p>
        )}
      </header>

      <section aria-label={t("kpis")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("kpiLine")} value={r500 === null ? "—" : formatNumber(r500, l)} unit="RS" delta={<DeltaChip value={d24} />} footer={t("kpiLineFooter")} className="col-span-2 border-league-ruby/40 lg:col-span-1" />
        <KpiCard label={t("kpi7d")} value={<DeltaChip value={d7} />} unit={d7 !== null ? "RS" : undefined} footer={d7 === null ? t("kpi7dPending", { span }) : t("kpi7dFooter")} />
        <KpiCard label={t("kpiFirst")} value={latest?.rank1 == null ? "—" : formatNumber(latest.rank1, l)} unit="RS" footer={r500 !== null && latest?.rank1 != null ? t("kpiFirstFooter", { gap: formatNumber(latest.rank1 - r500, l) }) : undefined} />
        <KpiCard label={t("kpiLast")} value={latest?.last == null ? "—" : formatNumber(latest.last, l)} unit="RS" footer={t("kpiLastFooter", { count: formatNumber(latest?.rowCount ?? 0, l) })} />
      </section>

      <Top500Chart series={data.series} projection={projection} renderedAt={data.takenAt ?? renderedAt} historyStart={historyStart} />

      <section aria-labelledby="projection" className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="projection" className="text-title">{t("projectionTitle")}</h2>
          <InfoChip tone="info" hint={tc("deducedHint")}>{tc("deduced")}</InfoChip>
        </div>
        {projection.available ? (
          <>
            <p className="mt-1 max-w-prose text-body-sm text-text-2">
              {t("projectionBody", { slope: formatNumber(projection.slopePerDay, l), low: formatNumber(projection.slopeLow, l), high: formatNumber(projection.slopeHigh, l) })}
            </p>
            <table className="mt-3 w-full text-body-sm">
              <caption className="sr-only">{t("projectionTitle")}</caption>
              <thead className="text-caption uppercase text-text-2">
                <tr>
                  <th scope="col" className="py-1 text-left font-medium">{t("colWhen")}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t("colMid")}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t("colRange")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projection.points.map((p) => (
                  <tr key={p.days}>
                    <td className="py-2">{t("inDays", { count: p.days, date: formatDate(new Date(p.t), l) })}</td>
                    <td className="py-2 text-right font-semibold tnum">{formatNumber(p.mid, l)}</td>
                    <td className="py-2 text-right tnum text-text-2">{formatNumber(p.low, l)} – {formatNumber(p.high, l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] text-text-2">{t("coverage", { pct: Math.round(projection.coverage * 100), count: projection.fitPoints })}</p>
          </>
        ) : (
          <p className="mt-1 max-w-prose text-body-sm text-text-2">
            {t("projectionPending", { span, date: projection.availableFrom ? formatDate(new Date(projection.availableFrom), l) : "—" })}
          </p>
        )}
        <p className="mt-2 text-[12px] text-text-2">{t("projectionMethod")}</p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="around" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="around" className="text-caption uppercase text-text-2">{t("around")}</h2>
          {data.around.length === 0 ? (
            <p className="mt-2 text-body-sm text-text-2">{t("aroundEmpty")}</p>
          ) : (
            <ol className="mt-2 divide-y divide-border">
              {data.around.map((r) => {
                const n = r.name ? splitName(r.name) : null;
                return (
                  <li key={r.rank} className={r.rank === 500 ? "border-l-[3px] border-league-ruby-ink font-semibold" : undefined}>
                    <Link href={r.name ? `/players/${playerSlug(r.name)}` : boardPath(DEFAULT_BOARD)} className="flex min-h-11 items-center gap-2 px-1 hover:underline">
                      <span className="w-14 tnum text-body-sm font-semibold">{formatRank(r.rank, l)}</span>
                      <LeagueBadge leagueNumber={r.league} />
                      <span className="min-w-0 flex-1 truncate">
                        {n ? (
                          <>
                            {n.base}
                            {n.tag && <span className="text-text-2">{n.tag}</span>}
                          </>
                        ) : (
                          <span className="italic text-text-2">{tc("hidden")}</span>
                        )}
                      </span>
                      <span className="tnum text-body-sm">{formatNumber(r.score, l)}</span>
                      <DeltaChip value={r.d24} compact className="hidden w-14 justify-end text-body-sm sm:inline-flex" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <Link href={boardPath(DEFAULT_BOARD)} className="mt-3 inline-block text-body-sm font-semibold text-accent-ink underline">{t("seeBoard")}</Link>
        </section>

        <section aria-labelledby="followed" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="followed" className="text-caption uppercase text-text-2">{t("followed")}</h2>
          <div className="mt-2">{r500 !== null ? <FollowedVsLine rank500={r500} /> : <p className="text-body-sm text-text-2">—</p>}</div>
        </section>
      </div>

      <section aria-labelledby="past" className="grid grid-cols-1 gap-2">
        <h2 id="past" className="text-title-lg">{t("past")}</h2>
        <p className="max-w-prose text-body-sm text-text-2">{t("pastHint")}</p>
        {past.length === 0 ? (
          <p className="text-body-sm text-text-2">{t("pastEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-body-sm">
              <caption className="sr-only">{t("past")}</caption>
              <thead className="border-b border-border text-caption uppercase text-text-2">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("colSeason")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("col500")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("colLeague")}</th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">{t("col1")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {past.map((p) => (
                  <tr key={p.leaderboardId}>
                    <td className="px-3 py-2 font-medium">{p.seasonName}</td>
                    <td className="px-3 py-2 text-right tnum">{p.rank500 === null ? "—" : formatNumber(p.rank500, l)}</td>
                    <td className="px-3 py-2">{p.league500 !== null ? <LeagueBadge leagueNumber={p.league500} /> : <span className="text-text-2">—</span>}</td>
                    <td className="hidden px-3 py-2 text-right tnum text-text-2 sm:table-cell">{p.rank1 === null ? "—" : formatNumber(p.rank1, l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
