import { getTranslations } from "next-intl/server";
import { InfoChip } from "@/components/hq/InfoChip";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { ComponentBar, RatingGauge, RatingRadar } from "@/components/hq/RatingVisuals";
import { Link } from "@/i18n/navigation";
import { formatDate, formatDecimal, formatNumber, type Locale } from "@/lib/format";
import { CALIBRATION_FREE, COMPONENTS, contributions, WEIGHTS, type RatingVisibility } from "@/lib/rating";
import type { PlayerRatingData, RatingComponentKey } from "@/lib/types";

/** Valeur d'une composante telle qu'affichée : masquée tant que la note est en calibration, sauf niveau, pic, legacy. */
export function shownValue(r: PlayerRatingData, key: RatingComponentKey, open: boolean): number | null {
  if (!open && !CALIBRATION_FREE.has(key)) return null;
  return r[key];
}

/**
 * Bloc Rating du profil (sprint 5, phase E) : jauge, radar, composantes pondérées, état de calibration.
 * Pendant la semaine de calibration, la note et les deux composantes qui dépendent des références de population
 * (Momentum, Consistance) restent cachées ; Niveau, Pic et Legacy, qui n'en dépendent pas, sont déjà affichés.
 */
export async function RatingPanel({ rating, visibility, locale, renderedAt }: { rating: PlayerRatingData; visibility: RatingVisibility; locale: Locale; renderedAt: string }) {
  const t = await getTranslations("rating");
  const open = visibility.open;
  const readyLabel = visibility.readyAt ? formatDate(new Date(visibility.readyAt), locale) : "—";
  const parts = contributions(rating);
  const axes = COMPONENTS.map((key) => ({ label: t(`component.${key}`), value: shownValue(rating, key, open) }));
  const progress = Math.min(1, visibility.observedDays / visibility.calibrationDays);
  return (
    <section aria-labelledby="rating" className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="rating" className="text-title">{t("title")}</h2>
        {!open && <InfoChip tone="info" className="whitespace-nowrap" hint={t("calibratingHint", { date: readyLabel })}>{t("calibrating")}</InfoChip>}
        {open && visibility.preview && <InfoChip tone="warning" className="whitespace-nowrap" hint={t("previewHint")}>{t("preview")}</InfoChip>}
        {open && rating.provisional && <InfoChip tone="neutral" className="whitespace-nowrap" hint={t("provisionalHint")}>{t("provisional")}</InfoChip>}
        {open && rating.hotStreak && <InfoChip tone="accent" className="whitespace-nowrap normal-case">{t("hotStreak")}</InfoChip>}
        {rating.anomalies > 0 && <InfoChip tone="warning" className="whitespace-nowrap normal-case" hint={t("anomalyHint")}>{t("anomaly", { count: rating.anomalies })}</InfoChip>}
      </div>

      <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
        <div>
          <RatingGauge
            value={open ? rating.rating : null}
            label={open && rating.rating !== null ? t("gaugeLabel", { value: rating.rating }) : t("gaugeCalibrating")}
            sub={open ? (rating.position ? t("position", { position: formatNumber(rating.position, locale) }) : undefined) : t("visibleOn", { date: readyLabel })}
          />
          {!visibility.calibrated && (
            <div className="mx-auto mt-3 max-w-[260px]">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuemin={0} aria-valuemax={visibility.calibrationDays} aria-valuenow={Math.round(visibility.observedDays * 10) / 10} aria-label={t("progressLabel")}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-center text-[12px] text-text-2">{t("progress", { days: formatDecimal(Math.floor(visibility.observedDays * 10) / 10, locale), total: visibility.calibrationDays })}</p>
            </div>
          )}
        </div>
        <RatingRadar axes={axes} label={t("radarLabel")} className="mx-auto" />
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3">
        {parts.map(({ key }) => {
          const value = shownValue(rating, key, open);
          const pending = value === null && rating[key] !== null;
          return (
            <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="text-body-sm font-semibold">
                {t(`component.${key}`)} <span className="font-normal text-text-2">· {formatDecimal(WEIGHTS[key] * 100, locale)} %</span>
              </span>
              <span className="text-right font-display text-[19px] font-bold tnum">{value === null ? <span className="text-body-sm font-normal text-text-2">{pending ? t("pending") : t("na")}</span> : formatDecimal(value, locale)}</span>
              <ComponentBar value={value} className="col-span-2" />
              <span className="col-span-2 text-[12px] text-text-2">{t(`componentHint.${key}`, { days: rating.activeDays30 })}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[12px] text-text-2">
        {open ? t("footerOpen", { version: rating.run.version }) : t("footerCalibrating", { date: readyLabel })} {t("weightNote")}{" "}
        {t("computed")} <RelativeTime iso={rating.run.computedAt} now={renderedAt} />
        {" · "}
        <Link href="/methodology" className="font-semibold text-accent-ink underline">{t("methodLink")}</Link>
      </p>
    </section>
  );
}
