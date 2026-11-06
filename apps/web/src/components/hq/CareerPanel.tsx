import { leaderboardById } from "@finals-hq/db/catalog";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { boardPath, boardShortName, scoreUnit } from "@/lib/boards";
import { formatNumber, formatRank, type Locale } from "@/lib/format";
import { league as leagueOf } from "@/lib/league";
import { ARCHIVED_RANKED_SEASONS, type Career } from "@/lib/profile";
import { InfoChip } from "./InfoChip";
import { LeagueBadge } from "./LeagueBadge";

/**
 * Onglet Carrière : records, badges, Legacy expliqué et frise des saisons, tout depuis les archives (V).
 * Les saisons d'avant les pseudos à 4 chiffres ne sont reliées que si le pseudo complet correspond.
 */
export function CareerPanel({ career, playerName }: { career: Career; playerName: string }) {
  const t = useTranslations("career");
  const tu = useTranslations("units");
  const locale = useLocale() as Locale;
  const { records, badges, legacy, seasons } = career;
  if (seasons.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-title">{t("empty")}</p>
        <p className="mx-auto mt-1 max-w-prose text-body-sm text-text-2">{t("emptyHint")}</p>
      </div>
    );
  }
  const seasonName = (id: string) => seasons.find((s) => s.seasonId === id)?.seasonName ?? id;
  const badgeList = [
    badges.first > 0 && t("badgeFirst", { count: badges.first }),
    badges.top100 > 0 && t("badgeTop100", { count: badges.top100 }),
    badges.top500 > 0 && t("badgeTop500", { count: badges.top500 }),
    badges.ruby > 0 && t("badgeRuby", { count: badges.ruby }),
    badges.seasonsPlayed > 0 && t("badgeSeasons", { count: badges.seasonsPlayed }),
  ].filter((b): b is string => Boolean(b));
  return (
    <>
      <section aria-labelledby="records" className="grid grid-cols-1 gap-3">
        <h2 id="records" className="text-title-lg">{t("records")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-caption uppercase text-text-2">{t("bestRank")}</p>
            <p className="mt-1 font-display text-display-lg tnum">{records.bestRank ? formatRank(records.bestRank.rank, locale) : "—"}</p>
            {records.bestRank && <p className="text-body-sm text-text-2">{seasonName(records.bestRank.seasonId)}</p>}
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-caption uppercase text-text-2">{t("bestScore")}</p>
            <p className="mt-1 font-display text-display-lg tnum">{records.bestScore ? `${formatNumber(records.bestScore.score, locale)} RS` : "—"}</p>
            {records.bestScore && <p className="text-body-sm text-text-2">{seasonName(records.bestScore.seasonId)} · {t("scoreNotComparable")}</p>}
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-caption uppercase text-text-2">{t("bestLeague")}</p>
            <div className="mt-1.5">{records.bestLeague ? <LeagueBadge leagueNumber={records.bestLeague.league} size="md" /> : <span className="font-display text-display-lg">—</span>}</div>
            {records.bestLeague && <p className="mt-1 text-body-sm text-text-2">{seasonName(records.bestLeague.seasonId)}</p>}
          </div>
        </div>
        {badgeList.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t("badges")}>
            {badgeList.map((b) => (
              <li key={b} className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-body-sm font-semibold text-accent-ink">
                {b}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="legacy" className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="legacy" className="text-title">{t("legacy")}</h2>
          <p className="font-display text-display-md tnum">
            {formatNumber(Math.round(legacy.value), locale)}
            <span className="text-body-sm text-text-2"> / 100</span>
          </p>
        </div>
        <p className="mt-1 max-w-prose text-body-sm text-text-2">{t("legacyExplain", { points: formatNumber(legacy.points, locale) })}</p>
        <p className="mt-1 text-[12px] text-text-2">{t("legacyScale")}</p>
      </section>

      <section aria-labelledby="timeline" className="grid grid-cols-1 gap-2">
        <h2 id="timeline" className="text-title-lg">{t("timeline")}</h2>
        <ol className="relative grid gap-2 border-l border-border pl-4">
          {seasons.map((s) => {
            const r = s.ranked;
            const lb = r ? leaderboardById(r.leaderboardId) : undefined;
            return (
              <li key={s.seasonId} className="relative rounded-lg border border-border bg-surface p-3">
                <span aria-hidden="true" className="absolute -left-[21px] top-5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-text-3" />
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-display-md">{s.seasonName}</h3>
                  {r && lb?.hasLeagues && s.hasComparableLeagues && <LeagueBadge leagueNumber={r.league} />}
                  {!s.hasComparableLeagues && <InfoChip tone="neutral" hint={t("noLeaguesHint")}>{t("noLeagues")}</InfoChip>}
                  {s.legacyPoints > 0 && <span className="ml-auto text-[12px] tnum text-text-2">{t("legacyPoints", { points: s.legacyPoints })}</span>}
                </div>
                {r && lb ? (
                  <Link href={`${boardPath(lb)}?q=${encodeURIComponent(playerName)}`} className="mt-1 flex flex-wrap items-baseline gap-x-3 text-body-sm hover:underline">
                    <span className="font-semibold tnum">{formatRank(r.rank, locale)}</span>
                    <span className="tnum text-text-2">
                      {formatNumber(r.score, locale)} {tu(scoreUnit(lb))}
                    </span>
                    <span className="text-text-2">{boardShortName(lb)}{r.platform && r.platform !== "crossplay" ? ` · ${r.platform}` : ""}</span>
                    {leagueOf(r.league) && !s.hasComparableLeagues && <span className="text-text-2">{leagueOf(r.league)!.name}</span>}
                  </Link>
                ) : (
                  <p className="mt-1 text-body-sm text-text-2">{t("noRanked")}</p>
                )}
                {s.others.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-2">
                    {s.others.map((o) => {
                      const olb = leaderboardById(o.leaderboardId)!;
                      return (
                        <li key={o.leaderboardId}>
                          <Link href={`${boardPath(olb)}?q=${encodeURIComponent(playerName)}`} className="hover:underline">
                            {boardShortName(olb)} <span className="tnum">{formatRank(o.rank, locale)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-[12px] text-text-2">{t("coverage", { archived: ARCHIVED_RANKED_SEASONS })}</p>
      </section>
    </>
  );
}
