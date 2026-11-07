import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClasses } from "@/components/hq/Button";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { KpiCard } from "@/components/hq/KpiCard";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { SearchTrigger } from "@/components/hq/SearchTrigger";
import { ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { boardPath, DEFAULT_BOARD } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { getHome } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatNumber, type Locale } from "@/lib/format";
import { league as leagueOf, type LeagueTier } from "@/lib/league";
import { playerSlug, splitName } from "@/lib/players";
import type { HomeData } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates(locale, "/") };
}

const BAR: Record<LeagueTier, string> = {
  bronze: "bg-league-bronze/60",
  silver: "bg-league-silver/60",
  gold: "bg-league-gold/60",
  platinum: "bg-league-platinum/60",
  diamond: "bg-league-diamond/60",
  ruby: "bg-league-ruby/60",
};

/** Accueil : trouver un joueur en 5 secondes, voir l'état de la saison d'un coup d'œil (wireframe phase E). */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let data: HomeData | null = null;
  try {
    data = await getHome();
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }
  const maxLeague = data ? Math.max(1, ...data.leagues.map((x) => x.count)) : 1;
  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="grid grid-cols-1 gap-3 pt-2">
        <p className="text-caption uppercase text-accent-ink">{t("kicker")}</p>
        <h1 className="font-display text-display-xl uppercase md:text-[56px] md:leading-none">{t("title")}</h1>
        <p className="max-w-prose text-text-2">{t("intro")}</p>
        <div className="md:hidden">
          <SearchTrigger wide />
        </div>
      </section>

      {!data ? (
        <ErrorState title={te("title")} body={te("body")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section aria-labelledby="top10" className="grid grid-cols-1 content-start gap-2 lg:col-span-8">
            <div className="flex items-baseline justify-between">
              <h2 id="top10" className="font-display text-display-md uppercase">{t("top10")}</h2>
              {data.takenAt && <p className="text-body-sm text-text-2">{tc("takenAt", { time: "" })}<RelativeTime iso={data.takenAt} /></p>}
            </div>
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {data.top.map((r) => {
                const n = r.name ? splitName(r.name) : null;
                return (
                  <li key={r.rank}>
                    <Link href={r.name ? `/players/${playerSlug(r.name)}` : boardPath(DEFAULT_BOARD)} className="flex h-12 items-center gap-3 px-3 hover:bg-surface-raised">
                      <span className="w-6 text-right font-display text-[19px] font-bold tnum">{r.rank}</span>
                      <LeagueBadge leagueNumber={r.league} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {n ? (
                          <>
                            {n.base}
                            {n.tag && <span className="text-text-2">{n.tag}</span>}
                          </>
                        ) : (
                          <span className="italic text-text-2">{tc("hidden")}</span>
                        )}
                        {r.club && <span className="ml-2 text-body-sm text-text-2">{r.club}</span>}
                      </span>
                      <span className="text-right tnum">{formatNumber(r.score, l)}</span>
                      <DeltaChip value={r.d24} compact className="hidden w-16 justify-end text-body-sm sm:inline-flex" />
                    </Link>
                  </li>
                );
              })}
            </ol>
            <Link href={boardPath(DEFAULT_BOARD)} className={cn(buttonClasses.base, buttonClasses.primary, "justify-self-start")}>
              {t("seeAll")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </section>

          <div className="grid grid-cols-1 content-start gap-4 lg:col-span-4">
            {data.top500 && data.top500.score !== null && (
              <Link href="/top-500" className="block rounded-lg hover:ring-1 hover:ring-league-ruby/60">
                <KpiCard
                  label={t("top500")}
                  value={formatNumber(data.top500.score, l)}
                  unit="RS"
                  delta={<DeltaChip value={data.top500.change24h} />}
                  footer={
                    <>
                      {t("top500Hint")} <span className="font-semibold text-accent-ink underline">{t("top500More")}</span>
                    </>
                  }
                  className="border-league-ruby/40"
                />
              </Link>
            )}
            <section aria-labelledby="movers" className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="movers" className="text-caption uppercase text-text-2">{t("movers")}</h2>
                <Link href="/movers" className="text-body-sm font-semibold text-accent-ink underline">{t("moversAll")}</Link>
              </div>
              {data.movers.length === 0 ? (
                <p className="mt-2 text-body-sm text-text-2">{t("moversEmpty")}</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {data.movers.map((m) => (
                    <li key={m.name}>
                      <Link href={`/players/${playerSlug(m.name)}`} className="flex min-h-11 items-center gap-2 hover:underline">
                        <LeagueBadge leagueNumber={m.league} />
                        <span className="min-w-0 flex-1 truncate">{splitName(m.name).base}</span>
                        <DeltaChip value={m.d7} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {data.leagues.length > 0 && (
              <section aria-labelledby="dist" className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="dist" className="text-caption uppercase text-text-2">{t("distribution")}</h2>
                </div>
                <ul className="mt-3 grid gap-1.5">
                  {[...data.leagues].reverse().map((x) => {
                    const lg = leagueOf(x.league);
                    return (
                      <li key={x.league} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-body-sm">
                        <LeagueBadge leagueNumber={x.league} />
                        <span className="h-3 overflow-hidden rounded-sm bg-surface-raised">
                          <span className={cn("block h-full rounded-sm", lg ? BAR[lg.tier] : "bg-text-3")} style={{ width: `${(x.count / maxLeague) * 100}%` }} />
                        </span>
                        <span className="text-right tnum text-text-2">{formatNumber(x.count, l)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[12px] text-text-2">{t("distributionHint")}</p>
                {data.top500 && data.top500.lastScore !== null && data.top500.rank1Score !== null && (
                  <p className="mt-1 text-[12px] text-text-2">{t("range", { last: formatNumber(data.top500.lastScore, l), first: formatNumber(data.top500.rank1Score, l) })}</p>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
