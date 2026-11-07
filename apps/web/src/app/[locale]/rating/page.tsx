import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoChip } from "@/components/hq/InfoChip";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { ComponentBar } from "@/components/hq/RatingVisuals";
import { EmptyState, ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { LIVE_SEASON } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { getRatingBoard, ratingEnv } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatDate, formatDecimal, formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import { ratingVisibility } from "@/lib/rating";
import type { RatingBoardData, RatingSort } from "@/lib/types";

export const dynamic = "force-dynamic";

const SORTS: RatingSort[] = ["rating", "momentum", "consistency"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("ratingTitle"), description: t("ratingDescription", { season: LIVE_SEASON.name }), alternates: alternates(locale, "/rating") };
}

/**
 * Classements du Rating (phase F, sprint 5) : Rating, Momentum, Consistance (100 premiers), plus le lien vers les
 * progressions du sprint 4. Pendant la semaine de calibration, la page dit où en est la mesure au lieu d'une liste.
 */
export default async function RatingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ by?: string | string[] }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const by = (SORTS as string[]).includes(one(sp.by) ?? "") ? (one(sp.by) as RatingSort) : "rating";
  const t = await getTranslations("ratingPage");
  const tr = await getTranslations("rating");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let data: RatingBoardData | null = null;
  try {
    data = await getRatingBoard(by);
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }
  if (!data) return <ErrorState title={te("title")} body={te("body")} />;
  const v = ratingVisibility(data.run, ratingEnv());
  const ready = v.readyAt ? formatDate(new Date(v.readyAt), l) : "—";
  const renderedAt = new Date().toISOString();
  const tab = (active: boolean) => cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-body-sm font-medium", active ? "border-accent-ink bg-accent/15 text-text" : "border-border text-text-2 hover:text-text");
  const valueOf = (r: RatingBoardData["rows"][number]) => (by === "rating" ? r.rating : by === "momentum" ? r.momentum : r.consistency);

  return (
    <div className="grid grid-cols-1 gap-4">
      <header className="grid grid-cols-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-display-xl uppercase">{t(`title.${by}`)}</h1>
          {!v.open && <InfoChip tone="info">{tr("calibrating")}</InfoChip>}
          {v.open && v.preview && <InfoChip tone="warning" hint={tr("previewHint")}>{tr("preview")}</InfoChip>}
        </div>
        <p className="max-w-prose text-body-sm text-text-2">{t(`intro.${by}`)}</p>
        {data.run && (
          <p className="text-body-sm text-text-2">
            {tr("computed")} <RelativeTime iso={data.run.computedAt} now={renderedAt} /> · {t("players", { count: formatNumber(data.run.players, l) })}
          </p>
        )}
      </header>

      <nav aria-label={t("tabsLabel")}>
        <ul className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <li key={s}>
              <Link href={s === "rating" ? "/rating" : `/rating?by=${s}`} aria-current={by === s ? "true" : undefined} className={tab(by === s)}>{t(`tab.${s}`)}</Link>
            </li>
          ))}
          <li><Link href="/movers" className={tab(false)}>{t("tab.movers")}</Link></li>
        </ul>
      </nav>

      {!v.open ? (
        <section aria-labelledby="calibration" className="rounded-lg border border-dashed border-border bg-surface p-4">
          <h2 id="calibration" className="text-title">{t("calibrationTitle")}</h2>
          <p className="mt-1 max-w-prose text-body-sm text-text-2">{t("calibrationBody", { date: ready })}</p>
          <div className="mt-3 max-w-md">
            <div className="h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuemin={0} aria-valuemax={v.calibrationDays} aria-valuenow={Math.round(v.observedDays * 10) / 10} aria-label={tr("progressLabel")}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, Math.min(1, v.observedDays / v.calibrationDays) * 100)}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-text-2">{tr("progress", { days: formatDecimal(Math.floor(v.observedDays * 10) / 10, l), total: v.calibrationDays })}</p>
          </div>
          <p className="mt-3 text-body-sm">
            <Link href="/methodology" className="font-semibold text-accent-ink underline">{tr("methodLink")}</Link>
          </p>
        </section>
      ) : data.rows.length === 0 ? (
        <EmptyState title={t("empty")} body={t(`emptyHint.${by}`)} />
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {data.rows.map((r) => {
            const n = splitName(r.name);
            const value = valueOf(r);
            return (
              <li key={r.name} className="grid min-h-12 grid-cols-[2rem_auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5">
                <span className="text-right font-display text-[19px] font-bold tnum text-text-2">{r.position}</span>
                <LeagueBadge leagueNumber={r.league} />
                <span className="min-w-0">
                  <Link href={`/players/${playerSlug(r.name)}`} className="block truncate font-medium hover:underline">
                    {n.base}
                    {n.tag && <span className="text-text-2">{n.tag}</span>}
                  </Link>
                  <span className="text-[12px] text-text-2 tnum">
                    {formatRank(r.rank, l)} · {formatNumber(r.score, l)} RS
                    {by !== "rating" && r.rating !== null && <> · {tr("title")} {r.rating}</>}
                    {r.hotStreak && <> · <span className="font-semibold text-accent-ink">{tr("hotStreak")}</span></>}
                  </span>
                  {by !== "rating" && <ComponentBar value={value} className="mt-1 max-w-[180px]" />}
                </span>
                <span className="text-right">
                  <span className="font-display text-display-md tnum">{value === null ? "—" : by === "rating" ? value : formatNumber(Math.round(value), l)}</span>
                  {by === "rating" && r.provisional && <span className="block text-[11px] uppercase text-text-2">{tr("provisionalShort")}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-[12px] text-text-2">{t(`note.${by}`)}</p>
    </div>
  );
}
