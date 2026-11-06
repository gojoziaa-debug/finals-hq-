import { RATING_VERSION } from "@finals-hq/core/rating";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoChip } from "@/components/hq/InfoChip";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { shownValue } from "@/components/hq/RatingPanel";
import { Link } from "@/i18n/navigation";
import { getRatingExample, getRatingRun, ratingEnv } from "@/lib/data";
import { formatDate, formatDecimal, formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug } from "@/lib/players";
import { COMPONENTS, contributions, ratingVisibility, WEIGHTS } from "@/lib/rating";
import type { PlayerRatingData, RatingRunInfo } from "@/lib/types";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("methodologyTitle"), description: t("methodologyDescription"), alternates: { canonical: `/${locale}/methodology`, languages: { fr: "/fr/methodology", en: "/en/methodology" } } };
}

const ROUND = (x: number | null | undefined, l: Locale, digits = 0) => (x === null || x === undefined ? "n/d" : formatDecimal(x, l, digits));

/**
 * Méthodologie du FINALS HQ Rating v1 (phase D) avec un exemple vivant : le 500e du classement, ses composantes
 * et leur poids, et les références de population du dernier calcul. Les lectures en base sont facultatives :
 * sans elles la page reste lisible (formules seules).
 */
export default async function MethodologyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("methodology");
  const tr = await getTranslations("rating");
  const l = locale as Locale;
  const [run, example] = await Promise.all([getRatingRun().catch((): RatingRunInfo | null => null), getRatingExample().catch(() => null)]);
  const v = ratingVisibility(run, ratingEnv());
  const renderedAt = new Date().toISOString();
  const ex: PlayerRatingData | null = example?.rating ?? null;

  const section = "rounded-lg border border-border bg-surface p-4";
  const formula = "mt-2 overflow-x-auto rounded-md bg-surface-raised px-3 py-2 font-mono text-[13px]";

  return (
    <article className="grid max-w-3xl grid-cols-1 gap-5">
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-display-xl uppercase">{t("title")}</h1>
        <p className="text-body text-text-2">{t("intro")}</p>
        <p className="text-body-sm text-text-2">{t("version", { version: RATING_VERSION })}</p>
      </header>

      <section aria-labelledby="m-formula" className={section}>
        <h2 id="m-formula" className="text-title">{t("formulaTitle")}</h2>
        <p className={formula}>Rating = min(99, Σ wᵢ·xᵢ / Σ wᵢ)</p>
        <p className="mt-2 text-body-sm text-text-2">{t("formulaBody")}</p>
        <table className="mt-3 w-full text-body-sm">
          <thead>
            <tr className="text-left text-caption uppercase text-text-2">
              <th className="py-1 font-medium">{t("component")}</th>
              <th className="py-1 text-right font-medium">{t("weight")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {COMPONENTS.map((k) => (
              <tr key={k}>
                <td className="py-1.5">{tr(`component.${k}`)}</td>
                <td className="py-1.5 text-right tnum">{formatNumber(WEIGHTS[k] * 100, l)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(["level", "peak", "momentum", "consistency", "legacy"] as const).map((k) => (
        <section key={k} aria-labelledby={`m-${k}`} className={section}>
          <h2 id={`m-${k}`} className="text-title">{tr(`component.${k}`)}</h2>
          <p className={formula}>{t(`formula.${k}`)}</p>
          <p className="mt-2 text-body-sm text-text-2">{t(`body.${k}`)}</p>
        </section>
      ))}

      <section aria-labelledby="m-signals" className={section}>
        <h2 id="m-signals" className="text-title">{t("signalsTitle")}</h2>
        <p className="mt-1 text-body-sm text-text-2">{t("signalsBody")}</p>
      </section>

      <section aria-labelledby="m-calibration" className={section}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="m-calibration" className="text-title">{t("calibrationTitle")}</h2>
          {!v.open && <InfoChip tone="info">{tr("calibrating")}</InfoChip>}
        </div>
        <p className="mt-1 text-body-sm text-text-2">{t("calibrationBody", { date: v.readyAt ? formatDate(new Date(v.readyAt), l) : "—" })}</p>
        {run && (
          <>
            <table className="mt-3 w-full text-body-sm">
              <thead>
                <tr className="text-left text-caption uppercase text-text-2">
                  <th className="py-1 font-medium">{t("reference")}</th>
                  <th className="py-1 text-right font-medium">{t("measured")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tnum">
                {(["h24", "d7", "d30"] as const).map((w) => {
                  const r = run.refs.momentum[w];
                  return (
                    <tr key={w}>
                      <td className="py-1.5">{t(`refMomentum.${w}`)}</td>
                      <td className="py-1.5 text-right">{r ? t("medianMad", { median: ROUND(r.median, l), mad: ROUND(r.mad, l), n: formatNumber(r.n, l) }) : t("notYet")}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-1.5">{t("refDrawdown")}</td>
                  <td className="py-1.5 text-right">{run.refs.drawdown ? t("drawdownValue", { median: ROUND(run.refs.drawdown.median, l), n: formatNumber(run.refs.drawdown.n, l) }) : t("notYet")}</td>
                </tr>
                <tr>
                  <td className="py-1.5">{t("refAnomaly")}</td>
                  <td className="py-1.5 text-right">{run.refs.anomalyThreshold === null ? t("notYet") : `${ROUND(run.refs.anomalyThreshold, l)} RS`}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-text-2">
              {t("observed", { days: formatDecimal(Math.floor(run.observedDays * 10) / 10, l), total: run.calibrationDays, players: formatNumber(run.players, l) })} · {tr("computed")} <RelativeTime iso={run.computedAt} now={renderedAt} />
            </p>
          </>
        )}
      </section>

      {example && ex && (
        <section aria-labelledby="m-example" className={section}>
          <h2 id="m-example" className="text-title">{t("exampleTitle")}</h2>
          <p className="mt-1 text-body-sm text-text-2">
            {t("exampleIntro", { rank: formatRank(example.rank, l) })}{" "}
            <Link href={`/players/${playerSlug(example.name)}`} className="font-semibold text-accent-ink underline">{example.name}</Link>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-body-sm">
            <LeagueBadge leagueNumber={example.league} /> {formatRank(example.rank, l)} · {formatNumber(example.score, l)} RS
          </p>
          <table className="mt-3 w-full text-body-sm">
            <thead>
              <tr className="text-left text-caption uppercase text-text-2">
                <th className="py-1 font-medium">{t("component")}</th>
                <th className="py-1 text-right font-medium">{t("value")}</th>
                <th className="py-1 text-right font-medium">{t("weight")}</th>
                <th className="py-1 text-right font-medium">{t("points")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tnum">
              {contributions(ex).map(({ key, weight, points }) => {
                const shown = shownValue(ex, key, v.open);
                return (
                  <tr key={key}>
                    <td className="py-1.5">{tr(`component.${key}`)}</td>
                    <td className="py-1.5 text-right">{shown === null ? (ex[key] === null ? tr("na") : tr("pending")) : ROUND(shown, l, 1)}</td>
                    <td className="py-1.5 text-right">{weight === 0 ? "—" : `${ROUND(weight * 100, l, 1)} %`}</td>
                    <td className="py-1.5 text-right">{shown === null || points === null ? "—" : ROUND(points, l, 1)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-1.5">{tr("title")}</td>
                <td className="py-1.5 text-right" colSpan={3}>
                  {v.open && ex.rating !== null ? `${ex.rating}${ex.provisional ? ` (${tr("provisionalShort")})` : ""}` : t("exampleHidden")}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-text-2">{t("exampleNote")}</p>
        </section>
      )}

      <section aria-labelledby="m-limits" className={section}>
        <h2 id="m-limits" className="text-title">{t("limitsTitle")}</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-body-sm text-text-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>{t(`limits.${i}`)}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
