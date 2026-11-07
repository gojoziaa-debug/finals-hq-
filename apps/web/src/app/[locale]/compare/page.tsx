import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompareChart } from "@/components/charts/CompareChart";
import { ComparePicker, CompareDot } from "@/components/hq/ComparePicker";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { ShareButton } from "@/components/hq/ShareButton";
import { ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { LIVE_SEASON } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { compareMetrics, comparePlayer, parseCompare, type CompareMetric, type ComparePlayer } from "@/lib/compare";
import { getPlayer } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatDate, formatNumber, formatRank, type Locale } from "@/lib/format";
import { namesFromSlug, playerSlug, splitName } from "@/lib/players";
import type { PlayerData } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = Promise<{ p?: string | string[] }>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Search }): Promise<Metadata> {
  const { locale } = await params;
  const slugs = parseCompare((await searchParams).p);
  const t = await getTranslations({ locale, namespace: "meta" });
  const names = slugs.map((s) => namesFromSlug(s)[0] ?? s);
  return {
    title: names.length >= 2 ? t("compareTitleNames", { names: names.map((n) => splitName(n).base).join(" vs ") }) : t("compareTitle"),
    description: t("compareDescription", { season: LIVE_SEASON.name }),
    robots: { index: false, follow: true },
    // Carte de partage : 2 à 4 colonnes (rang, RS, ligue) ; carte générique sous deux joueurs.
    ...(slugs.length >= 2 ? { openGraph: { images: [{ url: `/api/og/compare?p=${slugs.map(encodeURIComponent).join(",")}&l=${locale}`, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image" as const } } : {}),
  };
}

async function load(slug: string): Promise<PlayerData | null> {
  const names = namesFromSlug(slug);
  if (names.length === 0) return null;
  return getPlayer(names);
}

/** Comparaison de 2 à 4 joueurs (phase E) : /compare?p=GOJO-6255,Autre-1234, l'adresse se partage telle quelle. */
export default async function ComparePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Search }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const slugs = parseCompare((await searchParams).p);
  const t = await getTranslations("compare");
  const te = await getTranslations("errors");
  const tc = await getTranslations("common");
  const l = locale as Locale;
  let players: ComparePlayer[];
  try {
    const data = await Promise.all(slugs.map(load));
    players = slugs.map((s, i) => comparePlayer(s, data[i] ?? null));
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
    return <ErrorState title={te("title")} body={te("body")} />;
  }
  const renderedAt = new Date().toISOString();
  const now = Date.parse(renderedAt);
  const metrics = compareMetrics(players, now);
  const names = players.map((p) => (p.data && !p.data.hidden ? p.data.name : (namesFromSlug(p.slug)[0] ?? p.slug)));
  // Les slugs canoniques (casse et # corrigés) gardent l'URL partageable propre.
  const canonicalSlugs = players.map((p) => (p.data && !p.data.hidden ? decodeURIComponent(playerSlug(p.data.name)) : p.slug));
  const usable = players.map((p, color) => ({ p, color })).filter(({ p }) => p.data && !p.data.hidden);

  const value = (m: CompareMetric, i: number) => {
    const v = m.values[i] ?? null;
    if (v === null) return <span className="text-text-3">—</span>;
    switch (m.key) {
      case "rank":
      case "bestRank":
        return formatRank(v, l);
      case "league":
        return <LeagueBadge leagueNumber={v} />;
      case "d24":
      case "d7":
        return <DeltaChip value={v} />;
      case "gap500":
        return v === 0 ? t("inTop500") : `${formatNumber(v, l)} RS`;
      case "active7":
        return t("activeValue", { active: v, observed: m.notes[i] ?? "7" });
      case "rs":
      case "peak":
        return `${formatNumber(v, l)} RS`;
      default:
        return formatNumber(v, l);
    }
  };
  const note = (m: CompareMetric, i: number) => {
    const n = m.notes[i];
    if (!n) return null;
    if (m.key === "peak") return formatDate(new Date(n), l);
    if (m.key === "bestRank") return n.toUpperCase();
    return null;
  };
  const status = (p: ComparePlayer) => {
    if (!p.data) return t("notFound");
    if (p.data.hidden) return tc("hidden");
    if (!p.ranked) return p.lastSeen ? t("lastSeen", { date: formatDate(new Date(p.lastSeen.t), l), score: formatNumber(p.lastSeen.score!, l) }) : t("notInTop");
    return null;
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-display-xl uppercase">{t("title")}</h1>
          {players.length >= 2 && <ShareButton title={`${names.map((n) => splitName(n).base).join(" vs ")} · FINALS HQ`} />}
        </div>
        <p className="max-w-prose text-body-sm text-text-2">{t("intro", { season: LIVE_SEASON.name })}</p>
      </header>

      <ComparePicker slugs={canonicalSlugs} names={names} />

      {players.length < 2 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-body-sm text-text-2">{players.length === 0 ? t("emptyHint") : t("oneHint")}</p>
      ) : (
        <>
          {/* Téléphone : une carte par joueur, empilées. */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {players.map((p, i) => (
              <section key={p.slug} aria-labelledby={`p-${i}`} className={cn("overflow-hidden rounded-lg border border-border bg-surface", !p.ranked && "opacity-70")}>
                <h2 id={`p-${i}`} className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3 font-semibold">
                  <CompareDot index={i} />
                  {p.data && !p.data.hidden ? <Link href={`/players/${playerSlug(p.data.name)}`} className="min-w-0 truncate hover:underline">{names[i]}</Link> : <span className="min-w-0 truncate">{names[i]}</span>}
                </h2>
                {status(p) && <p className="px-4 pt-2 text-body-sm text-text-2">{status(p)}</p>}
                <dl className="divide-y divide-border">
                  {metrics.map((m) => (
                    <div key={m.key} className={cn("flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-body-sm", m.best.includes(i) && "bg-accent/10")}>
                      <dt className="text-text-2">{t(`metric.${m.key}`)}</dt>
                      <dd className="text-right font-semibold tnum">
                        {value(m, i)}
                        {note(m, i) && <span className="ml-1 text-[12px] font-normal text-text-2">{note(m, i)}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          {/* Ordinateur : une ligne par indicateur, une colonne par joueur, le meilleur surligné. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-body-sm">
              <caption className="sr-only">{t("tableCaption")}</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="w-48 px-4 py-3 text-left text-caption font-medium uppercase text-text-2">{t("metricCol")}</th>
                  {players.map((p, i) => (
                    <th key={p.slug} scope="col" className={cn("px-4 py-3 text-left font-semibold", !p.ranked && "opacity-70")}>
                      <span className="flex items-center gap-2">
                        <CompareDot index={i} />
                        {p.data && !p.data.hidden ? <Link href={`/players/${playerSlug(p.data.name)}`} className="min-w-0 truncate hover:underline">{names[i]}</Link> : <span className="truncate">{names[i]}</span>}
                      </span>
                      {status(p) && <span className="mt-0.5 block text-[12px] font-normal text-text-2">{status(p)}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.map((m) => (
                  <tr key={m.key}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-text-2">{t(`metric.${m.key}`)}</th>
                    {players.map((p, i) => (
                      <td key={p.slug} className={cn("px-4 py-2.5 font-semibold tnum", m.best.includes(i) && "bg-accent/10", !p.ranked && "opacity-70")}>
                        {m.best.includes(i) && <span className="sr-only">{t("best")} </span>}
                        {value(m, i)}
                        {note(m, i) && <span className="ml-1 text-[12px] font-normal text-text-2">{note(m, i)}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-text-2">{t("legend")}</p>

          {usable.length > 0 && <CompareChart players={usable.map(({ p, color }) => ({ name: splitName(p.data!.name).base, series: p.data!.live?.series ?? [], color }))} renderedAt={usable[0]!.p.data!.live?.takenAt ?? renderedAt} />}
        </>
      )}
    </div>
  );
}
