import { leaderboardById } from "@finals-hq/db/catalog";
import { GitCompare } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ActivityHeatmap } from "@/components/hq/ActivityHeatmap";
import { CareerPanel } from "@/components/hq/CareerPanel";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { FollowButton } from "@/components/hq/FollowButton";
import { InfoChip } from "@/components/hq/InfoChip";
import { KpiCard } from "@/components/hq/KpiCard";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { LeagueDistribution } from "@/components/hq/LeagueDistribution";
import { ProfileTabs } from "@/components/hq/ProfileTabs";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { RatingPanel } from "@/components/hq/RatingPanel";
import { RsChart } from "@/components/hq/RsChart";
import { ShareButton } from "@/components/hq/ShareButton";
import { StoryButton } from "@/components/hq/StoryButton";
import { Beacon } from "@/components/hq/Beacon";
import { EmptyState } from "@/components/hq/States";
import { StickyPlayerBar } from "@/components/hq/StickyPlayerBar";
import { SupporterBadge } from "@/components/hq/SupporterBadge";
import { buttonClasses } from "@/components/hq/Button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { boardPath, boardShortName, DEFAULT_BOARD, LIVE_SEASON, scoreUnit } from "@/lib/boards";
import { clubPath } from "@/lib/clubs";
import { compareHref } from "@/lib/compare";
import { getPlayer, getPlayerRating, ratingEnv } from "@/lib/data";
import { ratingVisibility } from "@/lib/rating";
import { formatDate, formatNumber, formatRank, type Locale } from "@/lib/format";
import { league as leagueOf } from "@/lib/league";
import { namesFromSlug, playerSlug, splitName } from "@/lib/players";
import { activeDays, career as careerOf, DAY_MS, daysSince, heatmap, lastPoint, peak, rankDelta, topPercent } from "@/lib/profile";
import type { PlayerData } from "@/lib/types";
import { cardPath } from "@/lib/cards";
import { alternates } from "@/lib/site";
import { supporterRole } from "@/lib/supporters";

export const revalidate = 120;

/** Aucun profil précalculé : chacun est rendu à la première visite puis gardé en cache ISR 120 s. */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; slug: string }>;

