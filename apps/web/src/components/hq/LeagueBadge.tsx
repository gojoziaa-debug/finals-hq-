import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { league as leagueOf, type LeagueTier } from "@/lib/league";

/** Classes écrites en entier pour que Tailwind les garde (pas de concaténation dynamique). */
const TIER_CLASSES: Record<LeagueTier, string> = {
  bronze: "bg-league-bronze/15 text-league-bronze-ink border-league-bronze/40",
  silver: "bg-league-silver/15 text-league-silver-ink border-league-silver/40",
  gold: "bg-league-gold/15 text-league-gold-ink border-league-gold/40",
  platinum: "bg-league-platinum/15 text-league-platinum-ink border-league-platinum/40",
  diamond: "bg-league-diamond/15 text-league-diamond-ink border-league-diamond/40",
  ruby: "bg-league-ruby/15 text-league-ruby-ink border-league-ruby/40",
};

const SIZES = {
  sm: "h-5 min-w-7 px-1.5 text-[11px] font-semibold",
  md: "h-7 px-2.5 font-display text-[17px] font-semibold tracking-wide",
  lg: "h-10 px-3.5 font-display text-display-md",
} as const;

/**
 * Ligue et division. sm (tableaux) abrège en « D2 » avec le nom complet en title et pour les lecteurs d'écran ;
 * md et lg écrivent le nom du jeu. Fond league-x-soft, texte league-x-ink. Ligue inconnue : badge neutre « — ».
 */
export function LeagueBadge({ leagueNumber, size = "sm", className }: { leagueNumber: number | null | undefined; size?: keyof typeof SIZES; className?: string }) {
  const t = useTranslations("league");
  const l = leagueOf(leagueNumber);
  if (!l) {
    return (
      <span title={t("unknown")} className={cn("inline-flex items-center justify-center rounded-full border border-border text-text-2", SIZES[size], className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t("unknown")}</span>
      </span>
    );
  }
  return (
    <span title={l.name} className={cn("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border tnum", TIER_CLASSES[l.tier], SIZES[size], className)}>
      {size === "sm" ? (
        <>
          <span aria-hidden="true">{l.short}</span>
          <span className="sr-only">{l.name}</span>
        </>
      ) : (
        l.name
      )}
    </span>
  );
}
