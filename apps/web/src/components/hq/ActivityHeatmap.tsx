import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { formatDate, type Locale } from "@/lib/format";
import type { HeatDay } from "@/lib/profile";

/** Cinq niveaux d'opacité de Volt (10, 30, 55, 80, 100 %), classes écrites en entier pour Tailwind. */
const LEVELS = ["bg-surface-raised", "bg-accent/10", "bg-accent/30", "bg-accent/55", "bg-accent/80", "bg-accent"];
const HATCH = "bg-[repeating-linear-gradient(135deg,rgb(var(--border))_0_2px,transparent_2px_5px)]";

/**
 * Jours où le RS a changé, en colonnes de semaines (lundi en haut). Les jours d'avant la collecte sont hachurés :
 * on ne sait pas, ce n'est pas « inactif ». Téléphone : 5 semaines ; à partir de lg : 13 semaines.
 */
export function ActivityHeatmap({ days, className }: { days: HeatDay[]; className?: string }) {
  const t = useTranslations("profile");
  const locale = useLocale() as Locale;
  // Aligne la première colonne sur un lundi.
  const first = days[0] ? new Date(`${days[0].day}T00:00:00Z`).getUTCDay() : 1;
  const pad = (first + 6) % 7;
  const cells: Array<HeatDay | null> = [...Array<null>(pad).fill(null), ...days];
  const weeks: Array<Array<HeatDay | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const label = (d: HeatDay) =>
    d.level < 0 ? t("heatBefore", { date: formatDate(new Date(`${d.day}T00:00:00Z`), locale) }) : t("heatDay", { date: formatDate(new Date(`${d.day}T00:00:00Z`), locale), count: d.changes });
  return (
    <div className={className}>
      <div className="flex gap-1" role="list" aria-label={t("heatLabel")}>
        {weeks.map((w, wi) => (
          <div key={wi} className={cn("grid grid-rows-7 gap-1", wi < weeks.length - 5 && "hidden lg:grid")} role="presentation">
            {w.map((d, di) =>
              d ? (
                <span key={d.day} role="listitem" title={label(d)} aria-label={label(d)} className={cn("h-4 w-4 rounded-[3px] lg:h-3.5 lg:w-3.5", d.level < 0 ? HATCH : LEVELS[d.level])} />
              ) : (
                <span key={`pad-${di}`} aria-hidden="true" className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-2">
        <span className="inline-flex items-center gap-1">
          {t("less")}
          {LEVELS.slice(1).map((c) => (
            <span key={c} aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", c)} />
          ))}
          {t("more")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", HATCH)} />
          {t("heatNoData")}
        </span>
      </div>
    </div>
  );
}
