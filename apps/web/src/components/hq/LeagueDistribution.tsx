import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { formatNumber, type Locale } from "@/lib/format";
import { league as leagueOf, type LeagueTier } from "@/lib/league";
import { LeagueBadge } from "./LeagueBadge";

const BAR: Record<LeagueTier, string> = {
  bronze: "bg-league-bronze/60",
  silver: "bg-league-silver/60",
  gold: "bg-league-gold/60",
  platinum: "bg-league-platinum/60",
  diamond: "bg-league-diamond/60",
  ruby: "bg-league-ruby/60",
};

/** Joueurs du top 10 000 par division (ligue donnée par l'API), la division du joueur cerclée en Volt. */
export function LeagueDistribution({ counts, highlight, className }: { counts: Array<{ league: number; count: number }>; highlight: number | null; className?: string }) {
  const t = useTranslations("profile");
  const locale = useLocale() as Locale;
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <ul className={cn("grid gap-1.5", className)}>
      {[...counts].reverse().map((x) => {
        const lg = leagueOf(x.league);
        const mine = x.league === highlight;
        return (
          <li key={x.league} className={cn("grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2 rounded-md px-1 py-0.5 text-body-sm", mine && "ring-2 ring-accent")}>
            <LeagueBadge leagueNumber={x.league} />
            <span className="h-3 overflow-hidden rounded-sm bg-surface-raised">
              <span className={cn("block h-full rounded-sm", lg ? BAR[lg.tier] : "bg-text-3")} style={{ width: `${(x.count / max) * 100}%` }} />
            </span>
            <span className="text-right tnum text-text-2">
              {mine && <span className="sr-only">{t("youAreHere")} </span>}
              {formatNumber(x.count, locale)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