async function playerOrNull(candidates: string[]): Promise<PlayerData | null> {
  try {
    return await getPlayer(candidates);
  } catch {
    return null; // les métadonnées ne bloquent jamais la page ; la page affiche son propre état d'erreur
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const candidates = namesFromSlug(slug);
  const player = await playerOrNull(candidates);
  const name = player && !player.hidden ? player.name : (candidates[0] ?? slug);
  const key = player && !player.hidden ? playerSlug(player.name) : slug;
  const main = player?.current.find((c) => c.leaderboardId === DEFAULT_BOARD.id);
  const l = locale as Locale;
  const description = player?.hidden
    ? t("hiddenTitle")
    : main
    ? t("playerDescription", { name, rank: formatRank(main.rank, l), score: formatNumber(main.score, l), league: leagueOf(main.league)?.name ?? "—", season: LIVE_SEASON.name })
    : t("playerDescriptionNone", { name });
  const title = player?.hidden ? t("hiddenTitle") : t("playerTitle", { name });
  return {
    title,
    description,
    alternates: alternates(locale, `/players/${key}`),
    // Carte de partage (sprint 6) : image générée avec le rang et la courbe ; carte générique si masqué ou inconnu.
    openGraph: { title, description, images: [{ url: cardPath("player", key, locale), width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image" },
    robots: player?.hidden ? { index: false, follow: false } : undefined,
  };
}

/**
 * Profil joueur (sprint 3, wireframe de la phase E) : en-tête, courbe RS et rang, KPI, activité, répartition,
 * onglet Carrière depuis les archives, anciens pseudos. États : masqué, hors du top 10 000, inconnu.
 * Rating (sprint 5) : jauge, radar et composantes ; note cachée tant que la semaine de calibration n'est pas validée.
 */
export default async function PlayerPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");
  const tp = await getTranslations("player");
  const tu = await getTranslations("units");
  const l = locale as Locale;
  const candidates = namesFromSlug(slug);
  if (candidates.length === 0) notFound();
  const player = await getPlayer(candidates);
  if (!player) return <EmptyState title={tp("notFound")} body={tp("notFoundHint")} action={<Link href={`/search?q=${encodeURIComponent(candidates[0]!.split("#")[0]!)}`} className="text-body-sm font-semibold text-accent-ink underline">{tp("searchInstead")}</Link>} />;
  if (player.hidden) return <EmptyState title={tp("hidden")} />;

  const renderedAt = new Date().toISOString();
  const nowMs = Date.parse(renderedAt);
  const live = player.live!;
  const main = player.current.find((c) => c.leaderboardId === DEFAULT_BOARD.id) ?? null;
  const others = player.current.filter((c) => c.leaderboardId !== DEFAULT_BOARD.id);
  const n = splitName(player.name);
  const supporter = supporterRole(player.name);
  const platforms = [player.platforms.steam && `Steam · ${player.platforms.steam}`, player.platforms.psn && `PSN · ${player.platforms.psn}`, player.platforms.xbox && `Xbox · ${player.platforms.xbox}`].filter((p): p is string => Boolean(p));
  const club = main?.club ?? others.find((o) => o.club)?.club ?? null;
  const historyStartLabel = live.historyStart ? formatDate(new Date(`${live.historyStart}T00:00:00Z`), l) : "—";
  const career = careerOf(player.seasons);
  // Le Rating ne bloque jamais le profil : sans calcul (ou en cas d'erreur), le bloc garde son état « en calibration ».
  const rating = main ? await getPlayerRating(player.id).catch(() => null) : null;
  const visibility = rating ? ratingVisibility(rating.run, ratingEnv()) : null;

  // Indicateurs (D) : calculés sur nos relevés depuis le début de la collecte.
  const refNow = live.takenAt ? Date.parse(live.takenAt) : nowMs;
  const best = peak(live.series);
  const days7 = activeDays(live.activity, live.historyStart, nowMs, 7);
  const rank7 = rankDelta(live.series, refNow, 7 * DAY_MS);
  const firstRanked = live.series.find((p) => p.rank !== null && p.score !== null);
  const rankSinceStart = main && firstRanked?.rank ? main.rank - firstRanked.rank : null;
  const rankMove = rank7 ?? rankSinceStart;
  const pct = main && live.cutoff ? topPercent(main.rank, live.cutoff.rowCount) : null;
  const inactive = main ? daysSince(main.lastChangeAt, nowMs) : null;
  const activeRecently = main ? nowMs - Date.parse(main.lastChangeAt) < 3_600_000 && main.lastChangeAt !== main.firstSeenAt : false;
  const r500 = live.cutoff?.rank500 ?? null;
  const lastSeen = main ? null : lastPoint(live.series);

  const overview = (
    <>
      {main || live.series.length >= 2 ? <RsChart series={live.series} top500={r500} historyStart={live.historyStart} renderedAt={live.takenAt ?? renderedAt} playerName={player.name} /> : null}

      {main && (
        <section aria-label={t("kpis")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={t("kpiPeak")}
            value={best?.score != null ? formatNumber(best.score, l) : "—"}
            unit="RS"
            footer={best ? t("kpiPeakFooter", { date: formatDate(new Date(best.t), l), since: historyStartLabel }) : undefined}
          />
          <KpiCard label={t("kpiDays")} value={`${days7.active} / ${days7.observed}`} footer={days7.observed < 7 ? t("kpiDaysObserved", { count: days7.observed }) : t("kpiDays7")} />
          <KpiCard
            label={t("kpiTop500")}
            value={r500 === null ? "—" : main.rank <= 500 ? t("inTop500") : formatNumber(r500 - main.score, l)}
            unit={r500 !== null && main.rank > 500 ? "RS" : undefined}
            footer={r500 !== null ? t("kpiTop500Footer", { value: formatNumber(r500, l) }) : undefined}
          />
          <KpiCard
            label={t("kpiRank7")}
            value={<DeltaChip value={rankMove === null ? null : -rankMove} />}
            unit={rankMove ? t("places", { count: Math.abs(rankMove) }) : undefined}
            footer={rank7 !== null ? t("window.7d") : rankSinceStart !== null ? t("since", { date: historyStartLabel }) : undefined}
          />
        </section>
      )}

      {main && rating && visibility ? (
        <RatingPanel rating={rating} visibility={visibility} locale={l} renderedAt={renderedAt} />
      ) : main ? (
        <section aria-labelledby="rating" className="rounded-lg border border-dashed border-border bg-surface p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="rating" className="text-title">{t("ratingTitle")}</h2>
              <InfoChip tone="info" className="whitespace-nowrap">{t("ratingChip")}</InfoChip>
            </div>
            <p className="mt-0.5 text-body-sm text-text-2">{t("ratingBody")}</p>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="activity" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="activity" className="text-caption uppercase text-text-2">{t("activity")}</h2>
          <ActivityHeatmap days={heatmap(live.activity, live.historyStart, nowMs, 91)} className="mt-3" />
          <p className="mt-2 text-[12px] text-text-2">{t("activityHint", { date: historyStartLabel })}</p>
        </section>
        {live.cutoff && live.cutoff.leagueCounts.length > 0 && (
          <section aria-labelledby="where" className="rounded-lg border border-border bg-surface p-4">
            <h2 id="where" className="text-caption uppercase text-text-2">{main ? t("where") : t("entry", { value: formatNumber(live.cutoff.last ?? 0, l) })}</h2>
            <LeagueDistribution counts={live.cutoff.leagueCounts} highlight={main?.league ?? null} className="mt-3" />
            <p className="mt-3 text-[12px] text-text-2">{t("whereHint")}</p>
          </section>
        )}
      </div>

      {others.length > 0 && (
        <section aria-labelledby="current" className="grid grid-cols-1 gap-2">
          <h2 id="current" className="text-title-lg">{main ? t("otherBoards") : tp("current")}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {others.map((c) => {
              const lb = leaderboardById(c.leaderboardId)!;
              return (
                <li key={c.leaderboardId}>
                  <Link href={`${boardPath(lb)}?q=${encodeURIComponent(player.name)}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-raised">
                    <span className="flex-1 font-medium">{boardShortName(lb)}</span>
                    <span className="tnum">{formatRank(c.rank, l)}</span>
                    <span className="w-32 text-right tnum text-text-2">
                      {formatNumber(c.score, l)} {tu(scoreUnit(lb))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {player.formerNames.length > 0 && (
        <section aria-labelledby="former" className="grid grid-cols-1 gap-2">
          <h2 id="former" className="text-title-lg">{tp("former")}</h2>
          <ul className="flex flex-wrap gap-2 text-body-sm">
            {player.formerNames.map((f) => (
              <li key={f.name} className="rounded-md border border-border bg-surface px-3 py-1.5">
                {f.name} <span className="text-text-2">· {t("formerUntil", { date: formatDate(new Date(f.lastSeenAt), l) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <StickyPlayerBar sentinelId="player-header-end">
        <p className="min-w-0 flex-1 truncate font-display text-display-md">
          {n.base}
          {n.tag && <span className="text-text-2">{n.tag}</span>}
        </p>
        {main && <LeagueBadge leagueNumber={main.league} />}
        {main && <span className="tnum text-body-sm font-semibold">{formatRank(main.rank, l)}</span>}
        <FollowButton id={player.id} name={player.name} compact />
      </StickyPlayerBar>

      <header className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words font-display text-display-xl">
              {n.base}
              {n.tag && <span className="text-text-2">{n.tag}</span>}
            </h1>
            {supporter && <SupporterBadge role={supporter} className="mt-1.5" />}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-2">
              {platforms.length > 0 ? <span>{platforms.join(" · ")}</span> : <span title={t("noPlatformHint")}>{t("noPlatform")}</span>}
              <span>{t("firstSeen", { date: formatDate(new Date(player.firstSeenAt), l) })}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <FollowButton id={player.id} name={player.name} />
            <Link href={compareHref([decodeURIComponent(playerSlug(player.name))])} className={cn(buttonClasses.base, buttonClasses.secondary, "px-3")}>
              <GitCompare aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              <span className="sr-only sm:not-sr-only">{t("compare")}</span>
            </Link>
            <ShareButton title={`${player.name} · FINALS HQ`} compact />
            <StoryButton src={cardPath("player", playerSlug(player.name), locale, "story")} filename={`finals-hq-${decodeURIComponent(playerSlug(player.name))}-story.png`} />
          </div>
        </div>

        {main ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <LeagueBadge leagueNumber={main.league} size="lg" />
              {club && (
                <Link href={clubPath(club)} className="rounded-md border border-border px-2.5 py-1 text-body-sm font-semibold hover:bg-surface-raised">
                  [{club}]
                </Link>
              )}
              {activeRecently && (
                <InfoChip tone="accent" className="normal-case">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-contrast motion-safe:animate-pulse" />
                  {t("activeRecently")}
                </InfoChip>
              )}
              {inactive !== null && inactive >= 3 && <InfoChip tone="warning" className="normal-case">{t("inactive", { days: inactive })}</InfoChip>}
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
              <p className="font-display text-display-hero tnum" aria-label={t("rankLabel", { rank: formatRank(main.rank, l), board: boardShortName(DEFAULT_BOARD) })}>
                {formatRank(main.rank, l)}
              </p>
              <p className="font-display text-display-xl tnum">
                {formatNumber(main.score, l)} <span className="text-display-md text-text-2">RS</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body">
              <span className="inline-flex items-center gap-1.5">
                <DeltaChip value={main.d24} /> <span className="text-body-sm text-text-2">/ 24 h</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <DeltaChip value={main.d7} /> <span className="text-body-sm text-text-2">/ {t("window.7dShort")}</span>
              </span>
            </div>
            <p className="text-body-sm text-text-2">
              {pct !== null && <>{t("topPercent", { pct })} · </>}
              {t("board", { board: `${boardShortName(DEFAULT_BOARD)} ${LIVE_SEASON.name}` })} · {t("takenAt")} {live.takenAt ? <RelativeTime iso={live.takenAt} now={renderedAt} /> : "—"}
            </p>
          </>
        ) : (
          <section aria-labelledby="not-in-top" className="rounded-lg border border-border bg-surface p-4">
            <h2 id="not-in-top" className="text-title-lg">{tp("notInTop")}</h2>
            <p className="mt-1 max-w-prose text-body-sm text-text-2">
              {t("notInTopBody", { value: live.cutoff?.last != null ? formatNumber(live.cutoff.last, l) : "—" })}
            </p>
            {lastSeen ? (
              <p className="mt-3 text-body-sm">
                {t("lastSeen", { date: formatDate(new Date(lastSeen.t), l), rank: lastSeen.rank ? formatRank(lastSeen.rank, l) : "—", score: formatNumber(lastSeen.score!, l) })}
              </p>
            ) : (
              <p className="mt-3 text-body-sm text-text-2">{t("neverSeenLive", { season: LIVE_SEASON.name, date: historyStartLabel })}</p>
            )}
            <p className="mt-3 text-body-sm text-text-2">{t("followToKnow")}</p>
          </section>
        )}
        <div id="player-header-end" aria-hidden="true" />
      </header>

      <ProfileTabs overview={overview} career={<CareerPanel career={career} playerName={player.name} />} careerCount={career.seasons.length} />

      <p className="text-body-sm text-text-2">
        <Link href={`/privacy/request?player=${playerSlug(player.name)}`} className="underline hover:text-text">
          {t("hideOwn")}
        </Link>
      </p>
      <Beacon event="profile_view" />

    </div>
  );
}
