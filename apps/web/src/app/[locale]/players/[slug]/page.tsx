import { leaderboardById } from "@finals-hq/db/catalog";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { InfoChip } from "@/components/hq/InfoChip";
import { KpiCard } from "@/components/hq/KpiCard";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { EmptyState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { boardPath, boardShortName, DEFAULT_BOARD, scoreUnit } from "@/lib/boards";
import { getPlayer } from "@/lib/data";
import { formatDate, formatNumber, formatRank, type Locale } from "@/lib/format";
import { namesFromSlug, splitName } from "@/lib/players";

export const revalidate = 120;

/** Aucun profil précalculé : chacun est rendu à la première visite puis gardé en cache ISR 120 s. */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const name = namesFromSlug(slug)[0] ?? slug;
  return { title: t("playerTitle", { name }), alternates: { canonical: `/${locale}/players/${slug}` } };
}

/**
 * Profil minimal du sprint 2 (pour que chaque ligne de classement mène quelque part) : identité, classements en cours,
 * saisons passées, anciens pseudos. Courbes, Carrière et Rating arrivent au sprint 3.
 */
export default async function PlayerPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("player");
  const tu = await getTranslations("units");
  const l = locale as Locale;
  const candidates = namesFromSlug(slug);
  const player = await getPlayer(candidates);
  if (!player) {
    if (candidates.length === 0) notFound();
    return <EmptyState title={t("notFound")} body={t("notFoundHint")} />;
  }
  if (player.hidden) return <EmptyState title={t("hidden")} />;
  const n = splitName(player.name);
  const main = player.current.find((c) => c.leaderboardId === DEFAULT_BOARD.id);
  const platforms = [player.platforms.steam && `Steam · ${player.platforms.steam}`, player.platforms.psn && `PSN · ${player.platforms.psn}`, player.platforms.xbox && `Xbox · ${player.platforms.xbox}`].filter(Boolean);
  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid grid-cols-1 gap-2">
        <h1 className="font-display text-display-xl">
          {n.base}
          {n.tag && <span className="text-text-2">{n.tag}</span>}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-2">
          {main && <LeagueBadge leagueNumber={main.league} size="md" />}
          {main?.club && <span>{main.club}</span>}
          {platforms.length > 0 && <span>{platforms.join(" · ")}</span>}
          <span>{t("firstSeen", { date: formatDate(new Date(player.firstSeenAt), l) })}</span>
        </div>
        <InfoChip tone="info" className="justify-self-start normal-case">{t("minimal")}</InfoChip>
      </header>

      {main ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label={boardShortName(DEFAULT_BOARD)} value={formatRank(main.rank, l)} footer={<RelativeTime iso={main.updatedAt} />} />
          <KpiCard label="RS" value={formatNumber(main.score, l)} />
          <KpiCard label="24 h" value={<DeltaChip value={main.d24} />} />
          <KpiCard label={l === "fr" ? "7 j" : "7d"} value={<DeltaChip value={main.d7} />} />
        </div>
      ) : (
        <EmptyState title={t("notInTop")} body={t("notInTopHint")} />
      )}

      {player.current.length > 0 && (
        <section aria-labelledby="current" className="grid grid-cols-1 gap-2">
          <h2 id="current" className="text-title-lg">{t("current")}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {player.current.map((c) => {
              const lb = leaderboardById(c.leaderboardId)!;
              return (
                <li key={c.leaderboardId}>
                  <Link href={`${boardPath(lb)}?q=${encodeURIComponent(player.name)}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-raised">
                    <span className="flex-1 font-medium">{boardShortName(lb)}</span>
                    <span className="tnum">{formatRank(c.rank, l)}</span>
                    <span className="w-32 text-right tnum text-text-2">{formatNumber(c.score, l)} {tu(scoreUnit(lb))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {player.seasons.length > 0 && (
        <section aria-labelledby="seasons" className="grid grid-cols-1 gap-2">
          <h2 id="seasons" className="text-title-lg">{t("seasons")}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {player.seasons.map((s) => {
              const lb = leaderboardById(s.leaderboardId)!;
              return (
                <li key={s.leaderboardId}>
                  <Link href={`${boardPath(lb)}?q=${encodeURIComponent(player.name)}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-raised">
                    <span className="min-w-0 flex-1 truncate">{lb.name}</span>
                    {lb.hasLeagues && <LeagueBadge leagueNumber={s.league} />}
                    <span className="tnum">{formatRank(s.rank, l)}</span>
                    <span className="hidden w-32 text-right tnum text-text-2 sm:block">{formatNumber(s.score, l)} {tu(scoreUnit(lb))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {player.formerNames.length > 0 && (
        <section aria-labelledby="former" className="grid grid-cols-1 gap-2">
          <h2 id="former" className="text-title-lg">{t("former")}</h2>
          <ul className="flex flex-wrap gap-2 text-body-sm">
            {player.formerNames.map((f) => (
              <li key={f.name} className="rounded-md border border-border bg-surface px-3 py-1.5">
                {f.name} <span className="text-text-2">· {formatDate(new Date(f.lastSeenAt), l)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
